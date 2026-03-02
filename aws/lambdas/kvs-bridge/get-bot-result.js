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

const ddb = new DynamoDBClient({});
const SESSION_TABLE = process.env.SESSION_TABLE;
const RESPONSE_BUCKET = process.env.RESPONSE_BUCKET || '';
const MAX_RETRIES = 10;        // 10 × 500 ms = 5 s (total path < 8s)
const RETRY_DELAY = 500;       // ms

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
            return { audioS3Uri: null, intent: 'continue' };
        }

        if (!item) {
            console.warn(`Session ${sessionId} not found`);
            return { audioS3Uri: null, intent: 'continue' };
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
            // Build full S3 URI so Connect's Play Prompt block can use it directly.
            const audioS3Uri = audioKey && RESPONSE_BUCKET
                ? `s3://${RESPONSE_BUCKET}/${audioKey}`
                : '';
            console.log(`GetBotResult: returning audioS3Uri=${audioS3Uri} intent=${intent}`);
            return { audioS3Uri, intent };
        }

        // ── 3. Not ready yet — wait and retry ────────────────────────────────
        console.log(`Attempt ${attempt + 1}/${MAX_RETRIES + 1}: status=${status}, waiting ${RETRY_DELAY} ms`);
        if (attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAY);
        }
    }

    // ── 4. Timeout ────────────────────────────────────────────────────────────
    console.warn(`GetBotResult timed out for session ${sessionId}`);
    return { audioS3Uri: null, intent: 'continue' };
};
