import json
from datetime import datetime
import pytz

def lambda_handler(event, context):
    """
    Simple Lambda function to get current time
    Can be called via AgentCore Gateway just like your banking tools
    """
    
    try:
        # Get current UTC time
        utc_now = datetime.utcnow()
        
        # Get current time in various timezones
        utc_tz = pytz.UTC
        eastern_tz = pytz.timezone('US/Eastern')
        pacific_tz = pytz.timezone('US/Pacific')
        london_tz = pytz.timezone('Europe/London')
        
        utc_time = utc_tz.localize(utc_now)
        eastern_time = utc_time.astimezone(eastern_tz)
        pacific_time = utc_time.astimezone(pacific_tz)
        london_time = utc_time.astimezone(london_tz)
        
        # Format times
        time_data = {
            "utc": utc_time.strftime("%Y-%m-%d %H:%M:%S %Z"),
            "eastern": eastern_time.strftime("%Y-%m-%d %H:%M:%S %Z"),
            "pacific": pacific_time.strftime("%Y-%m-%d %H:%M:%S %Z"),
            "london": london_time.strftime("%Y-%m-%d %H:%M:%S %Z"),
            "timestamp": int(utc_time.timestamp())
        }
        
        # Return in the same format as your banking tools
        return {
            'statusCode': 200,
            'body': json.dumps({
                'success': True,
                'message': f'Current time: {utc_time.strftime("%Y-%m-%d %H:%M:%S UTC")}',
                'data': time_data
            })
        }
        
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({
                'success': False,
                'message': f'Error getting time: {str(e)}',
                'data': None
            })
        }