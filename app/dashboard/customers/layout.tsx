import { requirePageRole } from '@/lib/page-guard';

// Back-office page: admins and managers only (see lib/page-guard.ts).
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePageRole(['ADMIN', 'MANAGER']);
  return children;
}
