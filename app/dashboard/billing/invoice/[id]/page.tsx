'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams, useRouter } from 'next/navigation';
import InvoiceTemplate, { InvoiceSettings, ShopSettings, SaleDetails } from '@/components/InvoiceTemplate';

export default function InvoicePreviewPage() {
  const params = useParams();
  const router = useRouter();
  const saleId = params?.id as string;
  const [settings, setSettings] = useState<InvoiceSettings | null>(null);
  const [shopSettings, setShopSettings] = useState<ShopSettings | null>(null);
  const [sale, setSale] = useState<SaleDetails | null>(null);
  const [loading, setLoading] = useState(true);

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

    if (saleId) {
      fetchInvoiceData();
    }
  }, [saleId]);

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
              onClick={() => window.print()}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 shadow-sm"
            >
              Print Invoice
            </button>
            <button
              onClick={() => window.print()}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 shadow-sm"
            >
              Download PDF
            </button>
          </div>
        </div>

        <InvoiceTemplate sale={sale} settings={settings} shopSettings={shopSettings} />
      </div>
    </div>
  );
}
