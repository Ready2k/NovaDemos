import logging
from typing import Dict, Any, List
from http import HTTPStatus

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# --- MOCK DATA ---
ACCOUNT_DETAILS: Dict[str, Dict[str, Any]] = {
    "1234567890": {"sortCode": "112233", "balance": 5421.75},
    "0987654321": {"sortCode": "445566", "balance": 150000.00},
    "1122334455": {"sortCode": "990011", "balance": 98.10},
}

def get_parameter_value(parameters: List[Dict[str, Any]], name: str) -> str | None:
    """Helper function to extract a parameter value by name."""
    for param in parameters:
        if param.get('name') == name and 'value' in param:
            return param['value']
    return None

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

def handle_bedrock_agent_format(event: Dict[str, Any]) -> Dict[str, Any]:
    """Handle Bedrock Agent format with actionGroup, apiPath, etc."""
    action_group = event['actionGroup']
    api_path = event.get('apiPath', 'N/A')
    http_method = event.get('httpMethod', 'N/A')
    message_version = event.get('messageVersion', '1.0')
    parameters = event.get('parameters', [])
    
    logger.info('Processing Bedrock Agent format event: %s', event)
    
    result_message = ""
    
    if http_method == 'GET' and api_path == '/accounts/{accountId}/balance':
        # Extract parameters from Bedrock Agent format
        account_id = get_parameter_value(parameters, 'accountId')
        sort_code = get_parameter_value(parameters, 'sortCode')
        
        if account_id and sort_code:
            result_message = get_balance(account_id, sort_code)
        else:
            missing = []
            if not account_id: missing.append("'accountId'")
            if not sort_code: missing.append("'sortCode'")
            result_message = f"Error: The following required parameters are missing: {', '.join(missing)}."
    else:
        result_message = f"Error: Unknown route called. Method: {http_method}, Path: {api_path}"
    
    # Return Bedrock Agent format response
    final_response_body = {'TEXT': {'body': result_message}}
    return {
        'messageVersion': message_version,
        'response': {
            'actionGroup': action_group,
            'apiPath': api_path,
            'httpMethod': http_method,
            'responseBody': final_response_body
        }
    }

def handle_agentcore_gateway_format(event: Dict[str, Any]) -> Dict[str, Any]:
    """Handle AgentCore Gateway MCP format with direct parameters."""
    logger.info('Processing AgentCore Gateway format event: %s', event)
    
    # Extract parameters directly from event
    account_id = event.get('accountId')
    sort_code = event.get('sortCode')
    
    if account_id and sort_code:
        result_message = get_balance(account_id, sort_code)
    else:
        missing = []
        if not account_id: missing.append("'accountId'")
        if not sort_code: missing.append("'sortCode'")
        result_message = f"Error: The following required parameters are missing: {', '.join(missing)}."
    
    # Return simple response for AgentCore Gateway
    return {
        'statusCode': 200,
        'body': result_message
    }

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """AWS Lambda handler that can handle both Bedrock Agent and AgentCore Gateway formats."""
    try:
        logger.info('Received event: %s', event)
        
        # Detect event format based on presence of actionGroup
        if 'actionGroup' in event:
            # Bedrock Agent format
            logger.info('Detected Bedrock Agent format')
            return handle_bedrock_agent_format(event)
        else:
            # AgentCore Gateway MCP format
            logger.info('Detected AgentCore Gateway MCP format')
            return handle_agentcore_gateway_format(event)
            
    except Exception as e:
        logger.error('Unexpected error in Lambda execution: %s', str(e))
        
        # Return appropriate error format based on event type
        if 'actionGroup' in event:
            # Bedrock Agent error format
            error_body = {'TEXT': {'body': 'An internal server error occurred while trying to fetch the balance.'}}
            return {
                'messageVersion': event.get('messageVersion', '1.0'),
                'response': {
                    'actionGroup': event.get('actionGroup', 'N/A'),
                    'apiPath': event.get('apiPath', 'N/A'),
                    'httpMethod': event.get('httpMethod', 'N/A'),
                    'responseBody': error_body
                }
            }
        else:
            # AgentCore Gateway error format
            return {
                'statusCode': 500,
                'body': 'An internal server error occurred while trying to fetch the balance.'
            }