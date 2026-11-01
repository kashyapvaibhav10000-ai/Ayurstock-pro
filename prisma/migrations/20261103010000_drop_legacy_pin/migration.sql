-- Drop the plaintext PIN column. Refuses to run while any plaintext PIN
-- remains, so no PIN is lost before scripts/hash-pins.ts has moved it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "User" WHERE "pin" IS NOT NULL) THEN
    RAISE EXCEPTION 'Plaintext PINs still present. Run `npm run hash-pins` first, then re-run migrate deploy.';
  END IF;
END $$;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "pin";
