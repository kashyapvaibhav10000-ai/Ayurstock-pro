'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import Image from 'next/image';
import { ArrowRight, Lock, Mail } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      {/* Original White & Green Design */}
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
        <div className="bg-emerald-600 p-8 text-white flex flex-col items-center gap-4">
          <div className="h-20 w-20 bg-white/20 rounded-2xl backdrop-blur-sm flex items-center justify-center border border-white/20">
            <Image src="/logo.png" width={64} height={64} alt="AyurStock Pro" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-black uppercase tracking-tight">AyurStock Pro</h1>
            <p className="text-emerald-100/80 text-xs font-bold uppercase tracking-widest mt-1">Management System</p>
          </div>
        </div>

        <div className="p-8 sm:p-10">
          <form onSubmit={handleLogin} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl text-xs font-bold flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-red-600 animate-pulse" />
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-slate-500 pl-1">Email address</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                <Input
                  className="pl-12 h-12 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 font-medium"
                  type="email"
                  placeholder="name@pharmacy.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-slate-500 pl-1">Password</label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                <Input
                   className="pl-12 h-12 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 font-medium"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <button
              disabled={loading}
              type="submit"
              className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-[0.15em] text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-all active:scale-[0.98] disabled:opacity-70"
            >
              {loading ? (
                <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Enter Dashboard
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Private Access • Licensed Pharmacy Use Only
          </p>
        </div>
      </div>
      
      {/* Credits Footer */}
      <div className="fixed bottom-6 text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em]">
        Curated by <span className="text-emerald-600">Digital Art Sans</span>
      </div>
    </div>
  );
}
