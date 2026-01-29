import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { testId, status, result } = body;

    const testLogsDir = path.join(process.cwd(), 'backend', 'test_logs');
    if (!fs.existsSync(testLogsDir)) {
      fs.mkdirSync(testLogsDir, { recursive: true });
    }

    const testFile = path.join(testLogsDir, `${testId}.json`);
    const testData = {
      testId,
      status,
      result,
      timestamp: new Date().toISOString()
    };

    fs.writeFileSync(testFile, JSON.stringify(testData, null, 2));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API] Test result POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
