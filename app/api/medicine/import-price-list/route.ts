import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { parsePDFWithAI, parseTextWithAI } from '@/lib/aiParser';

// ── Upgrade 7: Server-side OCR with Tesseract.js ────────────────────────
async function extractTextWithTesseract(imageBuffer: Buffer): Promise<string> {
  try {
    const path = await import('path');
    const workerPath = path.join(process.cwd(), 'node_modules', 'tesseract.js', 'src', 'worker-script', 'node', 'index.js');
    const Tesseract = await import('tesseract.js');
    const worker = await Tesseract.createWorker('eng', 1, { workerPath });
    const { data } = await worker.recognize(imageBuffer);
    await worker.terminate();
    return data.text || '';
  } catch (err) {
    console.warn('⚠ Tesseract OCR failed:', err);
    return '';
  }
}
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
    const buffer = Buffer.from(await file.arrayBuffer());

    if (isImage) {
      // ── Upgrade 7: OCR-first approach for images ──────────────────
      // Step 1: Try Tesseract OCR first (cheaper, faster)
      console.log('🔍 [import-price-list] Step 1: Trying Tesseract OCR on image...');
      const ocrText = await extractTextWithTesseract(buffer);

      if (ocrText.trim().length > 100) {
        // Step 2: OCR worked — send clean text to text LLM
        console.log(`✅ [import-price-list] Tesseract extracted ${ocrText.length} chars. Using text LLM.`);
        try {
          const result = await parseTextWithAI(ocrText);

          if (result.medicines.length > 0) {
            console.log(`✅ [import-price-list] Text LLM extracted ${result.medicines.length} medicines from OCR text`);
            return NextResponse.json({
              success: true,
              medicines: result.medicines,
              count: result.medicines.length,
              pdfType: 'scanned',
              provider: `ocr+${result.provider || 'text'}`,
            }, { headers: { 'X-AI-Provider': `ocr+${result.provider || 'text'}` } });
          }

          console.warn('⚠️ [import-price-list] Text LLM found 0 medicines from OCR text. Falling back to Vision API.');
        } catch (err) {
          console.warn('⚠️ [import-price-list] Text LLM failed on OCR text. Falling back to Vision API.', err);
        }
      } else {
        console.log(`⚠️ [import-price-list] Tesseract extracted only ${ocrText.trim().length} chars. Falling back to Vision API.`);
      }

      // Step 3: Fallback to Vision API (original approach)
      console.log('🖼️ [import-price-list] Falling back to Vision API:', file.name);
      try {
        const { parseImageWithGeminiVision } = await import('@/lib/aiParser');
        const result = await parseImageWithGeminiVision(buffer, file.type);

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
        }, { headers: { 'X-AI-Provider': result.provider || 'gemini' } });
      } catch (err) {
        console.error('🖼️ Vision API failed:', err);
        return NextResponse.json({
          success: false,
          message: 'Failed to process image. Please try again or upload a PDF instead.',
          errorCode: 'AI_FAILED',
          pdfType: 'scanned',
        }, { status: 400 });
      }
    }

    // ── Path C: PDF file ────────────────────────────────────────────
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
