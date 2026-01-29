import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionId, traceId, score, comment, name } = body;

    // Log feedback to file
    const feedbackDir = path.join(process.cwd(), 'chat_history');
    const feedbackFile = path.join(feedbackDir, 'feedback_log.json');

    // Ensure directory exists
    if (!fs.existsSync(feedbackDir)) {
      fs.mkdirSync(feedbackDir, { recursive: true });
    }

    // Read existing feedback
    let feedbackLog = [];
    if (fs.existsSync(feedbackFile)) {
      const content = fs.readFileSync(feedbackFile, 'utf-8');
      try {
        feedbackLog = JSON.parse(content);
      } catch (e) {
        feedbackLog = [];
      }
    }

    // Add new feedback
    feedbackLog.push({
      sessionId,
      traceId,
      score,
      comment,
      name: name || 'user-feedback',
      timestamp: new Date().toISOString()
    });

    // Write back
    fs.writeFileSync(feedbackFile, JSON.stringify(feedbackLog, null, 2));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API] Feedback error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
