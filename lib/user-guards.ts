import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { hashPin } from '@/lib/pin';

/**
 * Account-management rules shared by Team (/api/users) and My Profile.
 */

export const LAST_ADMIN_MESSAGE = {
  demote: 'Cannot change the role of the last active Admin of this shop. Make another user an active Admin first.',
  deactivate: 'Cannot deactivate the last active Admin of this shop. Make another user an active Admin first.',
  delete: 'Cannot delete the last active Admin of this shop. Make another user an active Admin first.',
} as const;

export class LastAdminError extends Error {
  constructor(public action: keyof typeof LAST_ADMIN_MESSAGE) {
    super(LAST_ADMIN_MESSAGE[action]);
  }
}

/**
 * Apply a user update, then confirm the shop still has an active ADMIN; if
 * not, roll back and throw LastAdminError. Checking after the write inside
 * one transaction also covers two admins demoting each other at once.
 */
export async function updateUserKeepingAnAdmin<T>(
  shopId: string,
  action: keyof typeof LAST_ADMIN_MESSAGE,
  write: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      const result = await write(tx);
      const admins = await tx.user.count({ where: { shopId, role: 'ADMIN', isActive: true } });
      if (admins === 0) throw new LastAdminError(action);
      return result;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

/** POS PIN input: undefined = unchanged, null / '' = removed, else 4 digits. */
export function parsePinInput(value: unknown): { ok: true; pin: string | null | undefined } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, pin: undefined };
  if (value === null || value === '') return { ok: true, pin: null };
  if (typeof value !== 'string' || !/^\d{4}$/.test(value)) return { ok: false, error: 'PIN must be exactly 4 digits.' };
  return { ok: true, pin: value };
}

/**
 * True if another user in the same shop already has this PIN. Only the shop
 * is checked, so this never reveals PINs used in other shops.
 */
export async function pinTakenInShop(shopId: string, pin: string, userId: string): Promise<boolean> {
  const other = await prisma.user.findFirst({
    where: { shopId, pinHash: hashPin(shopId, pin), NOT: { id: userId } },
    select: { id: true },
  });
  return Boolean(other);
}

/** Prisma data for a parsed PIN: undefined = unchanged, null = removed. */
export function pinData(shopId: string, pin: string | null | undefined) {
  if (pin === undefined) return {};
  return { pinHash: pin === null ? null : hashPin(shopId, pin) };
}

export const PIN_TAKEN = 'Another user in this shop already uses this PIN.';
export const CURRENT_PASSWORD_REQUIRED = 'Enter your current password to change your email, username or password.';
export const CURRENT_PASSWORD_WRONG = 'Current password is incorrect.';
