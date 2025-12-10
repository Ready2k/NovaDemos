import logging
import json
from typing import Dict, Any

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Debug Lambda to see what event structure AgentCore Gateway sends."""
    try:
        logger.info('=== FULL EVENT RECEIVED ===')
        logger.info('Event: %s', json.dumps(event, indent=2))
        logger.info('Event keys: %s', list(event.keys()))
        logger.info('Event type: %s', type(event))
        
        # Return the event structure for analysis
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Debug response - check CloudWatch logs for full event structure',
                'event_keys': list(event.keys()),
                'event_sample': str(event)[:500] + '...' if len(str(event)) > 500 else str(event)
            })
        }
        
    except Exception as e:
        logger.error('Error in debug lambda: %s', str(e))
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e),
                'message': 'Debug lambda failed'
            })
        }