import { NextRequest } from 'next/server';
import { authenticateRequest, createErrorResponse, createApiResponse } from '@/middleware/auth';
import { prisma } from '@/lib/db';
import { getSaleDetails } from '@/services/billing';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Authenticate
    const auth = await authenticateRequest(request);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    const saleDetails = await getSaleDetails(params.id);

    if (!saleDetails) {
      return createErrorResponse('Sale not found', 404);
    }

    // Verify the sale belongs to the user's shop
    if (saleDetails.shopId !== auth.user.shopId) {
      return createErrorResponse('Forbidden', 403);
    }

    return createApiResponse(true, saleDetails);
  } catch (error) {
    console.error('Get sale details error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}
