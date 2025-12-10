import logging
import json
from typing import Dict, Any
from datetime import datetime, timezone, timedelta

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def get_current_time(timezone_name: str = "UTC") -> str:
    """Get current time in specified timezone or UTC by default."""
    try:
        # Get current UTC time
        utc_now = datetime.now(timezone.utc)
        
        # Define timezone offsets (simplified - doesn't handle DST)
        timezone_offsets = {
            "UTC": timedelta(hours=0),
            "EST": timedelta(hours=-5),  # Eastern Standard Time
            "PST": timedelta(hours=-8),  # Pacific Standard Time
            "GMT": timedelta(hours=0),   # Greenwich Mean Time
            "CET": timedelta(hours=1),   # Central European Time
            "JST": timedelta(hours=9),   # Japan Standard Time
        }
        
        # Default to UTC if timezone not recognized
        if timezone_name.upper() not in timezone_offsets:
            timezone_name = "UTC"
            
        offset = timezone_offsets[timezone_name.upper()]
        local_time = utc_now + offset
        
        # Format the time nicely
        formatted_time = local_time.strftime("%A, %B %d, %Y at %H:%M:%S")
        
        return f"The current time is {formatted_time} {timezone_name.upper()}."
        
    except Exception as e:
        logger.error('Error getting time: %s', str(e))
        return "I encountered an error while retrieving the current time."

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """AWS Lambda handler for AgentCore Gateway MCP calls - Current Time."""
    try:
        logger.info('Received event: %s', json.dumps(event, indent=2))
        
        # AgentCore Gateway sends parameters directly in the event
        # Optional timezone parameter (defaults to UTC if not provided)
        timezone_name = event.get('timezone', 'UTC')
        
        logger.info('Extracted parameters - timezone: %s', timezone_name)
        
        # Get the current time
        result_message = get_current_time(timezone_name)
        logger.info('Time check result: %s', result_message)
        
        # Return success response (same format as banking Lambda)
        return {
            'statusCode': 200,
            'body': result_message
        }
            
    except Exception as e:
        logger.error('Unexpected error in Lambda execution: %s', str(e), exc_info=True)
        
        return {
            'statusCode': 500,
            'body': 'An internal server error occurred while trying to get the current time.'
        }