import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { parseTextWithAI } from '@/lib/aiParser';

/**
 * GET /api/medicines/import/batch/[id]
 * Fetch status and results for a specific batch job.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const job = await prisma.pdfImportJob.findFirst({
      where: {
        id: params.id,
        shopId: auth.user.shopId,
      },
    });

    if (!job) {
      return NextResponse.json({ success: false, message: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        fileName: job.fileName,
        status: job.status,
        medicinesCount: job.medicinesCount,
        medicines: job.medicines ? JSON.parse(job.medicines) : null,
        error: job.error,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },
    });
  } catch (error) {
    console.error('❌ Batch get error:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch batch job' }, { status: 500 });
  }
}

/**
 * PATCH /api/medicines/import/batch/[id]
 * Re-process a pending or failed batch job.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const job = await prisma.pdfImportJob.findFirst({
      where: {
        id: params.id,
        shopId: auth.user.shopId,
      },
    });

    if (!job) {
      return NextResponse.json({ success: false, message: 'Job not found' }, { status: 404 });
    }

    if (!job.pdfText) {
      return NextResponse.json({ success: false, message: 'No text available to process' }, { status: 400 });
    }

    // Update status to processing
    await prisma.pdfImportJob.update({
      where: { id: job.id },
      data: { status: 'processing', error: null },
    });

    // Re-parse the text
    const result = await parseTextWithAI(job.pdfText);

    if (result.medicines.length > 0) {
      await prisma.pdfImportJob.update({
        where: { id: job.id },
        data: {
          status: 'completed',
          medicinesCount: result.medicines.length,
          medicines: JSON.stringify(result.medicines),
          error: null,
        },
      });

      return NextResponse.json({
        success: true,
        status: 'completed',
        medicinesCount: result.medicines.length,
        medicines: result.medicines,
      });
    } else {
      await prisma.pdfImportJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          error: result.errorMessage || 'No medicines found',
        },
      });

      return NextResponse.json({
        success: false,
        message: result.errorMessage || 'No medicines found in the text',
        errorCode: result.errorCode,
      }, { status: 400 });
    }
  } catch (error) {
    console.error('❌ Batch process error:', error);
    return NextResponse.json({ success: false, message: 'Failed to process batch job' }, { status: 500 });
  }
}
