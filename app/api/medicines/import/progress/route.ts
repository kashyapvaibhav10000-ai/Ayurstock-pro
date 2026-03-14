import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { importJobStore } from '@/lib/importJobStore';

export async function GET(req: NextRequest) {
  try {
    const authResult = await verifyAuth(req);
    if (!authResult.authenticated) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json({ success: false, message: 'jobId parameter is required' }, { status: 400 });
    }

    const job = await importJobStore.getJob(jobId);
    if (!job) {
      return NextResponse.json({ success: false, message: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      jobId: job.id,
      status: job.status,
      currentPage: job.currentPage,
      totalPages: job.totalPages,
      medicines: job.medicines,
      message: job.message,
    });
  } catch (error) {
    console.error('Progress check error:', error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to check progress',
      },
      { status: 500 }
    );
  }
}