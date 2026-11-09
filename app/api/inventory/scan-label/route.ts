export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { aiAllowanceError } from '@/lib/ai/allowance';
import { runVisionPrompt } from '@/lib/aiParser';
import { LABEL_SCAN_MAX_BYTES, LABEL_SCAN_PROMPT, parseLabelScan } from '@/lib/label-scan';
import { detectFileType } from '@/lib/upload';

const UNREADABLE = "Couldn't read label, enter manually";

/**
 * POST /api/inventory/scan-label (multipart, field "image")
 * Reads one medicine label photo with the shop's AI vision chain and returns
 * the printed fields for the Add Inventory form to pre-fill. ADMIN/MANAGER
 * (same as adding stock), rate limited per user, counted in the shop's daily
 * AI cap. The photo is processed in memory and never stored.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const denied = await aiAllowanceError(auth.user, { key: 'label-scan', limit: 30, windowMs: 10 * 60_000 });
    if (denied) return denied;

    // Refuse big uploads before buffering them (multipart overhead allowed).
    if (Number(req.headers.get('content-length') || 0) > LABEL_SCAN_MAX_BYTES + 64 * 1024) {
      return NextResponse.json({ success: false, message: 'Photo is too large (max 2 MB).' }, { status: 413 });
    }

    const formData = await req.formData().catch(() => null);
    const file = formData?.get('image');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ success: false, message: 'No photo received.' }, { status: 400 });
    }
    if (file.size > LABEL_SCAN_MAX_BYTES) {
      return NextResponse.json({ success: false, message: 'Photo is too large (max 2 MB).' }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    // The declared type is a hint; decide from the bytes.
    const detected = detectFileType(buffer);
    if (!detected || detected.kind !== 'image') {
      return NextResponse.json({ success: false, message: 'Only JPEG, PNG or WebP photos are accepted.' }, { status: 400 });
    }

    const reply = await runVisionPrompt(
      buffer,
      detected.mime,
      LABEL_SCAN_PROMPT,
      { feature: 'LABEL_SCAN', shopId: auth.user.shopId },
      (content) => parseLabelScan(content) !== null
    );
    const result = reply ? parseLabelScan(reply.content) : null;
    if (!result) {
      return NextResponse.json({ success: false, message: UNREADABLE }, { status: 422 });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Label scan error:', error);
    return NextResponse.json({ success: false, message: UNREADABLE }, { status: 500 });
  }
}
