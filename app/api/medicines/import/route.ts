export const maxDuration = 300;
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { aiAllowanceError } from '@/lib/ai/allowance';
import { MAX_AI_TEXT_CHARS, parsePDFWithAI, parseTextWithAI } from '@/lib/aiParser';
import { prisma } from '@/lib/db';
import { MAX_UPLOAD_BYTES, detectFileType } from '@/lib/upload';

export async function POST(req: NextRequest) {
  try {
    console.log('🔍 Medicine import request received');

    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const denied = await aiAllowanceError(auth.user);
    if (denied) return denied;

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const extractedText = formData.get('extractedText') as string | null;
    if (typeof extractedText === 'string' && extractedText.length > MAX_AI_TEXT_CHARS) {
      return NextResponse.json(
        { success: false, message: 'Text is too long to process. Split the document and import it in parts.', errorCode: 'TEXT_TOO_LONG' },
        { status: 400 }
      );
    }

    if (!file && (!extractedText || extractedText.trim().length === 0)) {
      return NextResponse.json({ success: false, message: 'No file or text provided' }, { status: 400 });
    }

    const existingJob = await prisma.importJob.findFirst({
      where: { 
        shopId: auth.user.shopId,
        status: 'processing' 
      }
    });

    if (existingJob) {
      console.log('⚠️ Active job already exists. Returning existing jobId.');
      return NextResponse.json({ success: true, jobId: existingJob.id }, { status: 202 });
    }

    let buffer: Buffer | null = null;
    if (file) {
      if (file.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json({ success: false, message: 'File too large. Maximum size is 20MB.' }, { status: 400 });
      }
      buffer = Buffer.from(await file.arrayBuffer());
      if (detectFileType(buffer)?.kind !== 'pdf') {
        return NextResponse.json({ success: false, message: 'Only PDF files are accepted' }, { status: 400 });
      }
    }

    // Create background job
    const job = await prisma.importJob.create({
      data: {
        shopId: auth.user.shopId,
        status: 'processing',
        message: 'Starting AI parsing...',
      }
    });

    // Fire and forget
    processJobInBackground(job.id, auth.user.shopId, buffer, extractedText).catch(console.error);

    return NextResponse.json({ success: true, jobId: job.id }, { status: 202 });

  } catch (error) {
    console.error('❌ Import initial error:', error);
    return NextResponse.json({ success: false, message: 'Failed to start import job' }, { status: 500 });
  }
}

async function processJobInBackground(jobId: string, shopId: string, pdfBuffer: Buffer | null, extractedText: string | null) {
  try {
    const ctx = { feature: 'MEDICINE_IMPORT' as const, shopId };
    let result;
    if (extractedText && extractedText.trim().length > 0) {
      result = await parseTextWithAI(extractedText, ctx);
    } else if (pdfBuffer) {
      result = await parsePDFWithAI(pdfBuffer, ctx);
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
