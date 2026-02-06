import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Use INTERNAL_API_URL for server-side requests (Docker network)
    // Fall back to NEXT_PUBLIC_API_URL for local development
    const apiUrl = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
    const response = await fetch(`${apiUrl}/api/voices`);
    
    if (!response.ok) {
      console.error(`Error fetching voices: ${response.status} ${response.statusText}`);
      return NextResponse.json([], { status: response.status });
    }
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching voices:', error);
    return NextResponse.json([], { status: 500 });
  }
}
