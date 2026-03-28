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
