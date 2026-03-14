import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import DashboardHeader from '@/components/DashboardHeader';
import { getAuthUserFromToken } from '@/lib/auth';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = cookies().get('auth-token')?.value;

  if (!token) {
    redirect('/login');
  }

  const user = await getAuthUserFromToken(token);
  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <Sidebar user={user} />
      <main className="flex-1 overflow-auto">
        <DashboardHeader user={user} />
        <div className="min-h-[calc(100vh-96px)] bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.08),_transparent_35%),linear-gradient(180deg,_rgba(255,255,255,0.9),_rgba(248,250,252,1))]">
          {children}
        </div>
      </main>
    </div>
  );
}
