'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart3, Loader2, Sparkles, Cpu } from "lucide-react";
import axios from "axios";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';

export default function AiUsageTab() {
  const [usage, setUsage] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsage = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/admin/ai-usage');
      if (response.data.success) {
        setUsage(response.data.data.reverse()); // Show chronological order
      }
    } catch (error) {
      console.error('Failed to fetch AI usage:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsage();
  }, []);

  const totalCalls = usage.reduce((acc, curr) => acc + curr.gemini + curr.groq + curr.openrouter + curr.cloudflare + curr.mistral, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="h-3 w-3" />
              Total AI Queries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-slate-900">{totalCalls.toLocaleString()}</p>
            <p className="text-xs text-slate-400 mt-1">Platform wide (Last 30 days)</p>
          </CardContent>
        </Card>

        {/* Top Provider (simplified logic) */}
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <Cpu className="h-3 w-3" />
              Dominant Provider
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary italic uppercase tracking-tighter">Gemini / Groq</p>
            <p className="text-xs text-slate-400 mt-1">Active fallback sequence engaged</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <BarChart3 className="h-3 w-3" />
              Usage Tier
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">Free / Pro</p>
            <p className="text-xs text-slate-400 mt-1">Optimizing for cost efficiency</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-lg font-bold">Provider Distribution</CardTitle>
          <CardDescription>Daily breakdown of AI call volume across multiple providers.</CardDescription>
        </CardHeader>
        <CardContent className="h-[400px]">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={usage}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" fontSize={10} tickFormatter={(val) => val.split('-').slice(1).join('/')} />
                <YAxis fontSize={10} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
                <Legend iconType="circle" />
                <Bar dataKey="gemini" fill="#4285F4" radius={[4, 4, 0, 0]} name="Gemini" />
                <Bar dataKey="groq" fill="#ff6b00" radius={[4, 4, 0, 0]} name="Groq" />
                <Bar dataKey="mistral" fill="#fca43a" radius={[4, 4, 0, 0]} name="Mistral" />
                <Bar dataKey="cloudflare" fill="#f48120" radius={[4, 4, 0, 0]} name="Workers AI" />
                <Bar dataKey="openrouter" fill="#6c47ff" radius={[4, 4, 0, 0]} name="OpenRouter" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
