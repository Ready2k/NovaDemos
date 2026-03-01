#!/usr/bin/env python3
"""
scripts/delta_seed.py

Generates synthetic UK bank transaction data for every account in
db_historicalTransactions using Claude, covering the gap (delta) between
the last recorded transaction date and today, then inserts the result into
DynamoDB.

Run it periodically (daily/weekly) to keep demo data feeling current.

Requirements:
    pip install anthropic boto3

Authentication:
    AWS  — uses your normal boto3 credential chain (env vars, ~/.aws/credentials,
           IAM role, etc.)
    LLM  — set ANTHROPIC_API_KEY, OR pass --use-bedrock to call Claude via
           Bedrock using your existing AWS credentials (no extra API key needed).

Usage:
    python3 scripts/delta_seed.py                        # all accounts
    python3 scripts/delta_seed.py --account 12345678     # one account
    python3 scripts/delta_seed.py --dry-run              # preview, no writes
    python3 scripts/delta_seed.py --dry-run --verbose    # print every transaction
    python3 scripts/delta_seed.py --use-bedrock          # use Bedrock instead of API key
    python3 scripts/delta_seed.py --model claude-haiku-4-5-20251001  # cheaper model
    python3 scripts/delta_seed.py --include-frozen        # include FROZEN accounts (default: skip)
"""

import argparse
import json
import logging
import os
import sys
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

import boto3
from botocore.exceptions import ClientError

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(format="%(levelname)-8s %(message)s", level=logging.INFO)
log = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
REGION          = "us-east-1"
TXN_TABLE       = "db_historicalTransactions"
CUSTOMER_TABLE  = "demo_bank_customers"
DEFAULT_MODEL   = "claude-sonnet-4-6"          # Anthropic API model ID
BEDROCK_MODEL   = "us.anthropic.claude-sonnet-4-6"                 # Bedrock inference profile ID
CONTEXT_WINDOW  = 40    # last N transactions sent to Claude as spending-pattern context
MAX_TOKENS      = 8096

# ── DynamoDB clients ──────────────────────────────────────────────────────────
dynamodb       = boto3.resource("dynamodb", region_name=REGION)
txn_table      = dynamodb.Table(TXN_TABLE)
customer_table = dynamodb.Table(CUSTOMER_TABLE)


# ══════════════════════════════════════════════════════════════════════════════
# DynamoDB helpers
# ══════════════════════════════════════════════════════════════════════════════

def get_all_accounts() -> list[dict]:
    resp = txn_table.scan()
    return resp.get("Items", [])


def get_customer_profile(account_id: int, sort_code: int) -> dict:
    try:
        resp = customer_table.get_item(
            Key={"accountId": Decimal(account_id), "sortCode": Decimal(sort_code)}
        )
        return resp.get("Item", {})
    except ClientError as e:
        log.warning("Could not fetch customer profile: %s", e)
        return {}


def get_last_transaction_date(transactions: list) -> str | None:
    dates = [str(t["date"]) for t in transactions if t.get("date")]
    return max(dates) if dates else None


def append_transactions(account_id: int, sort_code: int, new_txns: list[dict]) -> int:
    """
    Append validated transactions to the account's DynamoDB item.
    Returns the number of records written.
    """
    if not new_txns:
        return 0

    dynamo_items = []
    for t in new_txns:
        try:
            dynamo_items.append({
                "date":        t["date"],
                "description": t["description"],
                "amount":      Decimal(str(round(float(t["amount"]), 2))),
            })
        except (InvalidOperation, ValueError, KeyError) as e:
            log.warning("Skipping malformed transaction %s — %s", t, e)

    if dynamo_items:
        txn_table.update_item(
            Key={
                "accountId": Decimal(str(account_id)),
                "sortCode":  Decimal(str(sort_code)),
            },
            UpdateExpression="SET transactions = list_append(transactions, :t)",
            ExpressionAttributeValues={":t": dynamo_items},
        )
    return len(dynamo_items)


# ══════════════════════════════════════════════════════════════════════════════
# LLM helpers
# ══════════════════════════════════════════════════════════════════════════════

def build_claude_client(use_bedrock: bool, model: str):
    """
    Returns (client, model_id) for the requested backend.
    - use_bedrock=True  → anthropic.AnthropicBedrock (uses AWS creds, no API key)
    - use_bedrock=False → anthropic.Anthropic (needs ANTHROPIC_API_KEY)
    """
    try:
        import anthropic
    except ImportError:
        log.error("anthropic package not found. Run: pip install anthropic")
        sys.exit(1)

    if use_bedrock:
        client = anthropic.AnthropicBedrock(aws_region=REGION)
        model_id = BEDROCK_MODEL
        log.info("Using Claude via Amazon Bedrock (%s)", model_id)
    else:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            log.error(
                "ANTHROPIC_API_KEY is not set. "
                "Export it or use --use-bedrock to call via AWS."
            )
            sys.exit(1)
        client = anthropic.Anthropic(api_key=api_key)
        model_id = model
        log.info("Using Claude via Anthropic API (%s)", model_id)

    return client, model_id


SYSTEM_PROMPT = """
You are a UK bank transaction data generator for a software demo.

Your sole job is to produce realistic synthetic transactions that match the spending
behaviour shown in the customer's recent history. Follow these rules exactly:

1.  Return ONLY a valid JSON array — no markdown fences, no prose, nothing else.
2.  Every object in the array must have exactly three keys:
      "date"        — string in YYYY-MM-DD format
      "description" — string matching UK bank statement style (e.g. "Tesco Express",
                      "SO: Landlord Rent", "TFL-Travel-CHG", "EE Limited DD")
      "amount"      — number: negative for debits, positive for credits
3.  Dates must fall within the requested range (inclusive). Do not go outside it.
4.  Match the merchant names, frequencies, and approximate amounts from the history.
    Introduce small realistic variation (±10–15%) in variable spend amounts.
5.  Fixed monthly direct debits and standing orders must appear on the same calendar
    day each month as they do in history (e.g. rent on the 1st, mobile on the 5th).
6.  Generate multiple transactions on some days (e.g. commute + coffee + groceries)
    and zero transactions on others — this is realistic.
7.  Salary, pension, or dividend credits must appear on the same day each month.
8.  Keep amounts plausible for UK prices in GBP.
9.  If the account has a vulnerability score > 0, do not add gambling or high-risk
    transactions — keep spending conservative and essential.
10. Do not invent new merchants that do not appear in the history unless they are
    obvious substitutes (e.g. a different supermarket on a one-off basis).
""".strip()


def build_prompt(
    account_id: int,
    sort_code: int,
    customer_profile: dict,
    recent_txns: list[dict],
    from_date: str,
    to_date: str,
) -> str:
    # Sort recent transactions chronologically for the prompt
    sorted_recent = sorted(recent_txns, key=lambda t: str(t.get("date", "")))[-CONTEXT_WINDOW:]

    lines = [
        f"  {t['date']}  {float(t.get('amount', 0)):>10.2f}  {t.get('description', '')}"
        for t in sorted_recent
    ]
    history_block = "\n".join(lines) if lines else "  (no history available)"

    name   = customer_profile.get("customer_name", "Unknown")
    status = customer_profile.get("account_status", "OPEN")
    vunl   = int(customer_profile.get("vulnerability_score", 0))

    return f"""
CUSTOMER
  Account ID      : {account_id}
  Sort Code       : {sort_code}
  Name            : {name}
  Account status  : {status}
  Vulnerability   : {vunl}/10{"  ← keep spending conservative, no gambling" if vunl > 0 else ""}

RECENT TRANSACTION HISTORY (last {len(sorted_recent)} entries — use as pattern reference only)
  Date          Amount       Description
{history_block}

TASK
Generate realistic UK bank transactions for the period {from_date} to {to_date} (inclusive).
Base all spending behaviour strictly on the patterns visible in the history above.
Return a JSON array only.
""".strip()


def call_llm(client, model_id: str, prompt: str) -> list[dict]:
    message = client.messages.create(
        model=model_id,
        max_tokens=MAX_TOKENS,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = message.content[0].text.strip()

    # Strip accidental markdown code fences
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
    if raw.endswith("```"):
        raw = raw.rsplit("```", 1)[0]
    raw = raw.strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        # Claude may refuse to generate data (e.g. for FROZEN/suspicious accounts).
        # Surface the first 300 chars of the response so the caller can decide.
        preview = raw[:300].replace("\n", " ")
        raise ValueError(f"Claude did not return JSON. Response: {preview}") from e

    if not isinstance(data, list):
        raise ValueError(f"Expected a JSON array, got {type(data).__name__}")

    # Basic structure validation
    validated = []
    for item in data:
        if not isinstance(item, dict):
            continue
        if not all(k in item for k in ("date", "description", "amount")):
            log.warning("Skipping transaction missing keys: %s", item)
            continue
        validated.append(item)

    return validated


# ══════════════════════════════════════════════════════════════════════════════
# Per-account processing
# ══════════════════════════════════════════════════════════════════════════════

def process_account(
    item: dict,
    client,
    model_id: str,
    dry_run: bool,
    verbose: bool,
    skip_frozen: bool,
) -> dict:
    """
    Process one account. Returns a summary dict with keys:
      account_id, status, gap_days, generated, inserted, skipped_reason
    """
    account_id = int(item["accountId"])
    sort_code  = int(item["sortCode"])
    today      = date.today()
    summary    = {
        "account_id":     account_id,
        "sort_code":      sort_code,
        "status":         "ok",
        "gap_days":       0,
        "generated":      0,
        "inserted":       0,
        "skipped_reason": None,
    }

    transactions = item.get("transactions", [])
    last_date_str = get_last_transaction_date(transactions)

    if not last_date_str:
        summary["status"] = "skipped"
        summary["skipped_reason"] = "no existing transactions"
        return summary

    last_date = date.fromisoformat(last_date_str)
    from_date = last_date + timedelta(days=1)

    if from_date > today:
        summary["status"] = "up_to_date"
        summary["skipped_reason"] = f"last txn {last_date_str} is already at/beyond today"
        return summary

    gap_days = (today - from_date).days + 1
    summary["gap_days"] = gap_days
    log.info("  Gap: %d days  (%s → %s)", gap_days, from_date, today)

    # Fetch customer profile (used for persona context and vulnerability check)
    profile = get_customer_profile(account_id, sort_code)

    if not skip_frozen and profile.get("account_status") == "FROZEN":
        summary["status"] = "skipped"
        summary["skipped_reason"] = "account is FROZEN (use --include-frozen to override)"
        return summary

    # Build prompt and call Claude
    prompt = build_prompt(
        account_id, sort_code, profile,
        list(transactions), str(from_date), str(today),
    )

    log.info("  Calling Claude (%s) …", model_id)
    new_txns = call_llm(client, model_id, prompt)

    # Safety filter: only keep transactions within the requested date range
    in_range = [
        t for t in new_txns
        if str(from_date) <= str(t.get("date", "")) <= str(today)
    ]
    out_of_range = len(new_txns) - len(in_range)
    if out_of_range:
        log.warning("  Dropped %d out-of-range transactions from Claude's response", out_of_range)

    summary["generated"] = len(in_range)

    if verbose or dry_run:
        sorted_new = sorted(in_range, key=lambda t: str(t.get("date", "")))
        for t in sorted_new:
            print(f"    {t['date']}  {float(t['amount']):>10.2f}  {t['description']}")

    if dry_run:
        summary["status"] = "dry_run"
        log.info("  Dry-run: %d transactions generated (not written)", len(in_range))
    else:
        written = append_transactions(account_id, sort_code, in_range)
        summary["inserted"] = written
        log.info("  Inserted %d transactions ✓", written)

    return summary


# ══════════════════════════════════════════════════════════════════════════════
# Entry point
# ══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="Delta-seed DynamoDB transaction data via Claude",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--account", type=int, metavar="ACCOUNT_ID",
        help="Process a single account ID (default: all accounts)",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Generate and print transactions but do NOT write to DynamoDB",
    )
    parser.add_argument(
        "--verbose", action="store_true",
        help="Print every generated transaction to stdout",
    )
    parser.add_argument(
        "--use-bedrock", action="store_true",
        help="Call Claude via Amazon Bedrock (uses AWS creds, no ANTHROPIC_API_KEY needed)",
    )
    parser.add_argument(
        "--model", default=DEFAULT_MODEL, metavar="MODEL_ID",
        help=f"Anthropic model ID to use (default: {DEFAULT_MODEL})",
    )
    parser.add_argument(
        "--include-frozen", action="store_true",
        help="Also process FROZEN accounts (default: FROZEN accounts are skipped)",
    )
    args = parser.parse_args()

    today = date.today()
    log.info("Delta seed — today: %s", today)
    if args.dry_run:
        log.info("DRY RUN — no data will be written to DynamoDB")

    # Build LLM client
    client, model_id = build_claude_client(args.use_bedrock, args.model)

    # Load accounts
    all_items = get_all_accounts()
    if args.account:
        all_items = [i for i in all_items if int(i["accountId"]) == args.account]
        if not all_items:
            log.error("Account %d not found in %s", args.account, TXN_TABLE)
            sys.exit(1)

    log.info("Processing %d account(s)\n", len(all_items))

    results = []
    for item in all_items:
        account_id = int(item["accountId"])
        sort_code  = int(item["sortCode"])
        log.info("Account %d / sort %d", account_id, sort_code)

        try:
            summary = process_account(
                item, client, model_id,
                dry_run=args.dry_run,
                verbose=args.verbose,
                skip_frozen=not args.include_frozen,
            )
        except Exception as e:
            log.error("  FAILED — %s", e, exc_info=True)
            summary = {
                "account_id": account_id, "sort_code": sort_code,
                "status": "error", "gap_days": 0, "generated": 0,
                "inserted": 0, "skipped_reason": str(e),
            }
        results.append(summary)
        print()

    # ── Summary table ────────────────────────────────────────────────────────
    print("─" * 70)
    print(f"{'Account':<12} {'Status':<12} {'Gap days':>9} {'Generated':>10} {'Inserted':>9}")
    print("─" * 70)
    for r in results:
        note = f"  ({r['skipped_reason']})" if r.get("skipped_reason") else ""
        print(
            f"{r['account_id']:<12} {r['status']:<12} {r['gap_days']:>9} "
            f"{r['generated']:>10} {r['inserted']:>9}{note}"
        )
    print("─" * 70)

    total_inserted = sum(r["inserted"] for r in results)
    if not args.dry_run:
        log.info("Total transactions inserted: %d", total_inserted)
    else:
        log.info("Dry run complete — %d transactions would be inserted", sum(r["generated"] for r in results))


if __name__ == "__main__":
    main()
