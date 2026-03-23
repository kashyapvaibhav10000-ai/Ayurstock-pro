import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { parsePDFWithAI, parseTextWithAI } from '@/lib/aiParser';

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);

    if (!auth.authenticated || !auth.user) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const extractedText = formData.get('extractedText') as string | null;

    // ── Path A: Pre-extracted text from client-side OCR ──────────────
    if (extractedText && extractedText.trim().length > 0) {
      console.log('📝 [import-price-list] Using pre-extracted text from OCR');

      const result = await parseTextWithAI(extractedText);

      if (result.errorCode || result.medicines.length === 0) {
        return NextResponse.json({
          success: false,
          message: result.errorMessage || 'No medicines found in extracted text',
          errorCode: result.errorCode,
          pdfType: result.pdfType,
        }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        medicines: result.medicines,
        count: result.medicines.length,
        pdfType: result.pdfType,
        provider: result.provider,
      }, { headers: { 'X-AI-Provider': result.provider || 'none' } });
    }

    // ── Path B: File upload ──────────────────────────────────────────
    if (!file) {
      return NextResponse.json(
        { success: false, message: 'No file or text provided' },
        { status: 400 }
      );
    }

    const isImage = file.type.startsWith('image/');
    const isPdf = file.type.includes('pdf');
    if (!isPdf && !isImage) {
      return NextResponse.json(
        { success: false, message: 'Only PDF and image files are accepted' },
        { status: 400 }
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, message: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      );
    }

    console.log('📄 [import-price-list] Processing:', file.name, file.size, 'bytes');

    if (isImage) {
      // Images must come through client-side OCR — if they reach here raw, reject with NO_TEXT
      return NextResponse.json({
        success: false,
        message: 'Image detected. Please use the OCR button to extract text first.',
        errorCode: 'NO_TEXT',
        pdfType: 'scanned',
      }, { status: 200 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await parsePDFWithAI(buffer);

    // Scanned PDF — let UI offer client-side OCR
    if (result.errorCode === 'NO_TEXT') {
      return NextResponse.json({
        success: false,
        message: result.errorMessage,
        errorCode: 'NO_TEXT',
        pdfType: 'scanned',
      }, { status: 200 });
    }

    if (result.errorCode || result.medicines.length === 0) {
      return NextResponse.json({
        success: false,
        message: result.errorMessage || 'No medicines found in the file',
        errorCode: result.errorCode,
        pdfType: result.pdfType,
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      medicines: result.medicines,
      count: result.medicines.length,
      pdfType: result.pdfType,
      provider: result.provider,
    }, { headers: { 'X-AI-Provider': result.provider || 'none' } });
  } catch (error) {
    console.error('❌ [import-price-list] Error:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to process file',
      errorCode: 'PARSE_ERROR',
    }, { status: 500 });
  }
}
