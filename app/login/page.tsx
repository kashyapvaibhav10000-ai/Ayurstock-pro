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
      <div className="hidden lg:flex lg:w-[58%] flex-col relative overflow-hidden bg-gradient-to-br from-green-950 via-green-900 to-green-800">

        {/* Decorative blobs */}
        <div className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-green-500/20 blur-3xl animate-blob-slow" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 rounded-full bg-emerald-400/15 blur-3xl animate-blob-medium" />
        <div className="pointer-events-none absolute top-1/2 left-1/3 h-64 w-64 rounded-full bg-green-300/10 blur-3xl animate-blob-fast" />
        {/* Subtle grid */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center h-full px-12 xl:px-16 py-10 xl:py-14">

          {/* ── LOGO — top center, large on white disc ── */}
          <div className="flex flex-col items-center gap-4 mb-10">
            <div className="h-[168px] w-[168px] rounded-full bg-white shadow-[0_8px_40px_rgba(0,0,0,0.4)] overflow-hidden ring-4 ring-white/20">
              <Image
                src="/logo.png"
                width={168}
                height={168}
                alt="AyurStock Pro Logo"
                className="w-full h-full object-cover"
                priority
              />
            </div>
            <p className="text-green-200/70 text-sm font-medium tracking-wide">
              Ayurvedic Pharmacy Management
            </p>
          </div>

          {/* ── Headline ── */}
          <div className="text-center mb-10 max-w-lg">
            <div className="inline-flex items-center gap-2 rounded-full bg-green-500/20 border border-green-400/25 px-3 py-1.5 mb-5">
              <Leaf className="h-3.5 w-3.5 text-green-300" />
              <span className="text-green-200 text-xs font-semibold tracking-wide uppercase">
                Trusted by Ayurvedic Shops
              </span>
            </div>
            <h1 className="text-4xl xl:text-5xl font-extrabold text-white leading-[1.15] tracking-tight">
              Your pharmacy,<br />
              <span className="text-green-300">fully in control.</span>
            </h1>
            <p className="mt-4 text-green-100/60 text-base leading-relaxed">
              From billing to batch expiry — manage every corner of your shop from one place.
            </p>
          </div>

          {/* ── Feature cards ── */}
          <div className="grid grid-cols-2 gap-3 w-full max-w-lg mt-auto">
            {features.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="rounded-2xl bg-white/6 border border-white/10 p-4 backdrop-blur-sm hover:bg-white/10 transition-colors duration-200"
              >
                <div className="h-8 w-8 rounded-xl bg-green-500/25 flex items-center justify-center mb-3">
                  <Icon className="h-4 w-4 text-green-300" />
                </div>
                <p className="text-white font-semibold text-sm leading-snug">{title}</p>
                <p className="text-green-200/55 text-xs mt-1 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          {/* Footer */}
          <p className="mt-8 text-green-300/35 text-xs">
            Built with care by{' '}
            <span className="text-green-300/65 font-semibold">Vaibhav</span>
          </p>
        </div>
      </div>

      {/* ── RIGHT FORM PANEL ── */}
      <div className="flex-1 flex flex-col items-center justify-center bg-background p-5 sm:p-8 lg:p-16">

        {/* Mobile logo */}
        <div className="lg:hidden flex flex-col items-center gap-3 mb-10">
          <div className="h-24 w-24 rounded-full bg-surface shadow-lg overflow-hidden">
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
            <p className="font-extrabold text-text-primary text-lg">AyurStock Pro</p>
            <p className="text-xs text-text-muted mt-0.5">Ayurvedic Pharmacy Management</p>
          </div>
        </div>

        <div className="w-full max-w-[380px]">
          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-3xl font-extrabold text-text-primary tracking-tight">
              Welcome back
            </h2>
            <p className="text-text-muted text-sm mt-1.5">
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
              <label className="text-sm font-semibold text-text-secondary">
                Email address
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 pl-10 rounded-xl border-surface-border bg-surface-muted/50 text-text-primary placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary transition-all"
                  placeholder="you@pharmacy.com"
                  disabled={loading}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-text-secondary">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 pl-10 rounded-xl border-surface-border bg-surface-muted/50 text-text-primary placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary transition-all"
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
          <div className="mt-8 pt-8 border-t border-surface-border">
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              <span>Your data is stored locally and never shared.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
