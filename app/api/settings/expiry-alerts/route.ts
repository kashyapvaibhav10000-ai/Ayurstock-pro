import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest, createApiResponse, createErrorResponse } from '@/middleware/auth';
import { z } from 'zod';

const ExpiryAlertSettingsSchema = z.object({
  enableWhatsApp: z.boolean(),
  enableEmail: z.boolean(),
  whatsappNumber: z.string(),
  emailAddress: z.string().email().or(z.literal('')),
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

    const settings = await prisma.expiryAlertSettings.upsert({
      where: { shopId: auth.user.shopId },
      update: {},
      create: {
        shopId: auth.user.shopId,
        enableWhatsApp: true,
        enableEmail: true,
        whatsappNumber: shop.phone || '',
        emailAddress: shop.email || '',
      },
    });

    return createApiResponse(true, {
      id: settings.id,
      shopId: settings.shopId,
      enableWhatsApp: settings.enableWhatsApp,
      enableEmail: settings.enableEmail,
      whatsappNumber: settings.whatsappNumber,
      emailAddress: settings.emailAddress,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    });
  } catch (error) {
    console.error('Get expiry alert settings error:', error);
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
    const validation = ExpiryAlertSettingsSchema.safeParse(body);

    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors;
      return createErrorResponse(`Validation error: ${JSON.stringify(errors)}`, 400);
    }

    const {
      enableWhatsApp,
      enableEmail,
      whatsappNumber,
      emailAddress,
    } = validation.data;

    const shop = await prisma.shop.findUnique({
      where: { id: auth.user.shopId },
    });

    if (!shop) {
      return createErrorResponse('Shop not found', 404);
    }

    const updated = await prisma.expiryAlertSettings.upsert({
      where: { shopId: auth.user.shopId },
      update: {
        enableWhatsApp,
        enableEmail,
        whatsappNumber: whatsappNumber.trim(),
        emailAddress: emailAddress.trim(),
      },
      create: {
        shopId: auth.user.shopId,
        enableWhatsApp,
        enableEmail,
        whatsappNumber: whatsappNumber.trim(),
        emailAddress: emailAddress.trim(),
      },
    });

    return createApiResponse(true, {
      id: updated.id,
      shopId: updated.shopId,
      enableWhatsApp: updated.enableWhatsApp,
      enableEmail: updated.enableEmail,
      whatsappNumber: updated.whatsappNumber,
      emailAddress: updated.emailAddress,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    console.error('Update expiry alert settings error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}
