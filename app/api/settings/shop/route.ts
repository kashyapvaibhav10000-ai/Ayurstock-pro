import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest, createApiResponse, createErrorResponse } from '@/middleware/auth';
import { ShopSettingsSchema } from '@/lib/schemas';

const splitAddress = (address: string) => {
  const lines = address.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return {
    addressLine1: lines[0] || '',
    addressLine2: lines.slice(1).join('\n') || '',
  };
};

const combineAddress = (line1: string, line2?: string | null) => {
  const safeLine2 = line2?.trim();
  const safeLine1 = line1?.trim() || '';
  return safeLine2 ? `${safeLine1}\n${safeLine2}` : safeLine1;
};

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    const shop = await prisma.shop.findUnique({
      where: { id: auth.user.shopId },
      select: { id: true, name: true, address: true, phone: true, email: true, gstin: true },
    });

    if (!shop) {
      return createErrorResponse('Shop not found', 404);
    }

    const address = splitAddress(shop.address || '');

    const settings = await prisma.shopSettings.upsert({
      where: { shopId: auth.user.shopId },
      update: {},
      create: {
        shopId: auth.user.shopId,
        shopName: shop.name || '',
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2,
        phone: shop.phone || '',
        email: shop.email || '',
        gstin: shop.gstin || '',
      },
    });

    return createApiResponse(true, {
      shopId: settings.shopId,
      shopName: settings.shopName || '',
      addressLine1: settings.addressLine1 || '',
      addressLine2: settings.addressLine2 || '',
      phone: settings.phone || '',
      email: settings.email || '',
      gstin: settings.gstin || '',
    });
  } catch (error) {
    console.error('Get shop settings error:', error);
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
    const validation = ShopSettingsSchema.safeParse(body);

    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors;
      return createErrorResponse(`Validation error: ${JSON.stringify(errors)}`, 400);
    }

    const { shopName, addressLine1, addressLine2, phone, email, gstin } = validation.data;
    const normalizedEmail = email ? email.trim().toLowerCase() : '';
    const normalizedGstin = gstin ? gstin.trim() : '';

    if (normalizedGstin) {
      const existingShop = await prisma.shop.findFirst({
        where: {
          gstin: normalizedGstin,
          NOT: { id: auth.user.shopId },
        },
        select: { id: true },
      });

      if (existingShop) {
        return createErrorResponse('GSTIN already in use for another shop', 400);
      }
    }

    const updatedSettings = await prisma.shopSettings.upsert({
      where: { shopId: auth.user.shopId },
      update: {
        shopName: shopName?.trim() || '',
        addressLine1: addressLine1?.trim() || '',
        addressLine2: addressLine2?.trim() || '',
        phone: phone?.trim() || '',
        email: normalizedEmail,
        gstin: normalizedGstin,
      },
      create: {
        shopId: auth.user.shopId,
        shopName: shopName?.trim() || '',
        addressLine1: addressLine1?.trim() || '',
        addressLine2: addressLine2?.trim() || '',
        phone: phone?.trim() || '',
        email: normalizedEmail,
        gstin: normalizedGstin,
      },
    });

    await prisma.shop.update({
      where: { id: auth.user.shopId },
      data: {
        name: updatedSettings.shopName,
        address: combineAddress(updatedSettings.addressLine1, updatedSettings.addressLine2),
        phone: updatedSettings.phone,
        email: updatedSettings.email,
        gstin: updatedSettings.gstin,
      },
    });

    return createApiResponse(true, {
      shopId: updatedSettings.shopId,
      shopName: updatedSettings.shopName || '',
      addressLine1: updatedSettings.addressLine1 || '',
      addressLine2: updatedSettings.addressLine2 || '',
      phone: updatedSettings.phone || '',
      email: updatedSettings.email || '',
      gstin: updatedSettings.gstin || '',
    });
  } catch (error) {
    console.error('Update shop settings error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}
