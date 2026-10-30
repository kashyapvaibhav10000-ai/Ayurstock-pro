import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest, createErrorResponse } from '@/middleware/auth';

// Only these types are rendered inline; anything else downloads, so an
// uploaded file can never run as HTML/SVG on our origin.
const INLINE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']);

/** Serve a stored invoice file (shop-scoped). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return createErrorResponse('Unauthorized', 401);
    if (!['ADMIN', 'MANAGER'].includes(auth.user.role)) {
      return createErrorResponse('Forbidden - Insufficient permissions', 403);
    }

    const { id } = await params;
    const doc = await prisma.purchaseDocument.findFirst({
      where: { id, shopId: auth.user.shopId },
      select: { fileName: true, mimeType: true, data: true },
    });
    if (!doc) return createErrorResponse('Document not found', 404);

    const inline = INLINE_TYPES.has(doc.mimeType);
    const safeName = doc.fileName.replace(/[^\w.\- ]+/g, '_');

    return new NextResponse(new Uint8Array(doc.data), {
      headers: {
        'Content-Type': inline ? doc.mimeType : 'application/octet-stream',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Purchase document error:', error);
    return createErrorResponse('Failed to load document', 500);
  }
}
