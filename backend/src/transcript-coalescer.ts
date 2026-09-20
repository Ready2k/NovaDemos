export interface TranscriptEntry {
    role: string;
    text: string;
    timestamp: number;
    type?: 'speculative' | 'final' | 'workflow_step';
    sentiment?: number;
    metadata?: unknown;
}

export type CoalesceResult =
    | { action: 'inserted' | 'updated'; entry: TranscriptEntry }
    | { action: 'ignored'; entry: TranscriptEntry };

const DEFAULT_REPLAY_WINDOW_MS = 15_000;

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

    const elapsed = incoming.timestamp - previous.timestamp;
    if (elapsed < 0 || elapsed > replayWindowMs) {
        transcript.push(incoming);
        return { action: 'inserted', entry: incoming };
    }

    const previousText = comparableText(previous.text);
    const incomingText = comparableText(incoming.text);
    const sameText = previousText === incomingText;
    const incomingExtendsPrevious = incomingText.startsWith(previousText);
    const incomingIsShorterReplay = previousText.startsWith(incomingText);
    const incomingIsContainedReplay = previousText.includes(incomingText);

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
