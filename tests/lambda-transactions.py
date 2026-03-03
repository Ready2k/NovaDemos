import logging
import json
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta, date

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# --- ACCOUNT REGISTRY ---
ACCOUNT_DETAILS: Dict[str, Dict[str, Any]] = {
    "1234567890": {"sortCode": "112233", "balance": 5421.75},
    "12345678":   {"sortCode": "112233", "balance": 1900.00},
    "0987654321": {"sortCode": "445566", "balance": 150000.00},
    "1122334455": {"sortCode": "990011", "balance": 98.10},
}

# Merchant pool used to generate rolling transaction data
_MERCHANT_POOL = [
    ("Card Payment",   "TESCO STORES",         -67.43),
    ("Card Payment",   "AMAZON.CO.UK",          -89.99),
    ("Card Payment",   "STARBUCKS",              -4.85),
    ("Card Payment",   "UBER TRIP",             -18.50),
    ("Direct Debit",   "NETFLIX SUBSCRIPTION",  -15.99),
    ("Card Payment",   "MARKS AND SPENCER",     -42.10),
    ("Card Payment",   "SAINSBURYS",            -55.20),
    ("ATM Withdrawal", "BARCLAYS ATM",         -100.00),
    ("Faster Payment", "FROM JOHN SMITH",       250.00),
    ("Direct Debit",   "SKY BROADBAND",         -35.00),
    ("Standing Order", "RENT PAYMENT",        -1200.00),
]

# Cache generated data per account so cold-start cost is paid once
_TX_CACHE: Dict[str, List[Dict[str, Any]]] = {}


def _generate_transactions(account_id: str) -> List[Dict[str, Any]]:
    """
    Generate 18 months of rolling synthetic transaction data relative to today.
    Using today's date means date-range filtering always returns meaningful results
    regardless of when the demo runs.
    """
    today = date.today()
    balance = ACCOUNT_DETAILS.get(account_id, {}).get("balance", 1000.00)
    transactions = []

    for i in range(540):          # ~18 months back
        tx_date = today - timedelta(days=i)

        # Salary credit on the 1st of each month
        if tx_date.day == 1:
            transactions.append({
                "date":        tx_date.isoformat(),
                "type":        "Salary",
                "description": "ACME CORP LTD",
                "amount":      2500.00,
                "balance":     round(balance, 2),
            })
            balance += 2500.00

        # One merchant transaction every 2 days, cycling through the pool
        if i % 2 == 0:
            tx_type, desc, amount = _MERCHANT_POOL[i % len(_MERCHANT_POOL)]
            transactions.append({
                "date":        tx_date.isoformat(),
                "type":        tx_type,
                "description": desc,
                "amount":      amount,
                "balance":     round(balance, 2),
            })
            balance -= amount       # amounts are already signed; subtract to track

    transactions.sort(key=lambda t: t["date"], reverse=True)
    return transactions


def _get_transactions(account_id: str) -> List[Dict[str, Any]]:
    if account_id not in _TX_CACHE:
        _TX_CACHE[account_id] = _generate_transactions(account_id)
    return _TX_CACHE[account_id]


def get_transaction_history(
    account_id: str,
    sort_code: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> str:
    """Return filtered transaction history for a bank account."""
    account_info = ACCOUNT_DETAILS.get(account_id)
    if account_info is None:
        return f"Could not find an account with ID {account_id}."

    if account_info.get("sortCode") != sort_code:
        return "The account ID and sort code combination is incorrect."

    today = date.today()

    try:
        end_dt   = datetime.strptime(end_date,   "%Y-%m-%d").date() if end_date   else today
        start_dt = datetime.strptime(start_date, "%Y-%m-%d").date() if start_date else today - timedelta(days=60)
    except ValueError as exc:
        return f"Invalid date format: {exc}. Expected YYYY-MM-DD."

    all_txs = _get_transactions(account_id)
    filtered = [
        t for t in all_txs
        if start_dt <= datetime.strptime(t["date"], "%Y-%m-%d").date() <= end_dt
    ]

    if not filtered:
        return (
            f"No transactions found for account {account_id} "
            f"between {start_dt} and {end_dt}."
        )

    total_in  = sum(t["amount"] for t in filtered if t["amount"] > 0)
    total_out = sum(t["amount"] for t in filtered if t["amount"] < 0)
    net       = total_in + total_out

    lines = [
        f"Transactions for account {account_id} ({start_dt} to {end_dt}): "
        f"{len(filtered)} found | "
        f"In: +£{total_in:,.2f} | Out: -£{abs(total_out):,.2f} | Net: £{net:+,.2f}",
        "",
    ]

    for t in filtered[:20]:
        sign = "+" if t["amount"] >= 0 else "-"
        lines.append(
            f"{t['date']} | {t['type']} | {t['description']} | "
            f"{sign}£{abs(t['amount']):,.2f}"
        )

    if len(filtered) > 20:
        lines.append(f"... and {len(filtered) - 20} more transactions in this period.")

    return "\n".join(lines)


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """AWS Lambda handler for AgentCore Gateway MCP calls — Transaction History."""
    try:
        logger.info("Received event: %s", json.dumps(event, indent=2))

        account_id = event.get("accountId")
        sort_code  = event.get("sortCode")
        start_date = event.get("startDate")
        end_date   = event.get("endDate")

        logger.info(
            "Parameters — accountId: %s, sortCode: %s, startDate: %s, endDate: %s",
            account_id, sort_code, start_date, end_date,
        )

        if not account_id or not sort_code:
            missing = []
            if not account_id: missing.append("'accountId'")
            if not sort_code:  missing.append("'sortCode'")
            return {
                "statusCode": 400,
                "body": f"Missing required parameters: {', '.join(missing)}.",
            }

        result = get_transaction_history(account_id, sort_code, start_date, end_date)
        logger.info("Result length: %d characters", len(result))
        return {"statusCode": 200, "body": result}

    except Exception as exc:
        logger.error("Unexpected error: %s", str(exc), exc_info=True)
        return {"statusCode": 500, "body": "Internal error fetching transaction history."}
