import { NextResponse } from 'next/server';

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:8080';

// GET - Get individual persona
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    
    const response = await fetch(`${GATEWAY_URL}/api/personas/${id}`, {
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
    console.error('[API] Failed to fetch persona:', error);
    return NextResponse.json(
      { error: 'Failed to fetch persona', details: error.message },
      { status: 500 }
    );
  }
}

// PUT - Update persona
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    const body = await request.json();
    
    const response = await fetch(`${GATEWAY_URL}/api/personas/${id}`, {
      method: 'PUT',
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
    console.error('[API] Failed to update persona:', error);
    return NextResponse.json(
      { error: 'Failed to update persona', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE - Delete persona
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    
    const response = await fetch(`${GATEWAY_URL}/api/personas/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Gateway returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[API] Failed to delete persona:', error);
    return NextResponse.json(
      { error: 'Failed to delete persona', details: error.message },
      { status: 500 }
    );
  }
}
