import { BedrockClient, ListFoundationModelsCommand } from '@aws-sdk/client-bedrock';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testAuth() {
    console.log('Testing AWS Authentication...');
    console.log(`Region: ${process.env.AWS_REGION || 'us-east-1'}`);

    const config: any = {
        region: process.env.AWS_REGION || 'us-east-1',
    };

    // Configure credentials
    if (process.env.AWS_BEARER_TOKEN_BEDROCK) {
        console.log('Using Bearer Token authentication');
        config.token = { token: process.env.AWS_BEARER_TOKEN_BEDROCK };
    } else if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
        console.log('Using IAM Credentials authentication');
        config.credentials = {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        };
    } else {
        console.log('No explicit credentials found in .env, using default provider chain');
    }

    try {
        const client = new BedrockClient(config);
        const command = new ListFoundationModelsCommand({});

        console.log('Sending ListFoundationModels request...');
        const response = await client.send(command);

        console.log('Successfully authenticated!');
        console.log(`Found ${response.modelSummaries?.length || 0} models.`);

        // Check for Nova Sonic
        const sonic = response.modelSummaries?.find(m => m.modelId?.includes('sonic'));
        if (sonic) {
            console.log('✅ Nova Sonic model found:', sonic.modelId);
        } else {
            console.log('⚠️ Nova Sonic model NOT found in the list (might be restricted or not available in this region)');
        }

    } catch (error: any) {
        console.error('❌ Authentication Failed:', error.name);
        console.error('Message:', error.message);
        if (error.name === 'AccessDeniedException') {
            console.error('Tip: Check if your token/user has "bedrock:ListFoundationModels" permission.');
        }
        process.exit(1);
    }
}

testAuth();
