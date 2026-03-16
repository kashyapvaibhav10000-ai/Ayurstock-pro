import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * POST /api/medicines/import/batch
 * Save a PDF import job for batch/later processing.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { fileName, pdfText, medicines } = body;

    if (!fileName) {
      return NextResponse.json({ success: false, message: 'File name is required' }, { status: 400 });
    }

    const job = await prisma.pdfImportJob.create({
      data: {
        shopId: auth.user.shopId,
        userId: auth.user.id,
        fileName,
        pdfText: pdfText || '',
        status: medicines ? 'completed' : 'pending',
        medicinesCount: medicines ? medicines.length : 0,
        medicines: medicines ? JSON.stringify(medicines) : null,
      },
    });

    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        fileName: job.fileName,
        status: job.status,
        medicinesCount: job.medicinesCount,
        createdAt: job.createdAt,
      },
    });
  } catch (error) {
    console.error('❌ Batch create error:', error);
    return NextResponse.json({ success: false, message: 'Failed to create batch job' }, { status: 500 });
  }
}

/**
 * GET /api/medicines/import/batch
 * List all batch import jobs for the current shop.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const jobs = await prisma.pdfImportJob.findMany({
      where: { shopId: auth.user.shopId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        fileName: true,
        status: true,
        medicinesCount: true,
        error: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ success: true, jobs });
  } catch (error) {
    console.error('❌ Batch list error:', error);
    return NextResponse.json({ success: false, message: 'Failed to list batch jobs' }, { status: 500 });
  }
}
