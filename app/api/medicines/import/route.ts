import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { parseMedicineImportFile, ParsedMedicineImportRow } from '@/lib/medicine-importer';
import { parsePDFWithAI } from '@/lib/aiParser';
import { importJobStore } from '@/lib/importJobStore';
import { randomUUID } from 'node:crypto';

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

    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json({
        success: false,
        message: 'File too large. Please upload a PDF smaller than 4MB. Try splitting your price list into smaller files.'
      }, { status: 400 });
    }

    // Generate job ID and create job record
    const jobId = randomUUID();

    // Only use AI vision for PDF imports
    const buffer = Buffer.from(await file.arrayBuffer());
    let rows: ParsedMedicineImportRow[] = [];

    if (file.type === 'application/pdf') {
      try {
        const aiMedicines = await parsePDFWithAI(buffer);
        if (aiMedicines.length > 0) {
          rows = aiMedicines.map(med => ({
            name: med.name,
            company: '',
            category: '',
            hsn: '',
            barcode: '',
            rackLocation: '',
            mrp: med.mrp,
            packing: med.packing,
            tradePrice: med.tradePrice,
            sourceType: 'ai-vision' as const,
          }));
        }
      } catch (error) {
        return NextResponse.json({
          success: false,
          message: 'AI vision parsing failed. Please try a different file or contact support.'
        }, { status: 500 });
      }
    } else {
      return NextResponse.json({
        success: false,
        message: 'Only PDF files are supported for import.'
      }, { status: 400 });
    }

    if (rows.length === 0) {
      await importJobStore.createJob(jobId, 0);
      await importJobStore.updateJob(jobId, {
        status: 'error',
        error: 'No medicines found in the file',
      });
      return NextResponse.json({
        success: false,
        message: 'No medicines found in the file',
      }, { status: 400 });
    }

    // Create job and mark as completed immediately
    await importJobStore.createJob(jobId, 1);
    await importJobStore.updateJob(jobId, {
      status: 'done',
      currentPage: 1,
      totalPages: 1,
      medicines: rows,
      message: `Extracted ${rows.length} medicines`,
    });

    return NextResponse.json({
      success: true,
      jobId,
      message: 'Import job created. Check progress at /api/medicines/import/progress',
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
