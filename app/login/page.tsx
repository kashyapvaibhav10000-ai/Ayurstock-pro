'use client';

import { useState } from 'react';
import { clearAccent } from '@/lib/accent';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import Image from 'next/image';
import { ArrowRight, Lock, UserRound, Zap, ShieldCheck, FileText, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import PosPinLogin from '@/components/auth/PosPinLogin';

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const finishLogin = (data: { user: unknown }) => {
    localStorage.setItem('user', JSON.stringify(data.user));
    router.push('/dashboard');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      clearAccent();
      await axios.post('/api/auth/logout').catch(() => {});

      const response = await axios.post('/api/auth/login', { identifier, password });

      if (response.data.success) finishLogin(response.data.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: Zap, title: 'Fast GST Billing', desc: 'Bill a customer in under 10 seconds with barcode scanning.' },
    { icon: ShieldCheck, title: 'Expiry Tracking', desc: 'Batch-level expiry dispensing with expiry alerts built-in.' },
    { icon: FileText, title: 'AI Invoice Import', desc: 'Import full price lists from PDF invoices automatically.' },
    { icon: Users, title: 'Multi-User & Secure', desc: 'Role-based access with full audit logs.' },
  ];

  return (
    <div className="light min-h-screen flex font-sans" data-theme="light">

      {/* ── LEFT BRAND PANEL ── */}
      <div className="hidden lg:flex lg:w-[56%] flex-col relative overflow-hidden bg-primary-hover">
        <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-12 xl:px-20 py-16">

          {/* Logo */}
          <div className="flex flex-col items-center gap-4 mb-10">
            <div className="h-[148px] w-[148px] rounded-full bg-white overflow-hidden flex items-center justify-center p-1 shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
              <Image
                src="/logo.png"
                width={148}
                height={148}
                alt="AyurStock Pro"
                className="object-cover rounded-full w-full h-full"
              />
            </div>
            <p className="text-white/75 text-[13px] font-medium">
              Ayurvedic pharmacy management
            </p>
          </div>

          {/* Heading */}
          <h1 className="text-[44px] xl:text-[56px] font-bold text-white leading-[1.05] tracking-[-0.035em] text-center">
            Your pharmacy,<br />
            fully in control.
          </h1>

          <p className="mt-5 text-white/75 text-[17px] text-center max-w-md leading-relaxed">
            From billing to batch expiry, run every corner of your shop from one place.
          </p>

          {/* Feature Cards */}
          <div className="grid grid-cols-2 gap-3 mt-12 w-full max-w-md">
            {features.map((f) => (
              <div key={f.title} className="rounded-card bg-white/10 p-4">
                <f.icon className="h-5 w-5 stroke-[1.75] text-white mb-3" />
                <p className="text-[14px] font-semibold text-white">{f.title}</p>
                <p className="text-[13px] text-white/70 mt-1 leading-snug">{f.desc}</p>
              </div>
            ))}
          </div>

          {/* Footer */}
          <p className="mt-12 text-[12px] text-white/55">
            Built with care by <span className="text-white/80">Vaibhav</span>
          </p>
        </div>
      </div>

      {/* ── RIGHT LOGIN PANEL ── */}
      <div className="flex-1 flex flex-col justify-center px-8 sm:px-12 lg:px-16 xl:px-20 bg-surface">
        {/* Mobile logo */}
        <div className="lg:hidden flex flex-col items-center gap-3 mb-10">
          <div className="h-24 w-24 rounded-full bg-primary shadow-xl overflow-hidden border-4 border-primary/30 flex items-center justify-center">
            <Image
              src="/logo.png"
              width={80}
              height={80}
              alt="AyurStock Pro"
              className="object-contain"
            />
          </div>
          <h2 className="text-title-3 text-foreground"><span className="text-primary">Ayur</span>Stock Pro</h2>
        </div>

        <div className="w-full max-w-sm mx-auto">
          <h2 className="text-large-title text-foreground">Welcome back</h2>
          <p className="mt-1.5 text-[15px] text-muted-foreground">Sign in to your workspace to continue.</p>

          <form onSubmit={handleLogin} className="mt-10 space-y-6">
            {error && (
              <div className="bg-danger/10 border border-danger/30 text-danger p-4 rounded-xl text-[13px] font-medium flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-danger animate-pulse" />
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="identifier" className="text-footnote font-medium text-muted-foreground pl-1">Username or email</label>
              <div className="relative group">
                <UserRound className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <Input
                  className="pl-11 h-12 text-[15px]"
                  id="identifier"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="username or you@pharmacy.com"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-footnote font-medium text-muted-foreground pl-1">Password</label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <Input
                  className="pl-11 h-12 text-[15px]"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <button
              disabled={loading}
              type="submit"
              className="w-full h-12 bg-primary hover:bg-primary-hover text-white font-semibold text-[15px] rounded-full flex items-center justify-center gap-2 transition-[background-color,transform] duration-200 active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? (
                <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Sign in to Dashboard
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <PosPinLogin onLoggedIn={finishLogin} />

          <p className="mt-8 text-center text-[11px] text-muted-foreground flex items-center justify-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Your data is stored locally and never shared.
          </p>
        </div>
      </div>
    </div>
  );
}
