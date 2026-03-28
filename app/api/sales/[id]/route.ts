import { NextRequest } from 'next/server';
import { authenticateRequest, createErrorResponse, createApiResponse } from '@/middleware/auth';
import { prisma } from '@/lib/db';
import { getSaleDetails } from '@/services/billing';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    // Authenticate
    const auth = await authenticateRequest(request);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    const saleDetails = await getSaleDetails(id, auth.user.shopId);

    if (!saleDetails) {
      return createErrorResponse('Sale not found', 404);
    }

    return createApiResponse(true, saleDetails);
  } catch {
    return createErrorResponse('Internal server error', 500);
  }
}
