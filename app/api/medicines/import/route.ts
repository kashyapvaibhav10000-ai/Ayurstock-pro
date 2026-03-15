import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { parsePDFWithAI } from '@/lib/aiParser';

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, message: 'No file provided' }, { status: 400 });
    }

    if (!file.type.includes('pdf')) {
      return NextResponse.json({ success: false, message: 'Only PDF files are accepted' }, { status: 400 });
    }

    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json({ success: false, message: 'File too large. Maximum size is 4MB.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const medicines = await parsePDFWithAI(buffer);

    if (!medicines || medicines.length === 0) {
      return NextResponse.json({ success: false, message: 'No medicines found in the file' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      medicines,
      count: medicines.length,
    });

  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({ success: false, message: 'Failed to process file' }, { status: 500 });
  }
}
