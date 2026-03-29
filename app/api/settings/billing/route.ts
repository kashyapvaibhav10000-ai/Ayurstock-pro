import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest, createApiResponse, createErrorResponse } from '@/middleware/auth';
import { z } from 'zod';

const BillingSettingsSchema = z.object({
  enableRetail: z.boolean(),
  enableWholesale: z.boolean(),
  allowDiscounts: z.boolean(),
  enableBarcode: z.boolean(),
  autoPrintInvoice: z.boolean(),
  gstMode: z.enum(['inclusive', 'exclusive']),
  defaultDiscountPercent: z.number().min(0).max(100),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    const shop = await prisma.shop.findUnique({
      where: { id: auth.user.shopId },
    });

    if (!shop) {
      return createErrorResponse('Shop not found', 404);
    }

    const settings = await prisma.billingSettings.upsert({
      where: { shopId: auth.user.shopId },
      update: {},
      create: {
        shopId: auth.user.shopId,
        enableRetail: true,
        enableWholesale: true,
        allowDiscounts: true,
        enableBarcode: true,
        autoPrintInvoice: false,
        gstMode: 'inclusive',
        defaultDiscountPercent: 0,
      },
    });

    return createApiResponse(true, {
      id: settings.id,
      shopId: settings.shopId,
      enableRetail: settings.enableRetail,
      enableWholesale: settings.enableWholesale,
      allowDiscounts: settings.allowDiscounts,
      enableBarcode: settings.enableBarcode,
      autoPrintInvoice: settings.autoPrintInvoice,
      gstMode: settings.gstMode,
      defaultDiscountPercent: Number(settings.defaultDiscountPercent),
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    });
  } catch (error) {
    console.error('Get billing settings error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    if (!['ADMIN', 'MANAGER'].includes(auth.user.role)) {
      return createErrorResponse('Forbidden - Insufficient permissions', 403);
    }

    const body = await request.json();
    const validation = BillingSettingsSchema.safeParse(body);

    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors;
      return createErrorResponse(`Validation error: ${JSON.stringify(errors)}`, 400);
    }

    const {
      enableRetail,
      enableWholesale,
      allowDiscounts,
      enableBarcode,
      autoPrintInvoice,
      gstMode,
      defaultDiscountPercent,
    } = validation.data;

    const shop = await prisma.shop.findUnique({
      where: { id: auth.user.shopId },
    });

    if (!shop) {
      return createErrorResponse('Shop not found', 404);
    }

    const updated = await prisma.billingSettings.upsert({
      where: { shopId: auth.user.shopId },
      update: {
        enableRetail,
        enableWholesale,
        allowDiscounts,
        enableBarcode,
        autoPrintInvoice,
        gstMode,
        defaultDiscountPercent,
      },
      create: {
        shopId: auth.user.shopId,
        enableRetail,
        enableWholesale,
        allowDiscounts,
        enableBarcode,
        autoPrintInvoice,
        gstMode,
        defaultDiscountPercent,
      },
    });

    return createApiResponse(true, {
      id: updated.id,
      shopId: updated.shopId,
      enableRetail: updated.enableRetail,
      enableWholesale: updated.enableWholesale,
      allowDiscounts: updated.allowDiscounts,
      enableBarcode: updated.enableBarcode,
      autoPrintInvoice: updated.autoPrintInvoice,
      gstMode: updated.gstMode,
      defaultDiscountPercent: Number(updated.defaultDiscountPercent),
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    console.error('Update billing settings error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}
