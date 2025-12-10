import logging
import json
from typing import Dict, Any, List
from datetime import datetime, timedelta

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# --- MOCK TRANSACTION DATA ---
ACCOUNT_DETAILS: Dict[str, Dict[str, Any]] = {
    "1234567890": {"sortCode": "112233", "balance": 5421.75},
    "0987654321": {"sortCode": "445566", "balance": 150000.00},
    "1122334455": {"sortCode": "990011", "balance": 98.10},
}

# Mock transaction history data
TRANSACTION_HISTORY: Dict[str, List[Dict[str, Any]]] = {
    "1234567890": [
        {
            "date": "2024-12-10",
            "type": "Direct Debit",
            "description": "NETFLIX SUBSCRIPTION",
            "amount": -15.99,
            "balance": 5421.75
        },
        {
            "date": "2024-12-09",
            "type": "Card Payment",
            "description": "TESCO STORES 2847",
            "amount": -67.43,
            "balance": 5437.74
        },
        {
            "date": "2024-12-08",
            "type": "Faster Payment",
            "description": "FROM JOHN SMITH",
            "amount": 250.00,
            "balance": 5505.17
        },
        {
            "date": "2024-12-07",
            "type": "Card Payment",
            "description": "AMAZON.CO.UK",
            "amount": -89.99,
            "balance": 5255.17
        },
        {
            "date": "2024-12-06",
            "type": "ATM Withdrawal",
            "description": "HSBC ATM LONDON",
            "amount": -100.00,
            "balance": 5345.16
        },
        {
            "date": "2024-12-05",
            "type": "Salary",
            "description": "ACME CORP LTD",
            "amount": 2500.00,
            "balance": 5445.16
        },
        {
            "date": "2024-12-04",
            "type": "Card Payment",
            "description": "STARBUCKS #1234",
            "amount": -4.85,
            "balance": 2945.16
        },
        {
            "date": "2024-12-03",
            "type": "Standing Order",
            "description": "RENT PAYMENT",
            "amount": -1200.00,
            "balance": 2950.01
        },
        {
            "date": "2024-12-02",
            "type": "Card Payment",
            "description": "UBER TRIP",
            "amount": -18.50,
            "balance": 4150.01
        },
        {
            "date": "2024-12-01",
            "type": "Interest",
            "description": "MONTHLY INTEREST",
            "amount": 12.34,
            "balance": 4168.51
        }
    ],
    "0987654321": [
        {
            "date": "2024-12-10",
            "type": "Investment Return",
            "description": "PORTFOLIO DIVIDEND",
            "amount": 5000.00,
            "balance": 150000.00
        },
        {
            "date": "2024-12-09",
            "type": "Wire Transfer",
            "description": "BUSINESS PAYMENT",
            "amount": -25000.00,
            "balance": 145000.00
        }
    ],
    "1122334455": [
        {
            "date": "2024-12-10",
            "type": "Card Payment",
            "description": "COFFEE SHOP",
            "amount": -3.50,
            "balance": 98.10
        },
        {
            "date": "2024-12-09",
            "type": "ATM Withdrawal",
            "description": "BANK ATM",
            "amount": -20.00,
            "balance": 101.60
        }
    ]
}

def get_transaction_history(account_id: str, sort_code: str) -> str:
    """Retrieves the recent transaction history for a specified bank account."""
    # First validate the account exists
    account_info = ACCOUNT_DETAILS.get(account_id)
    if account_info is None:
        return f"I could not find an account with the ID {account_id}."

    # Validate the sort code
    if account_info.get("sortCode") != sort_code:
        return "The provided account ID and sort code combination is incorrect. Please verify your details."

    # Get transaction history
    transactions = TRANSACTION_HISTORY.get(account_id, [])
    
    if not transactions:
        return f"No transaction history found for account ID {account_id}."
    
    # Format the transaction history
    result = f"Recent transaction history for account ID {account_id} (Sort Code: {sort_code}):\n\n"
    
    for i, transaction in enumerate(transactions[:10], 1):  # Show last 10 transactions
        amount_str = f"£{abs(transaction['amount']):,.2f}"
        if transaction['amount'] >= 0:
            amount_str = f"+{amount_str}"
        else:
            amount_str = f"-{amount_str}"
            
        result += f"{i}. {transaction['date']} | {transaction['type']}\n"
        result += f"   {transaction['description']}\n"
        result += f"   Amount: {amount_str} | Balance: £{transaction['balance']:,.2f}\n\n"
    
    return result.strip()

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """AWS Lambda handler for AgentCore Gateway MCP calls - Transaction History."""
    try:
        logger.info('Received event: %s', json.dumps(event, indent=2))
        
        # AgentCore Gateway sends parameters directly in the event
        account_id = event.get('accountId')
        sort_code = event.get('sortCode')
        
        logger.info('Extracted parameters - accountId: %s, sortCode: %s', account_id, sort_code)
        
        if account_id and sort_code:
            result_message = get_transaction_history(account_id, sort_code)
            logger.info('Transaction history result length: %d characters', len(result_message))
            
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
            'body': 'An internal server error occurred while trying to fetch the transaction history.'
        }