import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { parseMedicineImportFile } from '@/lib/medicine-importer';
import { parsePurchaseInvoiceText } from '@/lib/purchase-invoice-parser';
import { prisma } from '@/lib/db';
import Tesseract from 'tesseract.js';

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

    const buffer = Buffer.from(await file.arrayBuffer());

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

    if (file.type === 'application/pdf') {
      try {
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf');
        const loadingTask = pdfjsLib.getDocument({ data: buffer });
        const pdf = await loadingTask.promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
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

    if (parsedRows.length === 0 && file.type === 'application/pdf') {
      try {
        const { pdf } = await import('pdf-to-img');
        const dataUrl = `data:application/pdf;base64,${buffer.toString('base64')}`;
        const document = await pdf(dataUrl, { scale: 2 });
        let combinedText = '';
        let pageCount = 0;

        for await (const image of document) {
          const result = await Tesseract.recognize(image, 'eng+hin', { logger: () => {} });
          combinedText += `\n${result.data.text || ''}`;
          pageCount += 1;
          if (pageCount >= 2) break;
        }

        parsedRows = parsePurchaseInvoiceText(combinedText);
      } catch (error) {
        console.warn('PDF OCR fallback failed:', error);
      }
    }

    if (parsedRows.length === 0 && ['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      const result = await Tesseract.recognize(buffer, 'eng+hin', { logger: () => {} });
      parsedRows = parsePurchaseInvoiceText(result.data.text || '');
    }

    if (parsedRows.length === 0) {
      parsedRows = await parseMedicineImportFile(file, buffer);
    }

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
