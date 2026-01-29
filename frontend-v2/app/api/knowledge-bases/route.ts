import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

export async function GET() {
  try {
    const kbFile = path.join(process.cwd(), 'knowledge_bases.json');
    
    if (!fs.existsSync(kbFile)) {
      return NextResponse.json([]);
    }

    const content = fs.readFileSync(kbFile, 'utf-8');
    const knowledgeBases = JSON.parse(content);

    return NextResponse.json(knowledgeBases);
  } catch (error: any) {
    console.error('[API] Knowledge bases error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const kbFile = path.join(process.cwd(), 'knowledge_bases.json');

    // Read existing KBs
    let knowledgeBases = [];
    if (fs.existsSync(kbFile)) {
      const content = fs.readFileSync(kbFile, 'utf-8');
      knowledgeBases = JSON.parse(content);
    }

    // Add new KB
    knowledgeBases.push({
      ...body,
      createdAt: new Date().toISOString()
    });

    // Write back
    fs.writeFileSync(kbFile, JSON.stringify(knowledgeBases, null, 2));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API] Knowledge bases POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
