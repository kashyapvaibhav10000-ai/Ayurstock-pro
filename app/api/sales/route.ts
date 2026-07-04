import { NextRequest } from 'next/server';
import { authenticateRequest, createErrorResponse, createApiResponse } from '@/middleware/auth';
import { CreateSaleSchema } from '@/lib/schemas';
import { createSale } from '@/services/billing';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    // Authenticate
    const auth = await authenticateRequest(request);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    // Only ADMIN, MANAGER, and CASHIER can create sales
    if (!['ADMIN', 'MANAGER', 'CASHIER'].includes(auth.user.role)) {
      return createErrorResponse('Forbidden - Insufficient permissions', 403);
    }

    const body = await request.json();

    // Validate input
    const validation = CreateSaleSchema.safeParse(body);
    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors;
      return createErrorResponse(`Validation error: ${JSON.stringify(errors)}`, 400);
    }

    const { customerId, customer, saleType, items, paymentMode, discountTotal, gstMode, creditDue } = validation.data;

    // Credit sales create an outstanding balance, so they must be attributable to
    // a real customer. Otherwise every walk-in credit collapses into one
    // anonymous bucket and the money owed can never be traced back.
    if (paymentMode === 'CREDIT') {
      const hasNamedCustomer =
        customer &&
        customer.name &&
        customer.name.trim().toLowerCase() !== 'walk-in customer' &&
        (customer.phone?.trim() || customer.address?.trim());
      if (!customerId && !hasNamedCustomer) {
        return createErrorResponse(
          'Credit sales require a customer name with a phone number or address.',
          400
        );
      }
    }

    let resolvedCustomerId = customerId || null;

    if (!resolvedCustomerId && customer) {
      const normalizedPhone = customer.phone?.trim() || "";
      const normalizedName = customer.name?.trim() || "";
      const normalizedAddress = customer.address?.trim() || "";
      const normalizedGstin = customer.gstin?.trim() || "";
      const normalizedDrugLicense = customer.drugLicense?.trim() || "";
      const normalizedPan = customer.pan?.trim() || "";
      const hasNamedCustomer = normalizedName && normalizedName.toLowerCase() !== "walk-in customer";
      const hasAddress = normalizedAddress && normalizedAddress.toLowerCase() !== "walk-in";
      const shouldSaveCustomer = Boolean(
        normalizedPhone || hasNamedCustomer || hasAddress || normalizedGstin || normalizedDrugLicense || normalizedPan
      );

      // Save customer details when the cashier entered a real name/address, even without a phone.
      // Pure walk-in sales stay anonymous and the invoice will not print fake fallback details.
      if (shouldSaveCustomer) {
        const existingCustomer = normalizedPhone
          ? await prisma.customer.findFirst({
              where: {
                shopId: auth.user.shopId,
                phone: normalizedPhone,
              },
            })
          : null;

        if (existingCustomer) {
          resolvedCustomerId = existingCustomer.id;
          await prisma.customer.update({
            where: { id: existingCustomer.id },
            data: {
              name: normalizedName || existingCustomer.name,
              address: normalizedAddress,
              gstin: normalizedGstin || existingCustomer.gstin,
              drugLicense: normalizedDrugLicense || existingCustomer.drugLicense,
              pan: normalizedPan || existingCustomer.pan,
            },
          });
        } else {
          const createdCustomer = await prisma.customer.create({
            data: {
              shopId: auth.user.shopId,
              name: normalizedName || 'Walk-in Customer',
              phone: normalizedPhone,
              address: normalizedAddress,
              gstin: normalizedGstin,
              drugLicense: normalizedDrugLicense,
              pan: normalizedPan,
            },
          });
          resolvedCustomerId = createdCustomer.id;
        }
      }
    }

    // Create sale
    const sale = await createSale({
      shopId: auth.user.shopId,
      customerId: resolvedCustomerId,
      saleType,
      items: items.map((item: any) => ({
        medicineId: item.medicineId,
        batchId: item.batchId,
        quantity: item.quantity,
        rate: item.rate,
        discount: item.discount,
        gstPercent: item.gstPercent,
      })),
      paymentMode,
      discountTotal,
      gstMode,
      creditDue,
      createdByUserId: auth.user.id,
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        shopId: auth.user.shopId,
        userId: auth.user.id,
        action: 'CREATE_SALE',
        meta: JSON.stringify({
          saleId: sale.id,
          invoiceNumber: sale.invoiceNumber,
          amount: sale.grandTotal.toString(),
        }),
      },
    });

    return createApiResponse(true, sale, undefined, 201);
  } catch (error) {
    console.error('Create sale error:', error);
    if (
      error instanceof Error &&
      (error.message.includes('Insufficient stock') ||
        error.message.includes('Batch') ||
        error.message.includes('Medicine'))
    ) {
      return createErrorResponse(error.message, 400);
    }
    return createErrorResponse('Internal server error', 500);
  }
}

export async function GET(request: NextRequest) {
  try {
    // Authenticate
    const auth = await authenticateRequest(request);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    const searchParams = request.nextUrl.searchParams;
    const startDate = new Date(searchParams.get('startDate') || new Date().toISOString());
    const endDate = new Date(searchParams.get('endDate') || new Date().toISOString());
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    // Get sales within date range
    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where: {
          shopId: auth.user.shopId,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          id: true,
          invoiceNumber: true,
          saleType: true,
          subtotal: true,
          discountTotal: true,
          gstTotal: true,
          grandTotal: true,
          paymentMode: true,
          createdAt: true,
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
          createdByUser: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.sale.count({
        where: {
          shopId: auth.user.shopId,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      }),
    ]);

    return createApiResponse(true, { sales, total });
  } catch (error) {
    console.error('Get sales error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}
