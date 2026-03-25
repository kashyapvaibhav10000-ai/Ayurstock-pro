'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart3, Loader2, Sparkles, Cpu, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import axios from "axios";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const LIMITS = {
  gemini:    { daily: 1400,  color: '#4285F4', label: 'Gemini',     bg: 'bg-blue-50',   text: 'text-blue-700',   bar: 'bg-blue-500',   barLight: 'bg-blue-100'  },
  groq:      { daily: 14000, color: '#ff6b00', label: 'Groq',       bg: 'bg-orange-50', text: 'text-orange-700', bar: 'bg-orange-500', barLight: 'bg-orange-100' },
  openrouter:{ daily: null,  color: '#6c47ff', label: 'OpenRouter', bg: 'bg-purple-50', text: 'text-purple-700', bar: 'bg-purple-500', barLight: 'bg-purple-100' },
};

function getMillisUntilMidnightUTC() {
  const now = new Date();
  const midnight = new Date();
  midnight.setUTCHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

function formatTimeRemaining(ms: number) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function GaugeCard({ provider, used, loading }: { provider: keyof typeof LIMITS; used: number; loading: boolean }) {
  const config = LIMITS[provider];
  const pct = config.daily ? Math.min((used / config.daily) * 100, 100) : null;
  const isOverHalf = pct !== null && pct > 70;

  return (
    <Card className={`border-slate-200 shadow-sm overflow-hidden`}>
      <div className={`h-1 w-full ${pct !== null ? (isOverHalf ? 'bg-red-500' : config.bar) : config.bar}`} 
           style={pct !== null ? { width: `${pct}%`, transition: 'width 1s ease' } : {}} />
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
          <div className={`h-2.5 w-2.5 rounded-full`} style={{ backgroundColor: config.color }} />
          {config.label}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-5">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-slate-300 mt-1" />
        ) : (
          <>
            <div className="flex items-end gap-1.5">
              <span className="text-3xl font-extrabold text-slate-900">{used.toLocaleString()}</span>
              {config.daily && (
                <span className="text-sm text-slate-400 mb-1">/ {config.daily.toLocaleString()}</span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">calls today</p>

            {/* Progress bar for capped providers */}
            {pct !== null && (
              <div className="mt-3">
                <div className={`h-2 w-full rounded-full ${config.barLight}`}>
                  <div
                    className={`h-2 rounded-full transition-all duration-700 ${isOverHalf ? 'bg-red-500' : config.bar}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className={`text-[11px] mt-1 font-semibold ${isOverHalf ? 'text-red-500' : 'text-slate-400'}`}>
                  {pct.toFixed(1)}% of daily limit used
                </p>
              </div>
            )}

            {/* Unlimited indicator */}
            {pct === null && (
              <p className="text-[11px] text-purple-500 font-semibold mt-2">No daily cap (pay-per-use)</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function AiUsageTab() {
  const [usage, setUsage] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeToReset, setTimeToReset] = useState('');

  const fetchUsage = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/admin/ai-usage');
      if (response.data.success) {
        setUsage(response.data.data.reverse());
      }
    } catch (error) {
      console.error('Failed to fetch AI usage:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsage();

    const tick = () => setTimeToReset(formatTimeRemaining(getMillisUntilMidnightUTC()));
    tick();
    const interval = setInterval(tick, 60000);
    return () => clearInterval(interval);
  }, []);

  // Today's usage from the last item in the array (most recent)
  const today = usage.length > 0 ? usage[usage.length - 1] : null;
  const todayGemini  = today?.gemini     || 0;
  const todayGroq    = today?.groq       || 0;
  const todayOR      = today?.openrouter || 0;

  const totalCalls = usage.reduce((acc, curr) => acc + curr.gemini + curr.groq + curr.openrouter + curr.cloudflare + curr.mistral, 0);

  return (
    <div className="space-y-6">
      
      {/* Header Row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-stitch-primary" />
            AI Engine Usage
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Daily call volume across AI providers. Limits reset at UTC midnight.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {timeToReset && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5">
              <Clock className="h-3.5 w-3.5" />
              Resets in {timeToReset}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={fetchUsage} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Three Gauges */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <GaugeCard provider="gemini" used={todayGemini} loading={loading} />
        <GaugeCard provider="groq" used={todayGroq} loading={loading} />
        <GaugeCard provider="openrouter" used={todayOR} loading={loading} />
      </div>

      {/* Summary */}
      <div className="flex items-center gap-6 rounded-xl bg-slate-50 border border-slate-200 px-5 py-3">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Calls (All Time)</p>
          <p className="text-2xl font-extrabold text-slate-900">{totalCalls.toLocaleString()}</p>
        </div>
        <div className="w-px h-10 bg-slate-200" />
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Today Total</p>
          <p className="text-2xl font-extrabold text-slate-900">{(todayGemini + todayGroq + todayOR).toLocaleString()}</p>
        </div>
        <div className="w-px h-10 bg-slate-200" />
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Providers</p>
          <p className="text-sm font-bold text-stitch-primary mt-0.5">Gemini → Groq → OpenRouter</p>
        </div>
      </div>

      {/* Historical Chart */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base font-bold">Provider Distribution (History)</CardTitle>
          <CardDescription>Daily breakdown of AI call volume across all providers.</CardDescription>
        </CardHeader>
        <CardContent className="h-[360px]">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={usage} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" fontSize={10} tickFormatter={(val) => val.split('-').slice(1).join('/')} />
                <YAxis fontSize={10} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '12px' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="gemini"     fill="#4285F4" radius={[4,4,0,0]} name="Gemini" />
                <Bar dataKey="groq"       fill="#ff6b00" radius={[4,4,0,0]} name="Groq" />
                <Bar dataKey="mistral"    fill="#fca43a" radius={[4,4,0,0]} name="Mistral" />
                <Bar dataKey="cloudflare" fill="#f48120" radius={[4,4,0,0]} name="Workers AI" />
                <Bar dataKey="openrouter" fill="#6c47ff" radius={[4,4,0,0]} name="OpenRouter" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
