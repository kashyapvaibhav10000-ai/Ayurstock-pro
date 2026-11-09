import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractRequestToken, getAuthUserFromToken } from '@/lib/auth';
import { JWTPayload, AuthUser } from '@/types';

export interface AuthenticatedRequest extends NextRequest {
  user?: AuthUser;
  payload?: JWTPayload;
}

export async function authenticateRequest(
  request: NextRequest
): Promise<{ user: AuthUser; payload: JWTPayload } | null> {
  const token = extractRequestToken(request);
  if (!token) {
    return null;
  }

  const payload = verifyToken(token);
  if (!payload) {
    return null;
  }

  const user = await getAuthUserFromToken(token);
  if (!user) {
    return null;
  }

  return { 
    user,
    payload 
  };
}

export function requireAuth(request: NextRequest) {
  const token = extractRequestToken(request);
  if (!token) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized - No token provided' },
      { status: 401 }
    );
  }

  const payload = verifyToken(token);
  if (!payload) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized - Invalid token' },
      { status: 401 }
    );
  }

  return null; // No error, auth passed
}

export function requireRole(...allowedRoles: string[]) {
  return function checkRole(userRole: string) {
    if (!allowedRoles.includes(userRole)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden - Insufficient permissions' },
        { status: 403 }
      );
    }
    return null; // No error, role check passed
  };
}

/**
 * Back-office data (purchases and cost prices, suppliers, customers, credit,
 * reports, exports) is for ADMIN and MANAGER. Cashiers only bill, so their
 * API access must match what their screens show, not just hide the menu.
 */
export function staffOnlyResponse(role: string): NextResponse | null {
  if (role === 'ADMIN' || role === 'MANAGER') return null;
  return NextResponse.json({ success: false, error: 'Forbidden - Insufficient permissions' }, { status: 403 });
}

/**
 * Cost prices (batch purchaseRate, medicine tradePrice) are back-office data
 * and never reach a cashier. Wholesale prices are checked against cost on the
 * server, so the POS does not need it.
 */
export function canSeeCost(role: string): boolean {
  return role === 'ADMIN' || role === 'MANAGER';
}

const COST_KEYS = new Set(['purchaseRate', 'tradePrice']);

/** Copy of `value` with every cost key removed (plain objects and arrays only). */
export function hideCost<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => hideCost(item)) as T;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !COST_KEYS.has(key))
        .map(([key, item]) => [key, hideCost(item)])
    ) as T;
  }
  return value;
}

export async function validateShopAccess(
  requestShopId: string,
  userShopId: string
): Promise<NextResponse | null> {
  if (requestShopId !== userShopId) {
    return NextResponse.json(
      { success: false, error: 'Forbidden - Shop access denied' },
      { status: 403 }
    );
  }
  return null; // Access granted
}

export function createApiResponse(
  success: boolean,
  data?: any,
  error?: string,
  statusCode: number = 200
) {
  const response: any = { success };
  if (data !== undefined) response.data = data;
  if (error) response.error = error;
  return NextResponse.json(response, { status: statusCode });
}

export function createErrorResponse(
  error: string,
  statusCode: number = 400
) {
  return NextResponse.json(
    { success: false, error },
    { status: statusCode }
  );
}

export function createPaginatedResponse(
  data: any[],
  total: number,
  page: number,
  pageSize: number
) {
  return NextResponse.json(
    {
      success: true,
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
    { status: 200 }
  );
}
