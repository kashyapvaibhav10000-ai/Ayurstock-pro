'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import Image from 'next/image';
import { ArrowRight, Lock, Mail, Zap, ShieldCheck, FileText, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';

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

  const features = [
    { icon: Zap, title: 'Fast GST Billing', desc: 'Bill a customer in under 10 seconds with barcode scanning.' },
    { icon: ShieldCheck, title: 'Expiry Tracking', desc: 'Batch-level expiry dispensing with expiry alerts built-in.' },
    { icon: FileText, title: 'AI Invoice Import', desc: 'Import full price lists from PDF invoices automatically.' },
    { icon: Users, title: 'Multi-User & Secure', desc: 'Role-based access with full audit logs.' },
  ];

  return (
    <div className="light min-h-screen flex font-sans" data-theme="light">

      {/* ── LEFT BRAND PANEL ── */}
      <div className="hidden lg:flex lg:w-[58%] flex-col relative overflow-hidden bg-gradient-to-br from-emerald-700 via-emerald-800 to-emerald-900">
        <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-12 xl:px-20 py-16">

          {/* Logo */}
          <div className="flex flex-col items-center gap-4 mb-10">
            <div className="h-[168px] w-[168px] rounded-full bg-white shadow-[0_0_40px_rgba(16,185,129,0.3)] overflow-hidden ring-4 ring-white/20 flex items-center justify-center">
              <Image
                src="/logo.png"
                width={140}
                height={140}
                alt="AyurStock Pro"
                className="object-contain"
              />
            </div>
            <p className="text-emerald-200/70 text-xs font-bold uppercase tracking-[0.25em]">
              Ayurvedic Pharmacy Management
            </p>
          </div>

          {/* Badge */}
          <div className="flex items-center gap-2 mb-8">
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-emerald-400/30 bg-emerald-500/20 backdrop-blur-sm">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
              <span className="text-xs font-bold text-emerald-100 uppercase tracking-[0.15em]">
                Trusted by Ayurvedic Shops
              </span>
            </div>
          </div>

          {/* Heading */}
          <h1 className="text-4xl xl:text-5xl font-black text-white leading-[1.1] tracking-tighter text-center">
            Your pharmacy,<br />
            <span className="text-emerald-300">fully in control.</span>
          </h1>

          <p className="mt-6 text-emerald-200/60 font-medium text-sm text-center max-w-md leading-relaxed">
            From billing to batch expiry — manage every corner of your shop from one place.
          </p>

          {/* Feature Cards */}
          <div className="grid grid-cols-2 gap-3 mt-10 w-full max-w-md">
            {features.map((f) => (
              <div key={f.title} className="rounded-2xl border border-emerald-500/20 bg-emerald-800/40 backdrop-blur-sm p-4 hover:bg-emerald-700/40 transition-all duration-300">
                <div className="h-9 w-9 rounded-xl bg-emerald-500/20 flex items-center justify-center mb-3">
                  <f.icon className="h-4 w-4 text-emerald-300" />
                </div>
                <p className="text-[11px] font-bold text-white uppercase tracking-wider">{f.title}</p>
                <p className="text-[10px] text-emerald-300/60 mt-1.5 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>

          {/* Footer */}
          <p className="mt-10 text-[10px] text-emerald-400/40 uppercase tracking-[0.3em] font-bold">
            Built with care by <span className="text-emerald-300/60">Vaibhav</span>
          </p>
        </div>
      </div>

      {/* ── RIGHT LOGIN PANEL ── */}
      <div className="flex-1 flex flex-col justify-center px-8 sm:px-12 lg:px-16 xl:px-20 bg-white">
        {/* Mobile logo */}
        <div className="lg:hidden flex flex-col items-center gap-3 mb-10">
          <div className="h-24 w-24 rounded-full bg-emerald-600 shadow-xl overflow-hidden border-4 border-emerald-200/40 flex items-center justify-center">
            <Image
              src="/logo.png"
              width={80}
              height={80}
              alt="AyurStock Pro"
              className="object-contain"
            />
          </div>
          <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">AyurStock Pro</h2>
        </div>

        <div className="w-full max-w-sm mx-auto">
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Welcome back</h2>
          <p className="mt-2 text-sm text-slate-500">Sign into your workspace to continue.</p>

          <form onSubmit={handleLogin} className="mt-10 space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl text-xs font-bold flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Email address</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                <Input
                  className="pl-12 h-12 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 font-medium"
                  type="email"
                  placeholder="you@pharmacy.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Password</label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                <Input
                  className="pl-12 h-12 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 font-medium"
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
              className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-all active:scale-[0.98] disabled:opacity-70"
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

          <p className="mt-8 text-center text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            Your data is stored locally and never shared.
          </p>
        </div>
      </div>
    </div>
  );
}
