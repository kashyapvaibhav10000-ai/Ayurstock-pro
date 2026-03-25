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
  gemini:    { daily: 1400,  color: '#D4AF37', label: 'Gemini',     bg: 'bg-primary/10',   text: 'text-primary',   bar: 'bg-primary',   barLight: 'bg-primary/20'  },
  groq:      { daily: 14000, color: '#D4AF37', label: 'Groq',       bg: 'bg-primary/5', text: 'text-primary/80', bar: 'bg-primary/80', barLight: 'bg-primary/10' },
  openrouter:{ daily: null,  color: '#D4AF37', label: 'OpenRouter', bg: 'bg-primary/5', text: 'text-primary/80', bar: 'bg-primary/80', barLight: 'bg-primary/10' },
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
    <Card className={`border-border bg-surface shadow-soft overflow-hidden hover:border-primary/30 transition-all duration-300`}>
      <div className={`h-1 w-full ${pct !== null ? (isOverHalf ? 'bg-red-500' : config.bar) : config.bar}`} 
           style={pct !== null ? { width: `${pct}%`, transition: 'width 1s ease' } : {}} />
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
          <div className={`h-2.5 w-2.5 rounded-full shadow-[0_0_5px_rgba(212,175,55,0.5)]`} style={{ backgroundColor: config.color }} />
          {config.label}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-5">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-slate-300 mt-1" />
        ) : (
          <>
            <div className="flex items-end gap-1.5 leading-none">
              <span className="text-3xl font-black text-foreground tracking-tighter">{used.toLocaleString()}</span>
              {config.daily && (
                <span className="text-[10px] font-bold text-muted-foreground mb-1 uppercase tracking-widest">/ {config.daily.toLocaleString()}</span>
              )}
            </div>
            <p className="text-[9px] font-black text-muted-foreground mt-2 uppercase tracking-[0.2em]">calls processed</p>

            {/* Progress bar for capped providers */}
            {pct !== null && (
              <div className="mt-4">
                <div className={`h-[6px] w-full rounded-full bg-surface-muted border border-border overflow-hidden`}>
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${isOverHalf ? 'bg-danger shadow-[0_0_10px_rgba(239,68,68,0.4)]' : 'bg-primary shadow-[0_0_10px_rgba(212,175,55,0.4)]'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className={`text-[9px] mt-2 font-black uppercase tracking-[0.1em] ${isOverHalf ? 'text-danger' : 'text-muted-foreground'}`}>
                  {pct.toFixed(1)}% usage intensity
                </p>
              </div>
            )}

            {/* Unlimited indicator */}
            {pct === null && (
              <p className="text-[10px] text-primary font-black mt-3 uppercase tracking-widest bg-primary/10 px-2 py-1 rounded inline-block">Uncapped Pipeline</p>
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
          <h2 className="text-xl font-black text-foreground tracking-tight uppercase flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            AI Engine Pulse
          </h2>
          <p className="text-[11px] font-bold text-muted-foreground mt-2 uppercase tracking-widest leading-relaxed">
            Call volume across distributed providers. Refresh resets at <span className="text-foreground">UTC 00:00</span>.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {timeToReset && (
            <div className="flex items-center gap-2 text-[10px] font-black text-primary bg-primary/10 border border-primary/20 rounded-xl px-4 py-2.5 uppercase tracking-[0.15em] shadow-soft">
              <Clock className="h-3.5 w-3.5" />
              Reset in {timeToReset}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={fetchUsage} disabled={loading} className="h-10 gap-2 px-4 rounded-xl border-border bg-background hover:bg-primary/5 hover:text-primary font-black uppercase tracking-widest text-[10px] transition-all">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Sync
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
      <div className="flex items-center gap-10 rounded-2xl bg-surface-muted/30 border border-border px-8 py-6 shadow-inner relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <Cpu className="w-32 h-32 text-primary" />
        </div>
        <div>
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.25em] mb-2">Aggregate Volume</p>
          <p className="text-3xl font-black text-foreground tracking-tighter">{totalCalls.toLocaleString()}</p>
        </div>
        <div className="w-px h-12 bg-border" />
        <div>
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.25em] mb-2">Intraday Total</p>
          <p className="text-3xl font-black text-primary tracking-tighter drop-shadow-[0_0_10px_rgba(212,175,55,0.3)]">{(todayGemini + todayGroq + todayOR).toLocaleString()}</p>
        </div>
        <div className="w-px h-12 bg-border" />
        <div>
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.25em] mb-2">active pipeline</p>
          <p className="text-[11px] font-black text-primary mt-1 uppercase tracking-widest flex items-center gap-2">
            GEMINI <span className="h-1 w-4 bg-primary/20 rounded-full" /> GROQ <span className="h-1 w-4 bg-primary/20 rounded-full" /> OPENROUTER
          </p>
        </div>
      </div>

      {/* Historical Chart */}
      <Card className="border-border bg-surface shadow-soft">
        <CardHeader>
          <CardTitle className="text-[13px] font-black tracking-[0.2em] uppercase text-foreground">Timeline Distribution</CardTitle>
          <CardDescription className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Provider processing load over time.</CardDescription>
        </CardHeader>
        <CardContent className="h-[360px]">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={usage} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(212,175,55,0.05)" />
                <XAxis dataKey="date" fontSize={10} fontWeight="900" tickFormatter={(val) => val.split('-').slice(1).join('/')} axisLine={false} tickLine={false} tick={{fill: 'rgba(255,255,255,0.4)'}} />
                <YAxis fontSize={10} fontWeight="900" axisLine={false} tickLine={false} tick={{fill: 'rgba(255,255,255,0.4)'}} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1A1A1A', borderRadius: '16px', border: '1px solid rgba(212,175,55,0.2)', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', fontSize: '11px', fontWeight: '900', textTransform: 'uppercase' }} 
                  cursor={{fill: 'rgba(212,175,55,0.03)'}}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', paddingTop: '20px', letterSpacing: '0.1em' }} />
                <Bar dataKey="gemini"     fill="#D4AF37" radius={[4,4,0,0]} name="Gemini" />
                <Bar dataKey="groq"       fill="rgba(212,175,55,0.6)" radius={[4,4,0,0]} name="Groq" />
                <Bar dataKey="mistral"    fill="rgba(212,175,55,0.4)" radius={[4,4,0,0]} name="Mistral" />
                <Bar dataKey="cloudflare" fill="rgba(212,175,55,0.3)" radius={[4,4,0,0]} name="Workers AI" />
                <Bar dataKey="openrouter" fill="rgba(212,175,55,0.2)" radius={[4,4,0,0]} name="OpenRouter" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
