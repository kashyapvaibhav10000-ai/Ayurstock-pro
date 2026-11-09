import { AiFeature } from '@prisma/client';

/** Product features that call the AI parser, in settings display order. */
export const AI_FEATURES: AiFeature[] = ['INVOICE_IMPORT', 'MEDICINE_IMPORT', 'MEDICINE_BATCH_REPARSE', 'LABEL_SCAN'];

export const AI_FEATURE_LABEL: Record<AiFeature, string> = {
  INVOICE_IMPORT: 'Invoice / price list import',
  MEDICINE_IMPORT: 'Medicine import',
  MEDICINE_BATCH_REPARSE: 'Medicine batch re-parse',
  LABEL_SCAN: 'Medicine label scan (Add Inventory camera)',
};

/** Who is asking: tagged on every AI call and its usage log row. */
export interface AiCallContext {
  feature: AiFeature;
  shopId?: string | null;
}

export function parseFeature(value: unknown): AiFeature | null {
  return typeof value === 'string' && (AI_FEATURES as string[]).includes(value) ? (value as AiFeature) : null;
}
