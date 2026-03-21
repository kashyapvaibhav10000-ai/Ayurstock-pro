import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest, createErrorResponse, createApiResponse } from '@/middleware/auth';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    if (auth.user.role !== 'ADMIN') {
      return createErrorResponse('Insufficient permissions', 403);
    }

    const { name, description } = await req.json();

    if (!name) {
      return createErrorResponse('Name cannot be completely empty', 400);
    }

    // Ensure we aren't colliding with an existing rack when renaming
    // @ts-ignore
    const existing = await prisma.rackLocation.findFirst({
      where: {
        shopId: auth.user.shopId,
        name,
        id: { not: params.id }
      }
    });

    if (existing) {
      return createErrorResponse('Another rack location already has this exact name.', 400);
    }

    // @ts-ignore
    const updated = await prisma.rackLocation.update({
      where: { id: params.id, shopId: auth.user.shopId },
      data: { name, description }
    });

    return createApiResponse(true, updated);
  } catch (error: any) {
    console.error('Update Rack Location Error:', error);
    return createErrorResponse(error.message, 500);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    if (auth.user.role !== 'ADMIN') {
      return createErrorResponse('Insufficient permissions', 403);
    }

    // @ts-ignore
    const rack = await prisma.rackLocation.findUnique({
      where: { id: params.id, shopId: auth.user.shopId }
    });

    if (!rack) {
      return createErrorResponse('Rack location not found', 404);
    }

    // Safety checks against Inventory Batches!
    // We check if ANY inventoryBatch has rackLocation === rack.name
    // Because rack locations are stored as raw strings in InventoryBatch according to original design.
    const activeMappingCount = await prisma.inventoryBatch.count({
      where: {
        shopId: auth.user.shopId,
        rackLocation: rack.name
      }
    });

    if (activeMappingCount > 0) {
      return createErrorResponse(`Cannot delete - ${activeMappingCount} medicines are stored in this location. Please reassign them first.`, 403);
    }

    // @ts-ignore
    await prisma.rackLocation.delete({
      where: { id: params.id }
    });

    return createApiResponse(true, { deletedId: params.id });
  } catch (error: any) {
    console.error('Delete Rack Location Error:', error);
    return createErrorResponse(error.message, 500);
  }
}
