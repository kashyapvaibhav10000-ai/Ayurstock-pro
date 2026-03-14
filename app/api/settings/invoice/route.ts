import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest, createApiResponse, createErrorResponse } from '@/middleware/auth';
import { InvoiceSettingsSchema } from '@/lib/schemas';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    const shop = await prisma.shop.findUnique({
      where: { id: auth.user.shopId },
      select: { name: true, address: true, phone: true, email: true, gstin: true },
    });

    if (!shop) {
      return createErrorResponse('Shop not found', 404);
    }

    const shopSettings = await prisma.shopSettings.findUnique({
      where: { shopId: auth.user.shopId },
      select: {
        shopName: true,
        addressLine1: true,
        addressLine2: true,
        phone: true,
        email: true,
        gstin: true,
      },
    });

    const settings = await prisma.invoiceSettings.upsert({
      where: { shopId: auth.user.shopId },
      update: {},
      create: {
        shopId: auth.user.shopId,
        shopName: shopSettings?.shopName || shop.name || '',
        addressLine1: shopSettings?.addressLine1 || shop.address || '',
        addressLine2: shopSettings?.addressLine2 || null,
        phone: shopSettings?.phone || shop.phone || '',
        email: shopSettings?.email || shop.email || '',
        gstin: shopSettings?.gstin || shop.gstin || '',
        invoicePrefix: 'INV-',
        nextInvoiceNumber: 1,
        watermarkText: shopSettings?.shopName || shop.name || '',
        watermarkEnabled: true,
      },
    });

    return createApiResponse(true, {
      id: settings.id,
      shopId: settings.shopId,
      invoicePrefix: settings.invoicePrefix,
      nextInvoiceNumber: settings.nextInvoiceNumber,
      watermarkText: settings.watermarkText,
      watermarkEnabled: settings.watermarkEnabled,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    });
  } catch (error) {
    console.error('Get invoice settings error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    if (!['ADMIN', 'MANAGER'].includes(auth.user.role)) {
      return createErrorResponse('Forbidden - Insufficient permissions', 403);
    }

    const body = await request.json();
    const validation = InvoiceSettingsSchema.safeParse(body);

    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors;
      return createErrorResponse(`Validation error: ${JSON.stringify(errors)}`, 400);
    }

    const { invoicePrefix, watermarkText, watermarkEnabled } = validation.data;

    const shop = await prisma.shop.findUnique({
      where: { id: auth.user.shopId },
      select: { name: true, address: true, phone: true, email: true, gstin: true },
    });

    if (!shop) {
      return createErrorResponse('Shop not found', 404);
    }

    const shopSettings = await prisma.shopSettings.findUnique({
      where: { shopId: auth.user.shopId },
      select: {
        shopName: true,
        addressLine1: true,
        addressLine2: true,
        phone: true,
        email: true,
        gstin: true,
      },
    });

    const updated = await prisma.invoiceSettings.upsert({
      where: { shopId: auth.user.shopId },
      update: {
        invoicePrefix: invoicePrefix.trim(),
        watermarkText: watermarkText?.trim() || '',
        watermarkEnabled,
      },
      create: {
        shopId: auth.user.shopId,
        shopName: shopSettings?.shopName || shop.name || '',
        addressLine1: shopSettings?.addressLine1 || shop.address || '',
        addressLine2: shopSettings?.addressLine2 || null,
        phone: shopSettings?.phone || shop.phone || '',
        email: shopSettings?.email || shop.email || '',
        gstin: shopSettings?.gstin || shop.gstin || '',
        invoicePrefix: invoicePrefix.trim(),
        nextInvoiceNumber: 1,
        watermarkText: watermarkText?.trim() || '',
        watermarkEnabled,
      },
    });

    return createApiResponse(true, {
      id: updated.id,
      shopId: updated.shopId,
      invoicePrefix: updated.invoicePrefix,
      nextInvoiceNumber: updated.nextInvoiceNumber,
      watermarkText: updated.watermarkText,
      watermarkEnabled: updated.watermarkEnabled,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    console.error('Update invoice settings error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}
