import { NextResponse } from 'next/server';

// Use INTERNAL_API_URL for server-side calls (inside Docker container)
// Falls back to NEXT_PUBLIC_GATEWAY_URL for backwards compatibility
// Falls back to localhost for local development
const GATEWAY_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:8080';

// GET - List all personas
export async function GET() {
  try {
    const response = await fetch(`${GATEWAY_URL}/api/personas`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Gateway returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[API] Failed to fetch personas:', error);
    return NextResponse.json(
      { error: 'Failed to fetch personas', details: error.message },
      { status: 500 }
    );
  }
}

// POST - Create new persona
export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const response = await fetch(`${GATEWAY_URL}/api/personas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Gateway returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[API] Failed to create persona:', error);
    return NextResponse.json(
      { error: 'Failed to create persona', details: error.message },
      { status: 500 }
    );
  }
}
