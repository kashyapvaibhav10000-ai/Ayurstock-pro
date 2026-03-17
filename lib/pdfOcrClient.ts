'use client';

/**
 * Client-side PDF OCR utility.
 * Runs entirely in the browser — no server costs, no Vercel timeouts.
 *
 * Flow: PDF → pdfjs-dist renders pages to canvas → tesseract.js OCRs each page → combined text returned.
 */

export interface OcrProgress {
  phase: 'loading' | 'rendering' | 'ocr' | 'done' | 'error';
  page: number;
  totalPages: number;
  percent: number;
  message: string;
}

export type OcrProgressCallback = (progress: OcrProgress) => void;

/**
 * Extract text from a PDF using client-side OCR.
 * @param file - The PDF File object
 * @param onProgress - Callback for progress updates
 * @returns Extracted text from all pages
 */
export async function ocrPdfInBrowser(
  file: File,
  onProgress?: OcrProgressCallback
): Promise<string> {
  const report = (p: Partial<OcrProgress>) =>
    onProgress?.({
      phase: 'loading',
      page: 0,
      totalPages: 0,
      percent: 0,
      message: '',
      ...p,
    });

  try {
    // ── 1. Load PDF or Image ──────────────────────────────────────────────────
    let pageImages: string[] = [];
    let maxPages = 1;

    if (file.type === 'application/pdf') {
      report({ phase: 'loading', message: 'Loading PDF...' });

      // Use specific loading for Next.js to avoid ESM Object.defineProperty crash
      const pdfjsLib = await import('pdfjs-dist/build/pdf.min.mjs');
      
      if (typeof window !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
      }

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdf.numPages;
      maxPages = Math.min(totalPages, 50); // Cap at 50 pages

      report({
        phase: 'loading',
        totalPages: maxPages,
        percent: 5,
        message: `PDF loaded — ${totalPages} page${totalPages > 1 ? 's' : ''}${totalPages > 50 ? ' (processing first 50)' : ''}`,
      });

      // ── 2. Render pages to canvas and collect image data ────────────────
      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        report({
          phase: 'rendering',
          page: pageNum,
          totalPages: maxPages,
          percent: 5 + Math.round((pageNum / maxPages) * 20),
          message: `Rendering page ${pageNum} of ${maxPages}...`,
        });

        const page = await pdf.getPage(pageNum);
        const scale = 2.0; // Higher scale = better OCR accuracy
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to create canvas context');

        await page.render({ canvasContext: ctx, viewport }).promise;

        const dataUrl = canvas.toDataURL('image/png');
        pageImages.push(dataUrl);

        canvas.width = 0;
        canvas.height = 0;
      }
    } else if (file.type.startsWith('image/')) {
      report({ phase: 'loading', message: 'Loading image...' });
      
      const arrayBuffer = await file.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: file.type });
      
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      
      pageImages.push(dataUrl);
    } else {
      throw new Error('Unsupported file type for OCR. Please use PDF or an image file.');
    }



    // ── 3. OCR each page image with Tesseract.js ───────────────────────
    report({
      phase: 'ocr',
      page: 0,
      totalPages: maxPages,
      percent: 25,
      message: 'Starting OCR engine...',
    });

    const Tesseract = await import('tesseract.js');
    const worker = await Tesseract.createWorker('eng', undefined, {
      logger: (m: any) => {
        // Tesseract progress updates during recognition
        if (m.status === 'recognizing text' && typeof m.progress === 'number') {
          // We'll get more accurate per-page progress in the loop below
        }
      },
    });

    const allText: string[] = [];

    for (let i = 0; i < pageImages.length; i++) {
      const pageNum = i + 1;
      report({
        phase: 'ocr',
        page: pageNum,
        totalPages: maxPages,
        percent: 25 + Math.round((pageNum / maxPages) * 70),
        message: `OCR processing page ${pageNum} of ${maxPages}...`,
      });

      const result = await worker.recognize(pageImages[i]);
      const text = result.data.text.trim();

      if (text) {
        allText.push(text);
      }
    }

    await worker.terminate();

    const combinedText = allText.join('\n\n');

    report({
      phase: 'done',
      page: maxPages,
      totalPages: maxPages,
      percent: 100,
      message: combinedText
        ? `OCR complete — extracted ${combinedText.length} characters from ${maxPages} pages`
        : 'OCR complete — no text could be extracted',
    });

    return combinedText;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown OCR error';

    report({
      phase: 'error',
      page: 0,
      totalPages: 0,
      percent: 0,
      message: `OCR failed: ${message}`,
    });

    throw new Error(`Client-side OCR failed: ${message}`);
  }
}

/**
 * Try to extract text from a PDF using pdf2json-style text extraction (lightweight).
 * Returns empty string if PDF is scanned/image-based.
 * This runs client-side using pdfjs-dist's built-in text layer.
 */
export async function extractTextFromPdf(file: File): Promise<string> {
  try {
    const pdfjsLib = await import('pdfjs-dist/build/pdf.min.mjs');

    if (typeof window !== 'undefined') {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = Math.min(pdf.numPages, 100);

    const allText: string[] = [];

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => ('str' in item ? item.str : ''))
        .join(' ')
        .trim();

      if (pageText) {
        allText.push(pageText);
      }
    }

    return allText.join('\n');
  } catch {
    return '';
  }
}
