import { NextResponse } from 'next/server';
import { getServerApiUrl } from '@/lib/api-config';

export async function GET() {
  try {
    const apiUrl = getServerApiUrl();
    const response = await fetch(`${apiUrl}/api/presets`);
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching presets:', error);
    return NextResponse.json([], { status: 500 });
  }
}
