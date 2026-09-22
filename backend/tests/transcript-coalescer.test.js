const assert = require('node:assert/strict');
const test = require('node:test');
const { coalesceTranscriptEntry } = require('../dist/transcript-coalescer');

test('keeps the longest assistant transcript when a shorter final replay arrives', () => {
    const transcript = [];
    const fullText = 'The branch is 5.4 kilometres away. Please check the branch locator.';

    coalesceTranscriptEntry(transcript, {
        role: 'assistant', text: fullText, timestamp: 1_000, type: 'final'
    });
    const result = coalesceTranscriptEntry(transcript, {
        role: 'assistant', text: 'The branch is 5.4 kilometres away. Please check', timestamp: 3_800, type: 'final'
    });

    assert.equal(result.action, 'ignored');
    assert.equal(transcript.length, 1);
    assert.equal(transcript[0].text, fullText);
});

test('ignores a final replay containing only the tail of the completed response', () => {
    const transcript = [];
    const fullText = 'Opening hours are unavailable. Please check the online branch locator.';

    coalesceTranscriptEntry(transcript, {
        role: 'assistant', text: fullText, timestamp: 1_000, type: 'final'
    });
    const result = coalesceTranscriptEntry(transcript, {
        role: 'assistant', text: 'Please check the online branch locator.', timestamp: 3_000, type: 'final'
    });

    assert.equal(result.action, 'ignored');
    assert.equal(transcript.length, 1);
    assert.equal(transcript[0].text, fullText);
});

test('coalesces speculative assistant updates into one final entry', () => {
    const transcript = [];

    coalesceTranscriptEntry(transcript, {
        role: 'assistant', text: 'The branch is', timestamp: 1_000, type: 'speculative'
    });
    coalesceTranscriptEntry(transcript, {
        role: 'assistant', text: 'The branch is open today.', timestamp: 1_200, type: 'speculative'
    });
    coalesceTranscriptEntry(transcript, {
        role: 'assistant', text: 'The branch is open today.', timestamp: 1_500, type: 'final'
    });

    assert.deepEqual(transcript, [{
        role: 'assistant',
        text: 'The branch is open today.',
        timestamp: 1_500,
        type: 'final',
        sentiment: undefined
    }]);
});

test('coalesces repeated and expanding user recognition results', () => {
    const transcript = [];

    coalesceTranscriptEntry(transcript, {
        role: 'user', text: 'find a branch', timestamp: 1_000, type: 'speculative'
    });
    coalesceTranscriptEntry(transcript, {
        role: 'user', text: 'find a branch near me', timestamp: 1_100, type: 'final'
    });
    const duplicate = coalesceTranscriptEntry(transcript, {
        role: 'user', text: 'find a branch near me', timestamp: 1_200, type: 'final'
    });

    assert.equal(duplicate.action, 'ignored');
    assert.equal(transcript.length, 1);
    assert.equal(transcript[0].text, 'find a branch near me');
    assert.equal(transcript[0].type, 'final');
});

test('does not merge separate turns or entries separated by another role', () => {
    const transcript = [];

    coalesceTranscriptEntry(transcript, {
        role: 'assistant', text: 'Anything else?', timestamp: 1_000, type: 'final'
    });
    coalesceTranscriptEntry(transcript, {
        role: 'user', text: 'Please repeat that.', timestamp: 2_000, type: 'final'
    });
    coalesceTranscriptEntry(transcript, {
        role: 'assistant', text: 'Anything else?', timestamp: 3_000, type: 'final'
    });

    assert.equal(transcript.length, 3);
});

test('keeps identical same-speaker text when it occurs again after the fallback window', () => {
    const transcript = [];

    coalesceTranscriptEntry(transcript, {
        role: 'assistant', text: 'Is there anything else I can help with?', timestamp: 1_000, type: 'final'
    });
    const result = coalesceTranscriptEntry(transcript, {
        role: 'assistant', text: 'Is there anything else I can help with?', timestamp: 11_000, type: 'final'
    });

    assert.equal(result.action, 'inserted');
    assert.equal(transcript.length, 2);
});

test('keeps identical text from distinct identified utterances', () => {
    const transcript = [];

    coalesceTranscriptEntry(transcript, {
        role: 'assistant', text: 'Please confirm that for me.', timestamp: 1_000,
        type: 'final', utteranceId: 'content-a'
    });
    const result = coalesceTranscriptEntry(transcript, {
        role: 'assistant', text: 'Please confirm that for me.', timestamp: 1_500,
        type: 'final', utteranceId: 'content-b'
    });

    assert.equal(result.action, 'inserted');
    assert.equal(transcript.length, 2);
});

test('coalesces immediate growing snapshots even when Nova changes content ID', () => {
    const transcript = [];

    coalesceTranscriptEntry(transcript, {
        role: 'assistant', text: 'I can help with that.', timestamp: 1_000,
        type: 'final', utteranceId: 'content-a'
    });
    const result = coalesceTranscriptEntry(transcript, {
        role: 'assistant', text: 'I can help with that. Here are the details.', timestamp: 1_800,
        type: 'final', utteranceId: 'content-b'
    });

    assert.equal(result.action, 'updated');
    assert.equal(transcript.length, 1);
    assert.equal(transcript[0].text, 'I can help with that. Here are the details.');
    assert.equal(transcript[0].utteranceId, 'content-b');
});

test('coalesces delayed updates carrying the same utterance ID', () => {
    const transcript = [];

    coalesceTranscriptEntry(transcript, {
        role: 'assistant', text: 'Your balance is', timestamp: 1_000,
        type: 'speculative', utteranceId: 'content-a'
    });
    const result = coalesceTranscriptEntry(transcript, {
        role: 'assistant', text: 'Your balance is £1,200.', timestamp: 11_000,
        type: 'final', utteranceId: 'content-a'
    });

    assert.equal(result.action, 'updated');
    assert.equal(transcript.length, 1);
    assert.equal(transcript[0].text, 'Your balance is £1,200.');
    assert.equal(transcript[0].type, 'final');
});
