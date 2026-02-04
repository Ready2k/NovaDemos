import { NextResponse } from 'next/server';
import { getServerApiUrl } from '@/lib/api-config';

export async function GET() {
  try {
    const apiUrl = getServerApiUrl();
    const response = await fetch(`${apiUrl}/api/tools`);
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching tools:', error);
    return NextResponse.json([], { status: 500 });
  }
}
