import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import DashboardClientWrapper from '@/components/DashboardClientWrapper';
import { getAuthUserFromToken } from '@/lib/auth';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth-token')?.value;

  if (!token) {
    redirect('/login');
  }

  const user = await getAuthUserFromToken(token);
  if (!user) {
    redirect('/login');
  }

  return (
    <DashboardClientWrapper user={user}>
      {children}
    </DashboardClientWrapper>
  );
}
