import json
from datetime import datetime, timezone, timedelta

def lambda_handler(event, context):
    """
    Simple Lambda function to get current time
    No external dependencies - uses only built-in Python libraries
    """
    
    try:
        # Get current UTC time
        utc_now = datetime.now(timezone.utc)
        
        # Calculate other timezones manually (simplified - doesn't handle DST)
        eastern_offset = timedelta(hours=-5)  # EST
        pacific_offset = timedelta(hours=-8)  # PST
        london_offset = timedelta(hours=0)    # GMT (London winter time)
        
        eastern_time = utc_now + eastern_offset
        pacific_time = utc_now + pacific_offset
        london_time = utc_now + london_offset
        
        # Format times
        time_data = {
            "utc": utc_now.strftime("%Y-%m-%d %H:%M:%S UTC"),
            "eastern": eastern_time.strftime("%Y-%m-%d %H:%M:%S EST"),
            "pacific": pacific_time.strftime("%Y-%m-%d %H:%M:%S PST"),
            "london": london_time.strftime("%Y-%m-%d %H:%M:%S GMT"),
            "timestamp": int(utc_now.timestamp()),
            "iso_format": utc_now.isoformat(),
            "readable": utc_now.strftime("%A, %B %d, %Y at %H:%M:%S UTC")
        }
        
        # Return in the same format as your banking tools
        return {
            'statusCode': 200,
            'body': json.dumps({
                'success': True,
                'message': f'Current time: {utc_now.strftime("%Y-%m-%d %H:%M:%S UTC")}',
                'data': time_data,
                'formatted_response': f"The current time is {utc_now.strftime('%A, %B %d, %Y at %H:%M:%S UTC')}"
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