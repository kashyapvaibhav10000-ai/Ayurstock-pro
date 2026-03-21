import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { parsePDFWithAI, parseTextWithAI } from '@/lib/aiParser';

export async function POST(req: NextRequest) {
  try {
    console.log('🔍 Medicine import request received');

    const auth = await verifyAuth(req);
    
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' }, 
        { status: 401 }
      );
    }

    console.log('✅ User authenticated:', auth.user.email);

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const extractedText = formData.get('extractedText') as string | null;

    // ── Path A: Pre-extracted text from client-side OCR ──────────────
    if (extractedText && extractedText.trim().length > 0) {
      console.log('📝 Using pre-extracted text from client-side OCR');
      console.log(`📊 Text length: ${extractedText.length} characters`);

      const result = await parseTextWithAI(extractedText);

      if (result.errorCode || result.medicines.length === 0) {
        return NextResponse.json({
          success: false,
          message: result.errorMessage || 'No medicines found in the extracted text',
          errorCode: result.errorCode,
          pdfType: result.pdfType,
        }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        medicines: result.medicines,
        count: result.medicines.length,
        pdfType: result.pdfType,
      });
    }

    // ── Path B: File upload — extract text on server ─────────────────
    if (!file) {
      return NextResponse.json({ success: false, message: 'No file or text provided' }, { status: 400 });
    }

    if (!file.type.includes('pdf')) {
      return NextResponse.json({ success: false, message: 'Only PDF files are accepted' }, { status: 400 });
    }

    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ success: false, message: 'File too large. Maximum size is 50MB.' }, { status: 400 });
    }

    console.log('📄 Processing file:', file.name, 'Size:', file.size);
    
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await parsePDFWithAI(buffer);

    console.log('📊 Parse result:', {
      medicineCount: result.medicines.length,
      pdfType: result.pdfType,
      errorCode: result.errorCode,
    });

    // If no text was found (scanned PDF), return special response so UI can offer OCR
    if (result.errorCode === 'NO_TEXT') {
      return NextResponse.json({
        success: false,
        message: result.errorMessage,
        errorCode: 'NO_TEXT',
        pdfType: 'scanned',
      }, { status: 200 }); // 200 because it's not really an error — UI will show OCR option
    }

    if (result.errorCode || result.medicines.length === 0) {
      return NextResponse.json({
        success: false,
        message: result.errorMessage || 'No medicines found in the file',
        errorCode: result.errorCode,
        pdfType: result.pdfType,
      }, { status: 400 });
    }

    console.log('✅ Successfully parsed', result.medicines.length, 'medicines');
    
    return NextResponse.json({
      success: true,
      medicines: result.medicines,
      count: result.medicines.length,
      pdfType: result.pdfType,
    });

  } catch (error) {
    console.error('❌ Import error:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to process file',
      errorCode: 'PARSE_ERROR',
    }, { status: 500 });
  }
}
