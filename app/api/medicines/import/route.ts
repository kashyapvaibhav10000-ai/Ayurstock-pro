import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { parseMedicineImportFile } from '@/lib/medicine-importer';

export async function POST(req: NextRequest) {
  try {
    const authResult = await verifyAuth(req);
    if (!authResult.authenticated) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const user = authResult.user!;
    if (!['ADMIN', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(
        { success: false, message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, message: 'No file provided' }, { status: 400 });
    }

    if (!['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      return NextResponse.json(
        { success: false, message: 'Unsupported file type. Please use PDF or image files.' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const rows = await parseMedicineImportFile(file, buffer);

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No medicines found in the file' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: rows,
      message: `Extracted ${rows.length} medicines`,
    });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to process file',
      },
      { status: 500 }
    );
  }
}
