import boto3
import sys

def search_knowledge_base(query, kb_id):
    """
    Searches the Bedrock Knowledge Base.
    """
    print(f"Searching KB: {kb_id} with query: '{query}'...")
    try:
        client = boto3.client('bedrock-agent-runtime', region_name='us-east-1')
        
        # "RetrieveAndGenerate" handles the search AND the summarization for you
        response = client.retrieve_and_generate(
            input={'text': query},
            retrieveAndGenerateConfiguration={
                'type': 'KNOWLEDGE_BASE',
                'knowledgeBaseConfiguration': {
                    'knowledgeBaseId': kb_id,
                    # Using Haiku as requested/suggested in the snippet
                    'modelArn': 'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-haiku-20240307-v1:0' 
                }
            }
        )
        
        return response['output']['text']
    except Exception as e:
        print(f"Error: {e}")
        return None

if __name__ == "__main__":
    kb_id = "KCDO7ZUFA1"
    query = "what mortgages do you offer"
    
    if len(sys.argv) > 1:
        query = sys.argv[1]

    result = search_knowledge_base(query, kb_id)
    
    if result:
        print("\n--- Response ---")
        print(result)
        print("----------------")
    else:
        print("No response or error occurred.")
