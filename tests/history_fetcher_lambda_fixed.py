# filename: history_fetcher_lambda.py
import logging
import json
from typing import Dict, Any, List
from http import HTTPStatus

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# --- MOCK DATA ---
# Combined data structure for verification
ACCOUNT_DATA: Dict[str, Dict[str, Any]] = {
    "1234567890": {
        "sortCode": "112233",
        "transactions": [
            {"date": "2025-12-04", "description": "Coffee Shop", "amount": -4.50},
            {"date": "2025-12-03", "description": "Online Transfer", "amount": -1500.00},
            {"date": "2025-12-02", "description": "Paycheck Deposit", "amount": 2500.00},
            {"date": "2025-12-01", "description": "Grocery Store", "amount": -115.20},
        ]
    },
    "0987654321": {
        "sortCode": "445566",
        "transactions": [
            {"date": "2025-12-04", "description": "Investment Purchase", "amount": -50000.00},
            {"date": "2025-12-03", "description": "Dividend Credit", "amount": 1200.00},
        ]
    }
}

def get_transaction_history_logic(account_id: str, sort_code: str) -> str:
    """Core logic to fetch and summarize history, requiring sort code verification."""
    account_info = ACCOUNT_DATA.get(account_id)
    if account_info is None:
        return f"I could not find an account with the ID {account_id}."

    # 🛑 CRITICAL: Validate the sort code against the mock data
    if account_info.get("sortCode") != sort_code:
        return "The provided account ID and sort code combination is incorrect. Please verify your details."

    # If verification passes, process the transactions
    history = account_info.get("transactions")
    if history:
        transaction_list = []
        for tx in history:
            amount_str = f"${abs(tx['amount']):,.2f}"
            tx_type = "Debit" if tx['amount'] < 0 else "Credit"
            transaction_list.append(f"- {tx['date']}: {tx['description']} ({tx_type} of {amount_str})")
        
        summary = "\n".join(transaction_list)
        return f"Here is the recent transaction history for account {account_id} (Sort Code: {sort_code}):\n\n{summary}"
    else:
        return f"I found no recent transactions for account ID {account_id}."

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """AWS Lambda handler for AgentCore Gateway MCP calls - Transaction History."""
    try:
        logger.info('Received event: %s', json.dumps(event, indent=2))
        
        # AgentCore Gateway sends parameters directly in the event
        account_id = event.get('accountId')
        sort_code = event.get('sortCode')
        
        logger.info('Extracted parameters - accountId: %s, sortCode: %s', account_id, sort_code)
        
        if account_id and sort_code:
            result_message = get_transaction_history_logic(account_id, sort_code)
            logger.info('Transaction history result: %s', result_message[:100] + '...' if len(result_message) > 100 else result_message)
            
            # Return success response for AgentCore Gateway
            return {
                'statusCode': 200,
                'body': result_message
            }
        else:
            # Handle missing parameters
            missing = []
            if not account_id: missing.append("'accountId'")
            if not sort_code: missing.append("'sortCode'")
            error_message = f"Error: The following required parameters are missing: {', '.join(missing)}."
            
            logger.warning('Missing parameters: %s', error_message)
            
            return {
                'statusCode': 400,
                'body': error_message
            }
            
    except Exception as e:
        logger.error('Unexpected error in Lambda execution: %s', str(e), exc_info=True)
        
        return {
            'statusCode': 500,
            'body': 'An internal server error occurred while processing the transaction history request.'
        }