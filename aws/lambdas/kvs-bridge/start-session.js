'use strict';
/**
 * StartBotSession — called by Amazon Connect when a call arrives.
 *
 * Initialises a session record in DynamoDB so that ProcessBotTurn can later
 * look up the KVS stream details and conversation history for this contact.
 */
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');

const ddb = new DynamoDBClient({});

exports.handler = async (event) => {
    console.log('StartBotSession event:', JSON.stringify(event));

    const cd          = event.Details?.ContactData ?? {};
    const contactId   = cd.ContactId   ?? event.ContactId   ?? 'unknown';
    const instanceArn = cd.InstanceARN ?? '';
    const audio       = cd.MediaStreams?.Customer?.Audio ?? {};
    const sessionId   = `connect-${contactId}`;

    await ddb.send(new PutItemCommand({
        TableName: process.env.SESSION_TABLE,
        Item: {
            sessionId:    { S: sessionId },
            contactId:    { S: contactId },
            instanceArn:  { S: instanceArn },
            streamArn:    { S: audio.StreamARN            ?? '' },
            lastFragment: { S: audio.StartFragmentNumber  ?? '' },
            history:      { S: '[]' },
            ttl:          { N: String(Math.floor(Date.now() / 1000) + 7200) },
        },
    }));

    console.log(`Session ${sessionId} created. streamArn=${audio.StreamARN}`);
    return { sessionId, status: 'started' };
};
