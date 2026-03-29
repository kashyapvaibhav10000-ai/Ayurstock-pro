import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest, createApiResponse, createErrorResponse } from '@/middleware/auth';
import { z } from 'zod';

const ALLOWED_ROUTES = [
  '/dashboard/billing',
  '/dashboard/inventory',
  '/dashboard/credits',
  '/dashboard/reports',
  '/dashboard/stock-adjustment',
  '/dashboard/suppliers',
  '/dashboard/purchases',
  '/dashboard/returns',
  '/dashboard/medicines',
];

const ActionSchema = z.object({
  label: z.string().min(1, 'Label is required'),
  icon: z.string().min(1, 'Icon is required'),
  route: z.string().refine((val) => ALLOWED_ROUTES.includes(val), {
    message: "Route is not in the allowed list",
  }),
});

const UpdateActionsSchema = z.object({
  commanderActions: z.array(ActionSchema)
    .min(1, 'At least 1 action is required')
    .max(5, 'Maximum of 5 actions allowed'),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return createErrorResponse('Unauthorized', 401);

    const settings = await prisma.shopSettings.findUnique({
      where: { shopId: auth.user.shopId },
      select: { commanderActions: true },
    });

    if (!settings) {
      return createErrorResponse('Settings not found', 404);
    }

    return createApiResponse(true, { commanderActions: settings.commanderActions });
  } catch (error) {
    console.error('Failed to get commander actions:', error);
    return createErrorResponse('Internal server error', 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return createErrorResponse('Unauthorized', 401);

    if (!['ADMIN', 'MANAGER'].includes(auth.user.role)) {
      return createErrorResponse('Forbidden - Insufficient permissions', 403);
    }

    const body = await request.json();
    const validation = UpdateActionsSchema.safeParse(body);

    if (!validation.success) {
      return createErrorResponse(`Validation error: ${JSON.stringify(validation.error.flatten().fieldErrors)}`, 400);
    }

    const { commanderActions } = validation.data;

    const updated = await prisma.shopSettings.update({
      where: { shopId: auth.user.shopId },
      data: { commanderActions: commanderActions as any },
    });

    return createApiResponse(true, { commanderActions: updated.commanderActions });
  } catch (error) {
    console.error('Failed to update commander actions:', error);
    return createErrorResponse('Internal server error', 500);
  }
}
