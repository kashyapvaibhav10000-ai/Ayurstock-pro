export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: { jobId: string } }) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { jobId } = params;
    if (!jobId) {
      return NextResponse.json({ success: false, message: 'Missing jobId' }, { status: 400 });
    }

    const job = await prisma.importJob.findFirst({
      where: { 
        id: jobId,
        shopId: auth.user.shopId
      }
    });

    if (!job) {
      return NextResponse.json({ success: false, message: 'Job not found' }, { status: 404 });
    }

    if (job.status === 'done') {
      return NextResponse.json({
        success: true,
        status: 'done',
        medicines: job.medicines ? JSON.parse(job.medicines) : [],
        message: job.message
      });
    }

    if (job.status === 'failed') {
      return NextResponse.json({
        success: true,
        status: 'failed',
        error: job.error,
        message: job.message,
        errorCode: job.message === 'NO_TEXT' ? 'NO_TEXT' : 'AI_FAILED'
      });
    }

    return NextResponse.json({
      success: true,
      status: job.status,
      message: job.message
    });

  } catch (error) {
    console.error('Check status error:', error);
    return NextResponse.json({ success: false, message: 'Failed to check status' }, { status: 500 });
  }
}
