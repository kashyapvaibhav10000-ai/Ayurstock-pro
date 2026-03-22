export const maxDuration = 300;
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { parsePDFWithAI, parseTextWithAI } from '@/lib/aiParser';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    console.log('🔍 Medicine import request received');

    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const extractedText = formData.get('extractedText') as string | null;

    if (!file && (!extractedText || extractedText.trim().length === 0)) {
      return NextResponse.json({ success: false, message: 'No file or text provided' }, { status: 400 });
    }

    const existingJob = await prisma.importJob.findFirst({
      where: { status: 'processing' }
    });

    if (existingJob) {
      console.log('⚠️ Active job already exists. Returning existing jobId.');
      return NextResponse.json({ success: true, jobId: existingJob.id }, { status: 202 });
    }

    let buffer: Buffer | null = null;
    if (file) {
      if (!file.type.includes('pdf')) {
        return NextResponse.json({ success: false, message: 'Only PDF files are accepted' }, { status: 400 });
      }
      if (file.size > 50 * 1024 * 1024) {
        return NextResponse.json({ success: false, message: 'File too large. Maximum size is 50MB.' }, { status: 400 });
      }
      buffer = Buffer.from(await file.arrayBuffer());
    }

    // Create background job
    const job = await prisma.importJob.create({
      data: {
        status: 'processing',
        message: 'Starting AI parsing...',
      }
    });

    // Fire and forget
    processJobInBackground(job.id, buffer, extractedText).catch(console.error);

    return NextResponse.json({ success: true, jobId: job.id }, { status: 202 });

  } catch (error) {
    console.error('❌ Import initial error:', error);
    return NextResponse.json({ success: false, message: 'Failed to start import job' }, { status: 500 });
  }
}

async function processJobInBackground(jobId: string, pdfBuffer: Buffer | null, extractedText: string | null) {
  try {
    let result;
    if (extractedText && extractedText.trim().length > 0) {
      result = await parseTextWithAI(extractedText);
    } else if (pdfBuffer) {
      result = await parsePDFWithAI(pdfBuffer);
    } else {
      throw new Error('No input provided');
    }

    if (result.errorCode === 'NO_TEXT') {
      await prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          error: result.errorMessage,
          message: 'NO_TEXT'
        }
      });
      return;
    }

    if (result.errorCode || result.medicines.length === 0) {
      await prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          error: result.errorMessage || 'No medicines found'
        }
      });
      return;
    }

    await prisma.importJob.update({
      where: { id: jobId },
      data: {
        status: 'done',
        medicines: JSON.stringify(result.medicines),
        message: `Successfully extracted ${result.medicines.length} medicines using ${result.provider || 'AI'}`
      }
    });

  } catch (error: any) {
    console.error('Background processing error:', error);
    try {
      await prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          error: error.message || 'Processing failed'
        }
      });
    } catch (e) {
      console.error('Failed to update job status:', e);
    }
  }
}
