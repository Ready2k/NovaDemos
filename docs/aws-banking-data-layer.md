# AWS Banking Data Layer — Asset Documentation

Documented: 2026-03-01 | Account: 388660028061 | Region: us-east-1

This document covers the DynamoDB tables, Lambda functions, IAM roles, and KMS keys that
form the banking demo data layer used by the Voice S2S AgentCore integration.

---

## CloudFormation

The file `aws/banking-data-layer.yaml` will rebuild all assets listed below from scratch.

### Deploy (fresh account / disaster recovery)

```bash
aws cloudformation deploy \
  --template-file aws/banking-data-layer.yaml \
  --stack-name voice-s2s-banking-data \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

After deploy you must:
1. **Re-seed table data** — run the Python seed scripts in `tests/` to restore customers,
   balances, merchant aliases, and transaction history.
2. **Re-register Lambdas in AgentCore** — open Bedrock → AgentCore → your agent, and
   update each action group to point at the new Lambda ARNs from the CFN Outputs.

### Deploy a parallel stack (dev/test)

```bash
aws cloudformation deploy \
  --template-file aws/banking-data-layer.yaml \
  --stack-name voice-s2s-banking-data-dev \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides NameSuffix=-dev \
  --region us-east-1
```

> **Note:** `NameSuffix` only affects Lambda and IAM role names. DynamoDB table names
> are fixed — two stacks cannot coexist in the same account/region without manually
> editing the template to add a prefix to table names as well.

---

## DynamoDB Tables

All tables use **PAY_PER_REQUEST** billing and the **STANDARD** table class.
KMS encryption uses the AWS-managed `aws/dynamodb` key — no customer CMK.

| Table | PK | SK | Used by |
|-------|----|----|---------|
| `db_balance` | `accountId` (N) | `sortCode` (N) | get_Balance |
| `db_historicalTransactions` | `accountId` (N) | `sortCode` (N) | get_TransactionalHistory |
| `demo_bank_customers` | `accountId` (N) | `sortCode` (N) | perform_idv_check |
| `demo_bank_disputes` | `accountId` (S) | `caseId` (S) | create_dispute_case, update_dispute_case, manage_recent_interactions |
| `demo_bank_interactions` | `accountId` (S) | `timestamp` (S) | manage_recent_interactions |
| `demo_bank_merchants` | `statementName` (S) | — | lookup_merchant_alias |

### Schema details

**`db_balance`**
```
accountId   Number   PK   8-digit account number
sortCode    Number   SK   6-digit sort code
balance     Number        Current balance in GBP
```

**`db_historicalTransactions`**
```
accountId     Number   PK
sortCode      Number   SK
transactions  List     [ { date: String, description: String, amount: Number } ]
```
Transaction history covers ~6 months. See `tests/seed_dynamo.py` to re-seed.

**`demo_bank_customers`**
```
accountId          Number   PK
sortCode           Number   SK
customer_name      String
account_status     String   e.g. "OPEN", "RESTRICTED"
vulnerability_score Number  0–10 (fed into marker_Vunl in IDV response)
```

**`demo_bank_disputes`**
```
accountId         String   PK   (stored as String for this table)
caseId            String   SK   Format: DSP-XXXXXX
merchantName      String
amount            String
status            String   OPEN | MORE_INFO | RESOLVED | CLOSED
reason            String
createdDate       String
merchantContacted Boolean
isPriorityRefund  Boolean
additionalDetails String   (set on update)
lastUpdatedTime   String   ISO-8601 UTC (set on update)
```

**`demo_bank_interactions`**
```
accountId   String   PK
timestamp   String   SK   ISO-8601 UTC
sortCode    String
summary     String
outcome     String
```

**`demo_bank_merchants`**
```
statementName   String   PK   Raw text as it appears on statement
tradingName     String        Recognisable merchant name
category        String        e.g. Groceries, Entertainment, Utilities
```

---

## Lambda Functions

All functions use **128 MB** memory and a **3-second timeout** unless noted.
KMS encryption uses the AWS-managed `aws/lambda` key.

| Live function name | Runtime | DynamoDB access | Handler |
|--------------------|---------|----------------|---------|
| `get_Balance-wfic2` | python3.12 | `db_balance` — GetItem | dummy_lambda.lambda_handler |
| `get_TransactionalHistory-bz1ra` | python3.12 | `db_historicalTransactions` — GetItem | dummy_lambda.lambda_handler |
| `lookup_merchant_alias-jv6ab` | python3.12 | `demo_bank_merchants` — GetItem | dummy_lambda.lambda_handler |
| `create_dispute_case-uf1d1` | python3.12 | `demo_bank_disputes` — GetItem, PutItem, UpdateItem | dummy_lambda.lambda_handler |
| `update_dispute_case-78rrd` | python3.12 | `demo_bank_disputes` — GetItem, UpdateItem, Scan | dummy_lambda.lambda_handler |
| `manage_recent_interactions-jdir8` | python3.12 | `demo_bank_interactions` + `demo_bank_disputes` — GetItem, PutItem, UpdateItem, Query | dummy_lambda.lambda_handler |
| `perform_idv_check-oqpk4` | python3.12 | `demo_bank_customers` — GetItem | dummy_lambda.lambda_handler |
| `get_Time` | python3.14 | none | lambda_function.lambda_handler |

> The random suffixes (`-wfic2`, `-bz1ra`, etc.) are generated by Bedrock AgentCore when
> action group Lambdas are created. On rebuild, new suffixes will be assigned — update
> your AgentCore action groups accordingly.

### Function contracts

#### `get_Balance`
```
Input (AgentCore/direct):  { accountId, sortCode }
Input (Bedrock Agent):     parameters list
Output: { accountId, sortCode, balance, currency: "GBP", message }
```

#### `get_TransactionalHistory`
```
Input:  { accountId | accountNumber, sortCode }
Output: { found, accountId, count, transactions[] }
```

#### `lookup_merchant_alias`
```
Input:  { statementName }
Output: { found, tradingName, category, originalName }
        | { found: false, message }
```

#### `create_dispute_case`
```
Input:  { accountNumber, merchantName, transactionAmount, disputeReason,
          merchantContacted, [expectedAmount], [isPriorityRefund] }
Output: { status: "success", caseId, message }
```

#### `update_dispute_case`
```
Input:  { caseId, status, additionalDetails }
Output: { status: "success", message, timestamp }
Note:   Scans disputes table to resolve accountId from caseId.
```

#### `manage_recent_interactions`
```
Input (RETRIEVE): { action: "RETRIEVE", accountNumber }
Output:           { disputesOpen, activeDisputes[] }

Input (PUBLISH):  { action: "PUBLISH", accountNumber, summary, outcome, [sortCode] }
Output:           { status: "success", message, id }
```

#### `perform_idv_check`
```
Input:  { accountNumber | accountId, sortCode }
Output: { auth_status: "VERIFIED"|"FAILED", account_status, marker_Vunl, customer_name }
```

#### `get_Time`
```
Input:  { [timezone] }   — UTC | GMT | EST | PST | CET | JST (default: UTC)
Output: { statusCode: 200, body: "The current time is ..." }
```

---

## IAM Roles

Each Lambda has its own service role with least-privilege DynamoDB access.
All roles also attach `AWSLambdaBasicExecutionRole` for CloudWatch Logs.
Additionally, Bedrock-managed Lambdas have the
`AmazonBedrockAgentQuickCreateLambdaPolicyProd_*` managed policy attached by the
AgentCore console — this is not recreated by the CFN template and must be re-attached
after registering functions in AgentCore.

| Live role name | Lambda | DynamoDB actions |
|----------------|--------|-----------------|
| `get_Balance-wfic2-role-HQN4TDK753K` | get_Balance | GetItem on db_balance |
| `get_TransactionalHistory-bz1ra-role-HMI2A4T6SR` | get_TransactionalHistory | GetItem on db_historicalTransactions |
| `lookup_merchant_alias-jv6ab-role-V2E9N4AV6DO` | lookup_merchant_alias | GetItem on demo_bank_merchants |
| `create_dispute_case-uf1d1-role-RLGJY2YCFCL` | create_dispute_case | GetItem, PutItem, UpdateItem on demo_bank_disputes |
| `update_dispute_case-78rrd-role-305JHJQK9U7` | update_dispute_case | GetItem, UpdateItem, Scan on demo_bank_disputes |
| `manage_recent_interactions-jdir8-role-9C0NZL38U7` | manage_recent_interactions | GetItem, PutItem, UpdateItem, Query on demo_bank_interactions + demo_bank_disputes |
| `perform_idv_check-oqpk4-role-0SKKZ1WO4S6` | perform_idv_check | GetItem on demo_bank_customers |
| `get_Time-role-qxvex1vk` | get_Time | none |

---

## KMS Keys

No customer-managed keys (CMKs) are used. All encryption uses AWS-managed defaults:

| Key ARN | Purpose |
|---------|---------|
| `arn:aws:kms:us-east-1:388660028061:key/0a3eff3e-c9eb-4ba5-8f8b-b78bebbc71ab` | `aws/dynamodb` — protects all DynamoDB tables |
| `arn:aws:kms:us-east-1:388660028061:key/a474e304-6b5f-4540-8d35-243728e23115` | `aws/lambda` — protects Lambda function code |
| `arn:aws:kms:us-east-1:388660028061:key/7fe116bf-b8b6-4e9d-a0f4-354c49d914f9` | `aws/lex` — present in account, not used by this stack |

AWS-managed keys are created automatically and cannot be deleted or rotated manually.
They do not need to be specified in the CFN template.

---

## Other Lambdas in Account (not part of this stack)

| Function | Runtime | Notes |
|----------|---------|-------|
| `selector_AcctHistTrans-okggu` | python3.12 | Alternate/selector variant, 60s timeout |
| `single_Action-tnaev` | python3.12 | Generic AgentCore action stub |
| `AIGU-LangGraph-Engine` | python3.12 | LangGraph agent engine, 1 GB / 30s timeout |
| `uk-branch-lookup` | python3.11 | Branch/sort code lookup, 256 MB / 30s |
