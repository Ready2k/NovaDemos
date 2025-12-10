import logging
import json
from typing import Dict, Any, List

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# --- MOCK DATA ---
ACCOUNT_DETAILS: Dict[str, Dict[str, Any]] = {
    "1234567890": {"sortCode": "112233", "balance": 5421.75},
    "0987654321": {"sortCode": "445566", "balance": 150000.00},
    "1122334455": {"sortCode": "990011", "balance": 98.10},
}

def get_balance(account_id: str, sort_code: str) -> str:
    """Simulates the business logic to fetch a balance using both account ID and sort code."""
    account_info = ACCOUNT_DETAILS.get(account_id)
    if account_info is None:
        return f"I could not find an account with the ID {account_id}."

    # Validate the sort code against the mock data
    if account_info.get("sortCode") != sort_code:
        return "The provided account ID and sort code combination is incorrect. Please verify your details."

    # If verification passes, return the balance
    balance = account_info["balance"]
    formatted_balance = f"${balance:,.2f}"
    return f"The current balance for account ID {account_id} (Sort Code: {sort_code}) is {formatted_balance}."

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """AWS Lambda handler for AgentCore Gateway MCP calls."""
    try:
        logger.info('Received event: %s', json.dumps(event, indent=2))
        
        # AgentCore Gateway sends parameters directly in the event
        account_id = event.get('accountId')
        sort_code = event.get('sortCode')
        
        logger.info('Extracted parameters - accountId: %s, sortCode: %s', account_id, sort_code)
        
        if account_id and sort_code:
            result_message = get_balance(account_id, sort_code)
            logger.info('Balance check result: %s', result_message)
            
            # Return success response
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
            'body': 'An internal server error occurred while trying to fetch the balance.'
        }