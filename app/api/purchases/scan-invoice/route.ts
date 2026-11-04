export const maxDuration = 300;
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { aiAllowanceError } from '@/lib/ai/allowance';
import { ParsedMedicine, parseImageWithGeminiVision, parsePDFWithAI } from '@/lib/aiParser';
import { parseMedicineImportFile } from '@/lib/medicine-importer';
import { parsePurchaseInvoiceText } from '@/lib/purchase-invoice-parser';
import { prisma } from '@/lib/db';
import { storePurchaseDocument } from '@/lib/purchase-record';
import Tesseract from 'tesseract.js';
import { UploadKind, detectFileType, withTimeout, runLimited } from '@/lib/upload';

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

interface ScannedRow {
  name: string;
  company?: string;
  mrp?: number;
  tradePrice?: number;
  purchaseRate?: number;
  batchNumber?: string;
  expiryDate?: string;
  quantity?: number;
}

const positive = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

function fromAi(m: ParsedMedicine): ScannedRow {
  const expiry = m.expiryDate && /^\d{4}-\d{2}-\d{2}$/.test(m.expiryDate) ? m.expiryDate : undefined;
  const batch = m.batchNo && m.batchNo.toUpperCase() !== 'NA' ? m.batchNo : undefined;
  return {
    name: m.name.trim(),
    company: m.company || undefined,
    mrp: positive(m.mrp),
    purchaseRate: positive(m.purchaseRate) ?? positive(m.tradePrice),
    batchNumber: batch,
    expiryDate: expiry,
    quantity: positive(m.quantity),
  };
}

/**
 * Text of a PDF with its line breaks kept: the invoice parser works line by
 * line, so joining a page into one string made every page one "line" that
 * the header filter (GST/Total) then threw away. The legacy build is the
 * one that runs on Node 20 (the modern build needs Promise.withResolvers).
 */
async function pdfText(buffer: Buffer): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise;
  let fullText = '';
  for (let i = 1; i <= Math.min(pdf.numPages, MAX_TEXT_PAGES); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!('str' in item)) continue;
      fullText += item.str;
      fullText += item.hasEOL ? '\n' : ' ';
    }
    fullText += '\n';
  }
  await pdf.destroy();
  return fullText;
}

async function parseLocally(buffer: Buffer, kind: UploadKind, fileName: string, fileType: string): Promise<ScannedRow[]> {
  let rows: ScannedRow[] = [];

  if (kind === 'pdf') {
    try {
      rows = parsePurchaseInvoiceText(await pdfText(buffer));
    } catch (error) {
      console.warn('PDF text parse failed, falling back to OCR:', error);
    }

    if (rows.length === 0) {
      try {
        const { pdf } = await import('pdf-to-img');
        const document = await pdf(buffer, { scale: 2 });
        let combinedText = '';
        let pageCount = 0;
        for await (const image of document) {
          const result = await withTimeout(Tesseract.recognize(image, 'eng', { logger: () => {} }), OCR_TIMEOUT_MS, 'OCR');
          combinedText += `\n${result.data.text || ''}`;
          pageCount += 1;
          if (pageCount >= 2) break;
        }
        rows = parsePurchaseInvoiceText(combinedText);
      } catch (error) {
        console.warn('PDF OCR fallback failed:', error);
      }
    }
  } else {
    const result = await withTimeout(Tesseract.recognize(buffer, 'eng', { logger: () => {} }), OCR_TIMEOUT_MS, 'OCR');
    rows = parsePurchaseInvoiceText(result.data.text || '');
  }

  if (rows.length === 0) {
    const typedFile = new File([new Uint8Array(buffer)], fileName, { type: fileType });
    rows = await withTimeout(parseMedicineImportFile(typedFile, buffer), OCR_TIMEOUT_MS * 2, 'Import parse');
  }
  return rows;
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

    // AI first (reads tables far better than OCR + regex); local OCR is the
    // fallback when no provider is configured, the shop cap is hit, or AI
    // finds nothing.
    let parsedRows: ScannedRow[] = [];
    let source: 'ai' | 'ocr' = 'ocr';
    let aiError: string | undefined;

    const aiDenied = await aiAllowanceError(auth.user);
    if (!aiDenied) {
      try {
        const ctx = { feature: 'INVOICE_IMPORT' as const, shopId: auth.user.shopId };
        const result = detected.kind === 'pdf'
          ? await parsePDFWithAI(buffer, ctx)
          : await parseImageWithGeminiVision(buffer, fileType, ctx);
        parsedRows = result.medicines.filter((m) => m.name?.trim()).map(fromAi);
        if (parsedRows.length > 0) source = 'ai';
        else aiError = result.errorMessage;
      } catch (error) {
        aiError = error instanceof Error ? error.message : String(error);
        console.warn('AI invoice parse failed, falling back to OCR:', aiError);
      }
    }

    if (parsedRows.length === 0) {
      // OCR needs hundreds of MB; run one at a time on this server.
      const parsed = await runLimited('ocr', 1, () => parseLocally(buffer, detected.kind, file.name, fileType))
        .catch((error) => {
          console.warn('Invoice parse failed:', error instanceof Error ? error.message : error);
          return { busy: false as const, value: [] as ScannedRow[] };
        });
      if (parsed.busy) {
        return NextResponse.json({ success: false, message: 'Another invoice is being read. Try again in a minute.' }, { status: 429 });
      }
      parsedRows = parsed.value;
    }

    if (parsedRows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          documentId,
          message: aiError
            ? `Could not read any medicine lines from this invoice (${aiError}). Try a clearer photo or a PDF.`
            : 'Could not read any medicine lines from this invoice. Try a clearer photo or a PDF.',
        },
        { status: 422 }
      );
    }

    const medicines = await prisma.medicine.findMany({
      where: {
        shopId: auth.user.shopId,
        isActive: true,
        deletedAt: null,
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
        quantity: positive(row.quantity) ?? 1,
        freeQty: 0,
        purchaseRate: positive(row.purchaseRate) ?? positive(row.tradePrice) ?? 0,
        mrp: positive(row.mrp) ?? 0,
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
      source,
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
