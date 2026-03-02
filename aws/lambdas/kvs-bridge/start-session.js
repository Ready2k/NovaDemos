'use strict';
/**
 * StartBotSession — called by Amazon Connect when a call arrives.
 *
 * 1. Writes a session record to DynamoDB (status="waiting").
 * 2. Fire-and-forget HTTP POST to the ECS endpoint so that the ECS task
 *    opens a persistent Nova Sonic session and starts streaming KVS audio.
 */
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');

const ddb         = new DynamoDBClient({});
const ECS_ENDPOINT = process.env.ECS_ENDPOINT; // e.g. http://internal-alb.../connect/call-start

exports.handler = async (event) => {
    console.log('StartBotSession event:', JSON.stringify(event));

    const cd             = event.Details?.ContactData ?? {};
    const contactId      = cd.ContactId   ?? event.ContactId   ?? 'unknown';
    const instanceArn    = cd.InstanceARN ?? '';
    const audio          = cd.MediaStreams?.Customer?.Audio ?? {};
    const sessionId      = `connect-${contactId}`;
    const streamArn      = audio.StreamARN           ?? '';
    const startFragment  = audio.StartFragmentNumber ?? '';
    const startTimestamp = audio.StartTimestamp      ?? '';

    // ── 1. Create session record in DynamoDB ──────────────────────────────────
    await ddb.send(new PutItemCommand({
        TableName: process.env.SESSION_TABLE,
        Item: {
            sessionId:    { S: sessionId },
            contactId:    { S: contactId },
            instanceArn:  { S: instanceArn },
            streamArn:    { S: streamArn },
            lastFragment: { S: startFragment },
            history:      { S: '[]' },
            status:       { S: 'waiting' },
            audioKey:     { S: '' },
            intent:       { S: 'continue' },
            ttl:          { N: String(Math.floor(Date.now() / 1000) + 7200) },
        },
    }));
    console.log(`Session ${sessionId} created. streamArn=${streamArn}`);

    // ── 2. Notify ECS to open Nova Sonic session ─────────────────────────────
    // Must be awaited — Lambda freezes the process on return, killing any
    // pending fire-and-forget fetches before they can send.
    if (ECS_ENDPOINT) {
        const body = JSON.stringify({ contactId, streamArn, startFragment, startTimestamp, instanceArn });
        try {
            const r = await fetch(ECS_ENDPOINT, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
                signal:  AbortSignal.timeout(5000),
            });
            console.log(`ECS notify: ${r.status}`);
        } catch (e) {
            console.error('ECS notify failed:', e.message);
            // Non-fatal — DDB record is written; ECS can still poll if needed.
        }
    } else {
        console.warn('ECS_ENDPOINT not set — skipping ECS notification');
    }

    return { sessionId, status: 'started' };
};
