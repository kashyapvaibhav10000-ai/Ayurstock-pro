import { NextRequest } from 'next/server';
import { authenticateRequest, createErrorResponse, createApiResponse } from '@/middleware/auth';
import { CreateSaleSchema, validationMessage } from '@/lib/schemas';
import { BillingError, createSale, SellerRole } from '@/services/billing';
import { prisma } from '@/lib/db';

type SaleCustomerInput = {
  name?: string | null;
  phone?: string | null;
  address?: string | null;
  gstin?: string | null;
  drugLicense?: string | null;
  pan?: string | null;
};

function normalizeSaleCustomer(customer?: SaleCustomerInput) {
  const normalizedName = customer?.name?.trim() || "";
  const normalizedPhone = customer?.phone?.trim() || "";
  const normalizedAddress = customer?.address?.trim() || "";
  const normalizedGstin = customer?.gstin?.trim().toUpperCase() || "";
  const normalizedDrugLicense = customer?.drugLicense?.trim().toUpperCase() || "";
  const normalizedPan = customer?.pan?.trim().toUpperCase() || "";
  const hasNamedCustomer = normalizedName && normalizedName.toLowerCase() !== "walk-in customer";
  const hasAddress = normalizedAddress && normalizedAddress.toLowerCase() !== "walk-in";

  return {
    name: normalizedName,
    phone: normalizedPhone,
    address: normalizedAddress,
    gstin: normalizedGstin,
    drugLicense: normalizedDrugLicense,
    pan: normalizedPan,
    hasNamedCustomer: Boolean(hasNamedCustomer),
    hasAddress: Boolean(hasAddress),
    shouldSaveCustomer: Boolean(
      normalizedPhone ||
        hasNamedCustomer ||
        hasAddress ||
        normalizedGstin ||
        normalizedDrugLicense ||
        normalizedPan
    ),
  };
}

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
      return createErrorResponse(validationMessage(validation.error), 400);
    }

    const { customerId, customer, saleType, items, paymentMode, amountPaid, creditDue } = validation.data;
    const normalizedCustomer = normalizeSaleCustomer(customer);

    // Credit sales create an outstanding balance, so they must be attributable to
    // a real customer. Otherwise every walk-in credit collapses into one
    // anonymous bucket and the money owed can never be traced back.
    if (paymentMode === 'CREDIT') {
      const hasNamedCustomer =
        normalizedCustomer.hasNamedCustomer &&
        (normalizedCustomer.phone || normalizedCustomer.address);
      if (!customerId && !hasNamedCustomer) {
        return createErrorResponse(
          'Credit sales require a customer name with a phone number or address.',
          400
        );
      }
    }

    let resolvedCustomerId = customerId || null;

    if (!resolvedCustomerId && customer) {
      // Save customer details when the cashier entered a real name/address, even without a phone.
      // Pure walk-in sales stay anonymous and the invoice will not print fake fallback details.
      if (normalizedCustomer.shouldSaveCustomer) {
        const existingCustomer = normalizedCustomer.phone
          ? await prisma.customer.findFirst({
              where: {
                shopId: auth.user.shopId,
                phone: normalizedCustomer.phone,
              },
            })
          : null;

        if (existingCustomer) {
          resolvedCustomerId = existingCustomer.id;
          await prisma.customer.update({
            where: { id: existingCustomer.id },
            data: {
              name: normalizedCustomer.name || existingCustomer.name,
              address: normalizedCustomer.address || existingCustomer.address,
              gstin: normalizedCustomer.gstin || existingCustomer.gstin,
              drugLicense: normalizedCustomer.drugLicense || existingCustomer.drugLicense,
              pan: normalizedCustomer.pan || existingCustomer.pan,
            },
          });
        } else {
          const createdCustomer = await prisma.customer.create({
            data: {
              shopId: auth.user.shopId,
              name: normalizedCustomer.name || 'Walk-in Customer',
              phone: normalizedCustomer.phone,
              address: normalizedCustomer.address,
              gstin: normalizedCustomer.gstin,
              drugLicense: normalizedCustomer.drugLicense,
              pan: normalizedCustomer.pan,
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
        gstPercent: 0, // ignored: GST always comes from the medicine
      })),
      paymentMode,
      amountPaid,
      creditDue,
      sellerRole: auth.user.role as SellerRole,
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
      error instanceof BillingError ||
      (error instanceof Error && error.message.includes('Insufficient stock'))
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
