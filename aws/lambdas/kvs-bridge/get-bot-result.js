'use strict';
/**
 * GetBotResult — polled by Amazon Connect after ECS signals a turn is ready.
 *
 * Flow:
 *   1. GetItem from DynamoDB by sessionId = "connect-{contactId}".
 *   2. If status === "ready":
 *        ConditionalUpdate status: ready → waiting (prevents double-read).
 *        Return { audioKey, intent }.
 *   3. Otherwise sleep 500 ms and retry (max 14 retries ≈ 7 s).
 *   4. On timeout return { audioKey: null, intent: "continue" } so the
 *      contact flow can loop back and try again.
 */

const { DynamoDBClient, GetItemCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { S3Client, CopyObjectCommand } = require('@aws-sdk/client-s3');
const { ConnectClient, CreatePromptCommand } = require('@aws-sdk/client-connect');

const ddb = new DynamoDBClient({});
const s3 = new S3Client({ requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
const connect = new ConnectClient({ region: process.env.AWS_REGION || 'us-west-2' });
const SESSION_TABLE = process.env.SESSION_TABLE;
const RESPONSE_BUCKET = process.env.RESPONSE_BUCKET || '';
const CONNECT_AUDIO_BUCKET = process.env.CONNECT_AUDIO_BUCKET || RESPONSE_BUCKET;
const CONNECT_INSTANCE_ID = process.env.CONNECT_INSTANCE_ID || '';
const MAX_RETRIES = 11;
const RETRY_DELAY = 500;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

exports.handler = async (event) => {
    console.log('GetBotResult event:', JSON.stringify(event));

    const cd = event.Details?.ContactData ?? {};
    const contactId = cd.ContactId ?? event.ContactId ?? 'unknown';
    const sessionId = `connect-${contactId}`;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        // ── 1. Read session record ────────────────────────────────────────────
        let item;
        try {
            const { Item } = await ddb.send(new GetItemCommand({
                TableName: SESSION_TABLE,
                Key: { sessionId: { S: sessionId } },
            }));
            item = Item;
        } catch (e) {
            console.error('GetItem failed:', e.message);
            return { audioS3Uri: '', ssml: '', intent: 'continue' };
        }

        if (!item) {
            console.warn(`Session ${sessionId} not found`);
            return { audioS3Uri: '', ssml: '', intent: 'continue' };
        }

        const status = item.status?.S || 'waiting';

        // ── 2. Ready — claim it with a conditional update ─────────────────────
        if (status === 'ready') {
            try {
                await ddb.send(new UpdateItemCommand({
                    TableName: SESSION_TABLE,
                    Key: { sessionId: { S: sessionId } },
                    UpdateExpression: 'SET #s = :waiting',
                    ConditionExpression: '#s = :ready',
                    ExpressionAttributeNames: { '#s': 'status' },
                    ExpressionAttributeValues: {
                        ':waiting': { S: 'waiting' },
                        ':ready': { S: 'ready' },
                    },
                }));
            } catch (e) {
                // ConditionalCheckFailedException means another poller grabbed it first.
                // Treat as not-yet-ready and retry.
                if (e.name === 'ConditionalCheckFailedException') {
                    console.warn('Conditional update failed — another invocation grabbed the result');
                    await sleep(RETRY_DELAY);
                    continue;
                }
                throw e;
            }

            const audioKey = item.audioKey?.S || '';
            const intent = item.intent?.S || 'continue';

            let audioS3Uri = '';
            let ssml = '';

            if (audioKey && CONNECT_AUDIO_BUCKET && CONNECT_INSTANCE_ID) {
                try {
                    // 1. ECS already wrote the WAV directly to CONNECT_AUDIO_BUCKET
                    const s3Uri = `s3://${CONNECT_AUDIO_BUCKET}/${audioKey}`;

                    // 2. Register as a Connect Prompt (the official API for dynamic audio)
                    const promptName = `vs2s-${Date.now()}`;
                    const { PromptARN } = await connect.send(new CreatePromptCommand({
                        InstanceId: CONNECT_INSTANCE_ID,
                        Name: promptName,
                        S3Uri: s3Uri,
                    }));

                    audioS3Uri = s3Uri;
                    ssml = PromptARN;  // Contact flow reads $.External.ssml as promptArn
                    console.log(`Created prompt: ${PromptARN} from ${s3Uri}`);
                } catch (err) {
                    console.error(`Prompt creation failed for ${audioKey}:`, err.message);
                    audioS3Uri = `s3://${CONNECT_AUDIO_BUCKET}/${audioKey}`;
                    ssml = audioS3Uri;
                }
            }

            console.log(`GetBotResult CLAIMED: ssml=${ssml.substring(0, 100)}... intent=${intent}`);
            return { audioS3Uri, ssml, intent };
        }

        // ── 3. Not ready yet — wait and retry ────────────────────────────────
        if (attempt % 5 === 0) {
            console.log(`Attempt ${attempt + 1}/${MAX_RETRIES + 1}: status=${status} session=${sessionId}`);
        }
        if (attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAY);
        }
    }

    // ── 4. Timeout ────────────────────────────────────────────────────────────
    console.warn(`GetBotResult timed out for session ${sessionId}`);
    return { audioS3Uri: '', ssml: '', intent: 'continue' };
};
