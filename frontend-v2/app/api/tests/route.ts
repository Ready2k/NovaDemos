import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

export async function GET() {
  try {
    const testLogsDir = path.join(process.cwd(), 'backend', 'test_logs');
    
    if (!fs.existsSync(testLogsDir)) {
      return NextResponse.json([]);
    }

    const files = fs.readdirSync(testLogsDir).filter(f => f.endsWith('.json'));
    const tests = files.map(file => {
      const filePath = path.join(testLogsDir, file);
      try {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return {
          id: file.replace('.json', ''),
          name: content.testName || file.replace('.json', ''),
          timestamp: content.timestamp || '',
          status: content.status || 'unknown',
          path: filePath
        };
      } catch (e) {
        return {
          id: file.replace('.json', ''),
          name: file.replace('.json', ''),
          timestamp: '',
          status: 'error',
          path: filePath
        };
      }
    });

    return NextResponse.json(tests);
  } catch (error: any) {
    console.error('[API] Tests error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
