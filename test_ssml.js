const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3 = new S3Client({region: 'us-west-2'});
const RESPONSE_BUCKET = 'voice-s2s-infra-sessionlogsbucket-evjjsinjhifv';
const audioKey = 'turns/connect-06e4efb6-b0c4-455f-bae1-7979cc471d32/1772454421008.wav';

async function generate() {
    try {
        const command = new GetObjectCommand({ Bucket: RESPONSE_BUCKET, Key: audioKey });
        const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
        console.log("URL:", url);
    } catch(e) {
        console.error(e);
    }
}
generate();
