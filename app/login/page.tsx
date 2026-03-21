'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import Image from 'next/image';
import { ArrowRight, Lock, Mail, Pill } from 'lucide-react';
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
      // PRE-FLIGHT PURGE: 
      // Forcefully wipe any existing stale local state to prevent collision
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Attempt to clear the stale HTTP-only cookie before taking a new one
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
    <div className="relative min-h-screen overflow-hidden bg-slate-950">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.34),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(6,182,212,0.28),_transparent_22%),linear-gradient(135deg,_#020617_0%,_#0f172a_45%,_#312e81_100%)]" />
      <div className="animate-blob-slow absolute -left-20 top-10 h-72 w-72 rounded-full bg-emerald-500/35 blur-3xl" />
      <div className="animate-blob-medium absolute right-[-5rem] top-24 h-80 w-80 rounded-full bg-cyan-500/30 blur-3xl" />
      <div className="animate-blob-fast absolute bottom-[-5rem] left-1/3 h-80 w-80 rounded-full bg-blue-600/30 blur-3xl" />
      <div className="animate-blob-slow absolute bottom-16 right-1/4 h-72 w-72 rounded-full bg-purple-600/30 blur-3xl" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:120px_120px] opacity-20" />

      <div className="relative z-10 flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md rounded-[28px] border border-white/20 bg-white/10 p-8 text-white shadow-2xl backdrop-blur-xl transition-all duration-300 hover:scale-[1.02] sm:p-9">
          <div className="mb-8">
            <div className="mb-5 inline-flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 shadow-lg">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-200">
                <Image src="/logo.png" width={80} height={80} alt="AyurStock Pro Logo" />
              </div>
              <div>
                <div className="text-lg font-semibold tracking-tight text-white">AyurStock Pro</div>
                <div className="text-xs text-white/65">Ayurvedic Pharmacy Management System</div>
              </div>
            </div>

            <h1 className="text-3xl font-semibold tracking-tight text-white">Login to your workspace</h1>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {error ? (
              <div className="rounded-2xl border border-red-300/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="text-sm font-medium text-white/80">Email / Username</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                  className="h-12 rounded-xl border-white/15 bg-white/10 pl-11 text-white placeholder:text-white/35 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-0"
                  placeholder="admin@pharmacy.com"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-white/80">Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
                <Input
                  type="password"
                  value={password}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                  className="h-12 rounded-xl border-white/15 bg-white/10 pl-11 text-white placeholder:text-white/35 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-0"
                  placeholder="Enter your password"
                  disabled={loading}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 font-medium text-white shadow-lg transition-all duration-300 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Signing in...' : 'Login to Dashboard'}
              {!loading ? <ArrowRight className="h-4 w-4" /> : null}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
