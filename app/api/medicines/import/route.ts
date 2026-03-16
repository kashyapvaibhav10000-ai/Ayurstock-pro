import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { parsePDFWithAI } from '@/lib/aiParser';

export async function POST(req: NextRequest) {
  try {
    console.log('🔍 Medicine import request received');
    console.log('📋 Request headers:', {
      authorization: req.headers.get('authorization')?.substring(0, 30) + '...',
      contentType: req.headers.get('content-type'),
    });

    const auth = await verifyAuth(req);
    
    console.log('🔐 Auth result:', { authenticated: auth.authenticated, userId: auth.user?.id });
    
    if (!auth.authenticated || !auth.user) {
      console.warn('❌ Authentication failed');
      return NextResponse.json(
        { success: false, message: 'Unauthorized' }, 
        { status: 401 }
      );
    }

    console.log('✅ User authenticated:', auth.user.email);

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      console.warn('❌ No file provided');
      return NextResponse.json({ success: false, message: 'No file provided' }, { status: 400 });
    }

    if (!file.type.includes('pdf')) {
      console.warn('❌ Invalid file type:', file.type);
      return NextResponse.json({ success: false, message: 'Only PDF files are accepted' }, { status: 400 });
    }

    if (file.size > 4 * 1024 * 1024) {
      console.warn('❌ File too large:', file.size);
      return NextResponse.json({ success: false, message: 'File too large. Maximum size is 4MB.' }, { status: 400 });
    }

    console.log('📄 Processing file:', file.name, 'Size:', file.size);
    
    const buffer = Buffer.from(await file.arrayBuffer());
    const medicines = await parsePDFWithAI(buffer);

    if (!medicines || medicines.length === 0) {
      console.warn('⚠️ No medicines found in PDF');
      return NextResponse.json({ success: false, message: 'No medicines found in the file' }, { status: 400 });
    }

    console.log('✅ Successfully parsed', medicines.length, 'medicines');
    
    return NextResponse.json({
      success: true,
      medicines,
      count: medicines.length,
    });

  } catch (error) {
    console.error('❌ Import error:', error);
    return NextResponse.json({ success: false, message: 'Failed to process file' }, { status: 500 });
  }
}
