import { requirePageRole } from '@/lib/page-guard';

// Settings: admins only (see lib/page-guard.ts).
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePageRole(['ADMIN']);
  return children;
}
