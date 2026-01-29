import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { enabled } = body;

    // In a real implementation, this would toggle debug logging
    console.log(`[API] Debug mode ${enabled ? 'enabled' : 'disabled'}`);

    return NextResponse.json({ success: true, debugMode: enabled });
  } catch (error: any) {
    console.error('[API] System debug error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
