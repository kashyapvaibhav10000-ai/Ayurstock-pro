// Runs before any app module loads (lib/auth.ts reads env at import).
if (!process.env.TEST_DATABASE_URL) {
  throw new Error('Set TEST_DATABASE_URL to a disposable Postgres database (it is wiped on every run).');
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.JWT_SECRET = 'test-secret-0123456789-0123456789-0123456789';
process.env.PIN_HASH_KEY = 'test-pin-key-0123456789-0123456789-01234';
process.env.TRUST_PROXY = 'cloudflare';
