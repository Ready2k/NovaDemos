import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Check if AWS credentials are configured
    const awsConfigured = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

    return NextResponse.json({
      aws: awsConfigured ? 'connected' : 'disconnected',
      region: process.env.AWS_REGION || 'us-east-1',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[API] System status error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
