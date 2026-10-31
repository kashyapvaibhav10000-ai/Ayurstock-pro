import { Prisma } from '@prisma/client';

/**
 * Message safe to send to the browser for an unexpected error. Rules thrown
 * by our own code (plain Error with a short sentence) pass through; database
 * errors, which include query text, table names and file paths, and anything
 * that looks like a stack or internal path, become `fallback`. The full error
 * is still logged on the server.
 */
export function clientErrorMessage(error: unknown, fallback: string): string {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientValidationError ||
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError
  ) {
    return fallback;
  }
  if (!(error instanceof Error) || !error.message) return fallback;
  const message = error.message;
  if (message.length > 300 || /prisma|invocation|\n\s+at |[\\/](node_modules|app|lib|home)[\\/]|ECONN|ENOENT/i.test(message)) {
    return fallback;
  }
  return message;
}
