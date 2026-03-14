import { NextRequest } from 'next/server';
import { authenticateRequest, createErrorResponse, createApiResponse } from '@/middleware/auth';
import { getDailySalesSummary, getTopSellingMedicines } from '@/services/billing';

export async function GET(request: NextRequest) {
  try {
    // Authenticate
    const auth = await authenticateRequest(request);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    const searchParams = request.nextUrl.searchParams;
    const reportType = searchParams.get('type') || 'daily-sales';
    const startDate = new Date(searchParams.get('startDate') || new Date(new Date().setHours(0, 0, 0, 0)).toISOString());
    const endDate = new Date(searchParams.get('endDate') || new Date().toISOString());

    if (reportType === 'daily-sales') {
      const report = await getDailySalesSummary(auth.user.shopId, startDate, endDate);
      return createApiResponse(true, { report });
    }

    if (reportType === 'top-medicines') {
      const report = await getTopSellingMedicines(auth.user.shopId, startDate, endDate, 10);
      return createApiResponse(true, { report });
    }

    return createErrorResponse('Invalid report type', 400);
  } catch (error) {
    console.error('Get reports error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}
