export interface TranscriptEntry {
    role: string;
    text: string;
    timestamp: number;
    /** Stable identifier for updates emitted from the same provider content block. */
    utteranceId?: string;
    type?: 'speculative' | 'final' | 'workflow_step';
    sentiment?: number;
    metadata?: unknown;
}

export type CoalesceResult =
    | { action: 'inserted' | 'updated'; entry: TranscriptEntry }
    | { action: 'ignored'; entry: TranscriptEntry };

// Used only when the provider did not give us a usable utterance identifier.
// Keep this deliberately short: identical wording in a later turn is valid
// conversation.
const DEFAULT_REPLAY_WINDOW_MS = 4_000;

function comparableText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

/**
 * Store one transcript entry per contiguous speaker turn.
 *
 * Nova Sonic can emit an expanding speculative transcript, a complete final
 * transcript, and then a shorter FINAL-stage replay. The replay must never
 * replace the complete turn or be persisted as a second message.
 */
export function coalesceTranscriptEntry(
    transcript: TranscriptEntry[],
    incoming: TranscriptEntry,
    replayWindowMs = DEFAULT_REPLAY_WINDOW_MS
): CoalesceResult {
    const previous = transcript[transcript.length - 1];
    if (!previous || previous.role !== incoming.role || incoming.type === 'workflow_step') {
        transcript.push(incoming);
        return { action: 'inserted', entry: incoming };
    }

    const previousText = comparableText(previous.text);
    const incomingText = comparableText(incoming.text);
    const sameText = previousText === incomingText;
    const incomingExtendsPrevious = incomingText.startsWith(previousText);
    const incomingIsShorterReplay = previousText.startsWith(incomingText);
    const incomingIsContainedReplay = previousText.includes(incomingText);

    const sameUtterance = Boolean(
        previous.utteranceId &&
        incoming.utteranceId &&
        previous.utteranceId === incoming.utteranceId
    );
    const differentIdentifiedUtterance = Boolean(
        previous.utteranceId &&
        incoming.utteranceId &&
        previous.utteranceId !== incoming.utteranceId
    );
    const elapsed = incoming.timestamp - previous.timestamp;
    // Nova can publish each progressively longer snapshot under a fresh content
    // ID. Treat a strict, immediate prefix extension as the same visible turn.
    if (differentIdentifiedUtterance &&
        elapsed >= 0 && elapsed <= replayWindowMs &&
        incomingText.length > previousText.length && incomingExtendsPrevious) {
        previous.text = incoming.text;
        previous.timestamp = incoming.timestamp;
        previous.utteranceId = incoming.utteranceId;
        previous.sentiment = incoming.sentiment ?? previous.sentiment;
        if (incoming.type === 'final') previous.type = 'final';
        return { action: 'updated', entry: previous };
    }
    if (differentIdentifiedUtterance) {
        transcript.push(incoming);
        return { action: 'inserted', entry: incoming };
    }
    if (!sameUtterance && (elapsed < 0 || elapsed > replayWindowMs)) {
        transcript.push(incoming);
        return { action: 'inserted', entry: incoming };
    }

    if (!sameText && !incomingExtendsPrevious && !incomingIsShorterReplay && !incomingIsContainedReplay) {
        transcript.push(incoming);
        return { action: 'inserted', entry: incoming };
    }

    if ((incomingIsShorterReplay || incomingIsContainedReplay) && previous.type === 'final') {
        return { action: 'ignored', entry: previous };
    }

    if (incomingText.length > previousText.length) {
        previous.text = incoming.text;
    }
    previous.timestamp = incoming.timestamp;
    previous.sentiment = incoming.sentiment ?? previous.sentiment;
    if (incoming.type === 'final') previous.type = 'final';

    return { action: 'updated', entry: previous };
}
