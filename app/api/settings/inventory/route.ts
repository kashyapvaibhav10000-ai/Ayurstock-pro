import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest, createErrorResponse } from '@/middleware/auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return createErrorResponse('Unauthorized', 401);

    const { shopId } = auth.user;

    let settings = await prisma.shopSettings.findUnique({
      where: { shopId },
    });

    if (!settings) {
      settings = await prisma.shopSettings.create({
        data: { shopId },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        enableBatchTracking: settings.enableBatchTracking,
        enableExpiryTracking: settings.enableExpiryTracking,
        autoFEFOBilling: settings.autoFEFOBilling,
        lowStockThreshold: settings.lowStockThreshold,
        nearExpiryDays: settings.nearExpiryDays,
      },
    });
  } catch (error) {
    console.error('Inventory settings GET error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return createErrorResponse('Unauthorized', 401);
    if (auth.user.role !== 'ADMIN') return createErrorResponse('Admin only', 403);

    const { shopId } = auth.user;
    const body = await request.json();

    const {
      enableBatchTracking,
      enableExpiryTracking,
      autoFEFOBilling,
      lowStockThreshold,
      nearExpiryDays,
    } = body;

    const updated = await prisma.shopSettings.upsert({
      where: { shopId },
      update: {
        enableBatchTracking,
        enableExpiryTracking,
        autoFEFOBilling,
        lowStockThreshold,
        nearExpiryDays,
      },
      create: {
        shopId,
        enableBatchTracking,
        enableExpiryTracking,
        autoFEFOBilling,
        lowStockThreshold,
        nearExpiryDays,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        enableBatchTracking: updated.enableBatchTracking,
        enableExpiryTracking: updated.enableExpiryTracking,
        autoFEFOBilling: updated.autoFEFOBilling,
        lowStockThreshold: updated.lowStockThreshold,
        nearExpiryDays: updated.nearExpiryDays,
      },
    });
  } catch (error) {
    console.error('Inventory settings PATCH error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}
