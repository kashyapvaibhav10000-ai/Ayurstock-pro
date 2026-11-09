import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { aiAllowanceError } from '@/lib/ai/allowance';
import { MAX_AI_TEXT_CHARS, parsePDFWithAI, parseTextWithAI, parseImageWithGeminiVision } from '@/lib/aiParser';
import { prisma } from '@/lib/db';
import { storePurchaseDocument } from '@/lib/purchase-record';
import { detectFileType } from '@/lib/upload';

// Dedicated Vision-based import pipeline for price lists and invoices

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);

    if (!auth.authenticated || !auth.user) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
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

    // ── Path A: Pre-extracted text from client-side OCR ──────────────
    if (extractedText && extractedText.trim().length > 0) {
      console.log('📝 [import-price-list] Using pre-extracted text from OCR');

      const result = await parseTextWithAI(extractedText, { feature: 'INVOICE_IMPORT', shopId: auth.user.shopId });

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

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, message: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      );
    }

    console.log('📄 [import-price-list] Processing:', file.name, file.size, 'bytes');
    const buffer = Buffer.from(await file.arrayBuffer());

    // The declared type is a hint; decide from the bytes.
    const detected = detectFileType(buffer);
    if (!detected) {
      return NextResponse.json(
        { success: false, message: 'Only PDF and image files are accepted' },
        { status: 400 }
      );
    }
    const isImage = detected.kind === 'image';

    // Keep the original file so the resulting purchase can link to it. The
    // id is returned on every response (incl. NO_TEXT, where the client
    // retries with OCR text) and sent back with the bulk import.
    const documentId = await storePurchaseDocument(prisma, {
      shopId: auth.user.shopId,
      userId: auth.user.id,
      fileName: file.name,
      mimeType: detected.mime,
      data: buffer,
    });

    if (isImage) {
      console.log('🖼️ [import-price-list] Processing with Vision API:', file.name);
      try {
        const result = await parseImageWithGeminiVision(buffer, detected.mime, { feature: 'INVOICE_IMPORT', shopId: auth.user.shopId });

        if (result.errorCode || result.medicines.length === 0) {
          return NextResponse.json({
            success: false,
            message: result.errorMessage || 'No medicines found in the image',
            errorCode: result.errorCode || 'AI_FAILED',
            pdfType: 'scanned',
          }, { status: 400 });
        }

        return NextResponse.json({
          success: true,
          medicines: result.medicines,
          count: result.medicines.length,
          pdfType: 'scanned',
          provider: result.provider,
          documentId,
        }, { headers: { 'X-AI-Provider': result.provider || 'gemini' } });
      } catch (err) {
        console.error('🖼️ Vision API failed:', err);
        return NextResponse.json({
          success: false,
          message: 'Failed to process image. Please try again or upload a PDF instead.',
          errorCode: 'AI_FAILED',
          pdfType: 'scanned',
          documentId,
        }, { status: 400 });
      }
    }

    // ── Path C: PDF file ────────────────────────────────────────────
    const result = await parsePDFWithAI(buffer, { feature: 'INVOICE_IMPORT', shopId: auth.user.shopId });

    // Scanned PDF — let UI offer client-side OCR
    if (result.errorCode === 'NO_TEXT') {
      return NextResponse.json({
        success: false,
        message: result.errorMessage,
        errorCode: 'NO_TEXT',
        pdfType: 'scanned',
        documentId,
      }, { status: 200 });
    }

    if (result.errorCode || result.medicines.length === 0) {
      return NextResponse.json({
        success: false,
        message: result.errorMessage || 'No medicines found in the file',
        errorCode: result.errorCode,
        pdfType: result.pdfType,
        documentId,
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      medicines: result.medicines,
      count: result.medicines.length,
      pdfType: result.pdfType,
      provider: result.provider,
      documentId,
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
