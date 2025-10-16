import { NextRequest, NextResponse } from 'next/server';

// Mock workflow service for demo purposes
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { claimId, action, data } = body;

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Mock workflow processing
    const result = {
      claimId,
      status: 'processed',
      action,
      data,
      timestamp: new Date().toISOString(),
      workflowId: `wf_${Date.now()}`,
    };

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: 'Workflow processing failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'workflow service running',
    timestamp: new Date().toISOString(),
  });
}
