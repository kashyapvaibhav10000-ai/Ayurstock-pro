import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest, createErrorResponse, createApiResponse } from '@/middleware/auth';

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    const rackLocations = await prisma.rackLocation.findMany({
      where: { shopId: auth.user.shopId },
      orderBy: { name: 'asc' }
    });

    return createApiResponse(true, rackLocations);
  } catch (error: any) {
    console.error('Fetch Rack Locations Error:', error);
    return createErrorResponse(error.message, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    if (auth.user.role !== 'ADMIN') {
      return createErrorResponse('Insufficient permissions', 403);
    }

    const body = await req.json();

    // Check if this is the dynamic seeder signal
    if (body.seedDefault) {
      const defaults = ['H1', 'H2', 'H3', 'H4', 'H5'];
      for (const name of defaults) {
        await prisma.rackLocation.upsert({
          where: { 
            shopId_name: { shopId: auth.user.shopId, name } 
          },
          update: {},
          create: { 
            shopId: auth.user.shopId, 
            name, 
            description: `Default Rack ${name}` 
          }
        });
      }
      return createApiResponse(true, { message: 'Default racks seeded perfectly' });
    }

    // Otherwise, normal creation logic
    const { name, description } = body;

    if (!name) {
      return createErrorResponse('Rack Location name is required', 400);
    }

    const existing = await prisma.rackLocation.findFirst({
      where: { shopId: auth.user.shopId, name }
    });

    if (existing) {
      return createErrorResponse('A Rack Location with this exact name already exists', 400);
    }

    const newLocation = await prisma.rackLocation.create({
      data: {
        shopId: auth.user.shopId,
        name,
        description
      }
    });

    return createApiResponse(true, newLocation);
  } catch (error: any) {
    console.error('Create Rack Location Error:', error);
    return createErrorResponse(error.message, 500);
  }
}
