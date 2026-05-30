'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import InvoiceTemplate, { InvoiceSettings, ShopSettings, SaleDetails } from '@/components/InvoiceTemplate';
import { MessageCircle, X } from 'lucide-react';
import html2canvas from 'html2canvas';

export default function InvoicePreviewPage() {
  const params = useParams();
  const router = useRouter();
  const saleId = params?.id as string;
  const searchParams = useSearchParams();
  const shouldAutoPrint = searchParams.get('autoprint') === '1';
  const [settings, setSettings] = useState<InvoiceSettings | null>(null);
  const [shopSettings, setShopSettings] = useState<ShopSettings | null>(null);
  const [sale, setSale] = useState<SaleDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWaPrompt, setShowWaPrompt] = useState(false);
  const [waPhone, setWaPhone] = useState('');

  useEffect(() => {
    const fetchInvoiceData = async () => {
      try {
        const [saleResponse, settingsResponse, shopResponse] = await Promise.all([
          axios.get(`/api/sales/${saleId}`),
          axios.get('/api/settings/invoice'),
          axios.get('/api/settings/shop'),
        ]);

        if (saleResponse.data.success) {
          const saleData = saleResponse.data.data;
          setSale({
            id: saleData.id,
            invoiceNumber: saleData.invoiceNumber,
            createdAt: saleData.createdAt,
            paymentMode: saleData.paymentMode,
            subtotal: Number(saleData.subtotal),
            discountTotal: Number(saleData.discountTotal),
            gstTotal: Number(saleData.gstTotal),
            grandTotal: Number(saleData.grandTotal),
            customer: saleData.customer,
            saleItems: saleData.saleItems.map((item: any) => ({
              id: item.id,
              quantity: item.quantity,
              mrp: Number(item.mrp),
              rate: Number(item.rate),
              discount: Number(item.discount),
              gst: Number(item.gst),
              gstPercent: Number(item.gstPercent),
              amount: Number(item.amount),
              medicine: item.medicine,
              batch: {
                batchNumber: item.batch.batchNumber,
                expiryDate: item.batch.expiryDate,
              },
            })),
          });
        }

        if (settingsResponse.data.success) {
          setSettings(settingsResponse.data.data);
        }
        if (shopResponse.data.success) {
          setShopSettings(shopResponse.data.data);
        }
      } catch (error) {
        console.error('Failed to load invoice preview', error);
      } finally {
        setLoading(false);
      }
    };

    if (saleId) fetchInvoiceData();
  }, [saleId]);

  // Auto-print when enabled via billing settings
  useEffect(() => {
    if (!loading && sale && settings && shopSettings && shouldAutoPrint) {
      const timer = setTimeout(() => window.print(), 800);
      return () => clearTimeout(timer);
    }
  }, [loading, sale, settings, shopSettings, shouldAutoPrint]);

  const buildWaImage = async (phone: string) => {
    if (!sale) return;
    const element = document.getElementById('invoice-capture');
    if (!element) return;
    const canvas = await html2canvas(element, { scale: 2, useCORS: true });
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `invoice-${sale.invoiceNumber}.png`, { type: 'image/png' });
      const cleanPhone = phone.replace(/\D/g, '');
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `Invoice ${sale.invoiceNumber}` });
      } else {
        try {
          // Attempt to copy image to clipboard
          const item = new ClipboardItem({ 'image/png': blob });
          await navigator.clipboard.write([item]);
          alert('Invoice image copied to clipboard! After WhatsApp opens, simply paste (Ctrl+V) into the chat to send the image.');
        } catch (err) {
          console.error('Clipboard copy failed', err);
          // Fallback to downloading if clipboard fails
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `invoice-${sale.invoiceNumber}.png`;
          a.click();
          URL.revokeObjectURL(url);
          alert('Invoice image downloaded! Please manually attach it in WhatsApp after it opens.');
        }
        window.open(`https://wa.me/${cleanPhone}`, '_blank');
      }
      setShowWaPrompt(false);
      setWaPhone('');
    }, 'image/png');
  };

  const handleWhatsApp = () => {
    const phone = sale?.customer?.phone;
    if (phone && phone !== '') {
      buildWaImage(phone);
    } else {
      setShowWaPrompt(true);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500">
        Loading invoice preview...
      </div>
    );
  }

  if (!sale || !settings || !shopSettings) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-sm text-slate-500">
        <p>Unable to load invoice. Please try again.</p>
        <button
          onClick={() => router.push('/dashboard/billing')}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
        >
          Back to Billing
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-6 print:bg-transparent print:p-0">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between print-hidden">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Invoice Preview</h1>
            <p className="text-sm text-slate-500">Review and print the GST invoice.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleWhatsApp}
              className="flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1ebe5d] shadow-sm"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </button>
            <button
              onClick={() => window.print()}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 shadow-sm"
            >
              Print Invoice
            </button>
          </div>
        </div>

        <div id="invoice-capture"><InvoiceTemplate sale={sale} settings={settings} shopSettings={shopSettings} /></div>
      </div>

      {/* WhatsApp phone prompt modal */}
      {showWaPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#25D366]/10">
                  <MessageCircle className="h-5 w-5 text-[#25D366]" />
                </div>
                <h2 className="text-lg font-bold text-slate-900">Send via WhatsApp</h2>
              </div>
              <button onClick={() => setShowWaPrompt(false)} className="rounded-lg p-1.5 hover:bg-slate-100 transition">
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-4">Enter the customer&apos;s WhatsApp number (with country code, e.g. 91XXXXXXXXXX)</p>
            <input
              type="tel"
              value={waPhone}
              onChange={(e) => setWaPhone(e.target.value)}
              placeholder="91XXXXXXXXXX"
              autoFocus
              className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-[#25D366] focus:ring-4 focus:ring-[#25D366]/10"
              onKeyDown={(e) => e.key === 'Enter' && waPhone.length >= 10 && buildWaImage(waPhone)}
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowWaPrompt(false)}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => buildWaImage(waPhone)}
                disabled={waPhone.length < 10}
                className="flex-1 rounded-xl bg-[#25D366] py-2.5 text-sm font-semibold text-white hover:bg-[#1ebe5d] disabled:opacity-50 transition"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
