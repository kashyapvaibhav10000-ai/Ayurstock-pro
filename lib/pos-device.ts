import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sha256 } from '@/lib/pin';

export const DEVICE_COOKIE = 'pos-device';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export const PAIRING_CODE_TTL_MS = 10 * 60_000;
export const PIN_MAX_FAILURES = 5;
export const PIN_LOCKOUT_MS = 15 * 60_000;

export function setDeviceCookie(response: NextResponse, token: string) {
  response.cookies.set(DEVICE_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
  });
}

export function clearDeviceCookie(response: NextResponse) {
  response.cookies.set(DEVICE_COOKIE, '', { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 0 });
}

/** The paired, unrevoked device this request comes from, or null. */
export async function getRequestDevice(request: NextRequest) {
  const token = request.cookies.get(DEVICE_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const device = await prisma.posDevice.findUnique({
    where: { tokenHash: sha256(token) },
    include: { shop: { select: { id: true, name: true } } },
  });
  if (!device || device.revokedAt) return null;
  return device;
}
