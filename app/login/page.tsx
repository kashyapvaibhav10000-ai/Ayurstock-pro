'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import Image from 'next/image';
import { ArrowRight, Lock, Mail, Leaf, ShieldCheck, Zap, BarChart3 } from 'lucide-react';
import { Input } from '@/components/ui/input';

const features = [
  {
    icon: Zap,
    title: 'Fast GST Billing',
    desc: 'Bill a customer in under 10 seconds with barcode scanning.',
  },
  {
    icon: Leaf,
    title: 'Expiry Tracking',
    desc: 'Batch-wise FEFO dispensing with expiry alerts built in.',
  },
  {
    icon: BarChart3,
    title: 'AI Invoice Import',
    desc: 'Import full price lists from PDF invoices automatically.',
  },
  {
    icon: ShieldCheck,
    title: 'Multi-user & Secure',
    desc: 'Role-based access with full audit logs.',
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      await axios.post('/api/auth/logout').catch(() => {});
      const response = await axios.post('/api/auth/login', { email, password });
      if (response.data.success) {
        localStorage.setItem('token', response.data.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.data.user));
        router.push('/dashboard');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex font-sans">

      {/* ── LEFT BRAND PANEL ── */}
      <div className="hidden lg:flex lg:w-[58%] flex-col relative overflow-hidden bg-gradient-to-br from-[#050505] via-[#0A0A0A] to-[#111111]">

        {/* Decorative blobs */}
        <div className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-primary/20 blur-3xl animate-blob-slow" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 rounded-full bg-primary/15 blur-3xl animate-blob-medium" />
        <div className="pointer-events-none absolute top-1/2 left-1/3 h-64 w-64 rounded-full bg-primary/10 blur-3xl animate-blob-fast" />
        {/* Subtle grid */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(212,175,55,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(212,175,55,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center h-full px-12 xl:px-16 py-10 xl:py-14">

          {/* ── LOGO — top center, large on white disc ── */}
          <div className="flex flex-col items-center gap-4 mb-10">
            <div className="h-[168px] w-[168px] rounded-full bg-surface shadow-[0_0_50px_rgba(212,175,55,0.15)] overflow-hidden ring-1 ring-primary/30 p-2">
              <Image
                src="/logo.png"
                width={168}
                height={168}
                alt="AyurStock Pro Logo"
                className="w-full h-full object-cover"
                priority
              />
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/70">
              Ayurvedic Alchemy & Logistics
            </p>
          </div>

          {/* ── Headline ── */}
          <div className="text-center mb-10 max-w-lg">
            <div className="inline-flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/20 px-4 py-2 mb-6 shadow-soft">
              <Leaf className="h-3.5 w-3.5 text-primary" />
              <span className="text-primary text-[10px] font-black tracking-[0.2em] uppercase">
                The Gold Standard in Ayurveda
              </span>
            </div>
            <h1 className="text-4xl xl:text-5xl font-black text-white leading-[1.1] tracking-tighter">
              Precision Logistics.<br />
              <span className="text-primary drop-shadow-[0_0_15px_rgba(212,175,55,0.3)]">Ultimate Control.</span>
            </h1>
            <p className="mt-6 text-muted-foreground font-bold text-sm uppercase tracking-widest leading-relaxed">
              From high-speed billing to batch archival — manage your clinical sanctuary with absolute grace.
            </p>
          </div>

          {/* ── Feature cards ── */}
          <div className="grid grid-cols-2 gap-4 w-full max-w-lg mt-auto">
            {features.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="rounded-2xl bg-surface/40 border border-primary/10 p-5 backdrop-blur-md hover:bg-surface/60 transition-all duration-300 hover:border-primary/30 group"
              >
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4 border border-primary/20 group-hover:scale-110 transition-transform">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <p className="text-white font-black text-xs uppercase tracking-widest leading-none">{title}</p>
                <p className="text-muted-foreground/60 text-[10px] font-bold mt-2 leading-relaxed uppercase tracking-wide">{desc}</p>
              </div>
            ))}
          </div>

          {/* Footer */}
          <p className="mt-8 text-primary/30 text-[9px] font-black uppercase tracking-[0.3em]">
            Curated by <span className="text-primary/60">Digital Artisans</span>
          </p>
        </div>
      </div>

      {/* ── RIGHT FORM PANEL ── */}
      <div className="flex-1 flex flex-col items-center justify-center bg-background p-5 sm:p-8 lg:p-16">

        {/* Mobile logo */}
        <div className="lg:hidden flex flex-col items-center gap-3 mb-10">
          <div className="h-24 w-24 rounded-full bg-surface shadow-2xl overflow-hidden border border-primary/20 p-1">
            <Image
              src="/logo.png"
              width={96}
              height={96}
              alt="AyurStock Pro"
              className="w-full h-full object-cover"
              priority
            />
          </div>
          <div className="text-center">
            <p className="font-black text-foreground text-xl tracking-tighter uppercase">AyurStock Pro</p>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Clinical Inventory Engine</p>
          </div>
        </div>

        <div className="w-full max-w-[380px]">
          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-3xl font-extrabold text-foreground tracking-tight">
              Welcome back
            </h2>
            <p className="text-muted-foreground text-sm mt-1.5">
              Sign in to your workspace to continue.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 font-medium">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-muted-foreground">
                Email address
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 pl-10 rounded-xl border-border bg-surface text-foreground placeholder:text-muted-foreground/40 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary transition-all"
                  placeholder="you@pharmacy.com"
                  disabled={loading}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-muted-foreground">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 pl-10 rounded-xl border-border bg-surface text-foreground placeholder:text-muted-foreground/40 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary transition-all"
                  placeholder="Enter your password"
                  disabled={loading}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold text-sm shadow-sm transition-all duration-200 hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Signing in…
                </span>
              ) : (
                <>
                  Sign in to Dashboard
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Trust note */}
          <div className="mt-8 pt-8 border-t border-border">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              <span>Your data is stored locally and never shared.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
