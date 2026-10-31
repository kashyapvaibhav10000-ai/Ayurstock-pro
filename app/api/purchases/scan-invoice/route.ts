import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { parseMedicineImportFile } from '@/lib/medicine-importer';
import { parsePurchaseInvoiceText } from '@/lib/purchase-invoice-parser';
import { prisma } from '@/lib/db';
import { storePurchaseDocument } from '@/lib/purchase-record';
import Tesseract from 'tesseract.js';
import { detectFileType, runLimited, withTimeout } from '@/lib/upload';

const MAX_TEXT_PAGES = 50;
const OCR_TIMEOUT_MS = 60_000;

const STOPWORDS = new Set(['tab', 'tabs', 'tablet', 'caps', 'capsule', 'strip', 'bottle', 'pack', 'syrup']);

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string) {
  return normalizeName(value)
    .split(' ')
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function similarityScore(a: string, b: string) {
  const aTokens = new Set(tokenize(a));
  const bTokens = new Set(tokenize(b));
  if (aTokens.size === 0 || bTokens.size === 0) {
    return 0;
  }
  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    if (!['ADMIN', 'MANAGER'].includes(auth.user.role)) {
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

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ success: false, message: 'File too large. Maximum size is 10MB.' }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());

    // The declared type is a hint; decide from the bytes.
    const detected = detectFileType(buffer);
    if (!detected) {
      return NextResponse.json({ success: false, message: 'Only PDF, PNG, JPEG or WebP files are accepted' }, { status: 400 });
    }
    const fileType = detected.mime;

    // Keep the original invoice; the purchase saved from these lines links to it.
    const documentId = await storePurchaseDocument(prisma, {
      shopId: auth.user.shopId,
      userId: auth.user.id,
      fileName: file.name,
      mimeType: fileType,
      data: buffer,
    });

    let parsedRows: Array<{
      name: string;
      company?: string;
      mrp?: number;
      tradePrice?: number;
      purchaseRate?: number;
      batchNumber?: string;
      expiryDate?: string;
      quantity?: number;
    }> = [];

    // OCR needs hundreds of MB; run one at a time on this server.
    const parsed = await runLimited('ocr', 1, async () => {
      if (fileType === 'application/pdf') {
        try {
          const pdfjsLib = await import('pdfjs-dist');
          const loadingTask = pdfjsLib.getDocument({ data: buffer });
          const pdf = await loadingTask.promise;
          let fullText = '';
          for (let i = 1; i <= Math.min(pdf.numPages, MAX_TEXT_PAGES); i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
              .map((item: any) => item.str)
              .join(' ');
            fullText += pageText + '\n';
          }
          parsedRows = parsePurchaseInvoiceText(fullText);
        } catch (error) {
          console.warn('PDF text parse failed, falling back to OCR:', error);
        }
      }

      if (parsedRows.length === 0 && fileType === 'application/pdf') {
        try {
          const { pdf } = await import('pdf-to-img');
          const dataUrl = `data:application/pdf;base64,${buffer.toString('base64')}`;
          const document = await pdf(dataUrl, { scale: 2 });
          let combinedText = '';
          let pageCount = 0;

          for await (const image of document) {
            const result = await withTimeout(Tesseract.recognize(image, 'eng+hin', { logger: () => {} }), OCR_TIMEOUT_MS, 'OCR');
            combinedText += `\n${result.data.text || ''}`;
            pageCount += 1;
            if (pageCount >= 2) break;
          }

          parsedRows = parsePurchaseInvoiceText(combinedText);
        } catch (error) {
          console.warn('PDF OCR fallback failed:', error);
        }
      }

      if (parsedRows.length === 0 && detected.kind === 'image') {
        const result = await withTimeout(Tesseract.recognize(buffer, 'eng+hin', { logger: () => {} }), OCR_TIMEOUT_MS, 'OCR');
        parsedRows = parsePurchaseInvoiceText(result.data.text || '');
      }

      if (parsedRows.length === 0) {
        const typedFile = new File([new Uint8Array(buffer)], file.name, { type: fileType });
        parsedRows = await withTimeout(parseMedicineImportFile(typedFile, buffer), OCR_TIMEOUT_MS * 2, 'Import parse');
      }
      return parsedRows;
    }).catch((error) => {
      console.warn('Invoice parse failed:', error instanceof Error ? error.message : error);
      return { busy: false as const, value: [] as typeof parsedRows };
    });
    if (parsed.busy) {
      return NextResponse.json({ success: false, message: 'Another invoice is being read. Try again in a minute.' }, { status: 429 });
    }
    parsedRows = parsed.value;

    const medicines = await prisma.medicine.findMany({
      where: {
        shopId: auth.user.shopId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        company: true,
        category: true,
        hsn: true,
        unit: true,
      },
    });

    const medicineMap = new Map(medicines.map((medicine) => [normalizeName(medicine.name), medicine]));

    const items = parsedRows.map((row, index) => {
      const normalizedName = normalizeName(row.name);
      let matchedMedicine = medicineMap.get(normalizedName);
      let matchScore = matchedMedicine ? 1 : 0;
      let suggestedMatch: { id: string; name: string; score: number } | null = null;

      if (!matchedMedicine) {
        const exact = medicines.find(
          (medicine) =>
            normalizeName(medicine.name) === normalizedName ||
            normalizeName(medicine.name).includes(normalizedName) ||
            normalizedName.includes(normalizeName(medicine.name))
        );
        matchedMedicine = exact;
        if (matchedMedicine) {
          matchScore = 0.9;
        }
      }

      if (!matchedMedicine) {
        let bestScore = 0;
        let bestMatch: typeof medicines[number] | undefined;
        for (const medicine of medicines) {
          const score = similarityScore(row.name, medicine.name);
          if (score > bestScore) {
            bestScore = score;
            bestMatch = medicine;
          }
        }
        if (bestMatch) {
          matchScore = bestScore;
          suggestedMatch = {
            id: bestMatch.id,
            name: bestMatch.name,
            score: Math.round(bestScore * 100) / 100,
          };
          if (bestScore >= 0.85) {
            matchedMedicine = bestMatch;
          }
        }
      }

      return {
        tempId: `${Date.now()}-${index}`,
        medicineId: matchedMedicine?.id || '',
        medicineName: row.name,
        company: matchedMedicine?.company || row.company || '',
        matched: Boolean(matchedMedicine),
        matchScore: Math.round(matchScore * 100) / 100,
        suggestedMatch,
        matchStatus: matchedMedicine
          ? 'matched'
          : matchScore >= 0.6
            ? 'possible'
            : 'new',
        batchNumber: row.batchNumber || '',
        expiryDate: row.expiryDate || '',
        quantity: typeof row.quantity === 'number' ? row.quantity : 1,
        freeQty: 0,
        purchaseRate:
          typeof row.tradePrice === 'number'
            ? row.tradePrice
            : typeof row.purchaseRate === 'number'
              ? row.purchaseRate
              : 0,
        mrp: typeof row.mrp === 'number' ? row.mrp : 0,
        discount: 0,
        gst: 0,
        scheme: '',
        rackLocation: '',
      };
    });

    return NextResponse.json({
      success: true,
      data: items,
      documentId,
      message: `Detected ${items.length} purchase lines from invoice`,
    });
  } catch (error) {
    console.error('Scan purchase invoice error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to scan invoice' },
      { status: 500 }
    );
  }
}
