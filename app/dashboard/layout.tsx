import { redirect } from 'next/navigation';
import DashboardClientWrapper from '@/components/DashboardClientWrapper';
import { getPageUser } from '@/lib/page-guard';
import { isSuperAdmin } from '@/lib/super-admin';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getPageUser();
  if (!user) {
    redirect('/login');
  }

  return (
    <DashboardClientWrapper user={{ ...user, isSuperAdmin: isSuperAdmin(user) }}>
      {children}
    </DashboardClientWrapper>
  );
}
