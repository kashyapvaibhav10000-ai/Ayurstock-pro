'use client';

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useParams, useRouter } from 'next/navigation';

interface InvoiceSettings {
  invoicePrefix: string;
  watermarkText?: string | null;
  watermarkEnabled?: boolean;
}

interface ShopSettings {
  shopName: string;
  addressLine1: string;
  addressLine2?: string | null;
  phone: string;
  email: string;
  gstin: string;
}

interface SaleItem {
  id: string;
  quantity: number;
  mrp: number;
  rate: number;
  discount: number;
  gst: number;
  amount: number;
  medicine: {
    name: string;
    hsn: string;
  };
  batch: {
    batchNumber: string;
    expiryDate: string;
  };
}

interface SaleDetails {
  id: string;
  invoiceNumber: string;
  createdAt: string;
  paymentMode: string;
  subtotal: number;
  discountTotal: number;
  gstTotal: number;
  grandTotal: number;
  customer?: {
    name: string;
    phone: string;
    address: string;
  } | null;
  saleItems: SaleItem[];
}

const numberFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatCurrency = (value: number) => `Rs.${numberFormatter.format(value)}`;

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString('en-GB');
};

const formatExpiry = (dateString: string) => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${month}/${year}`;
};

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

  const totals = useMemo(() => {
    if (!sale) {
      return { subtotal: 0, discountTotal: 0, gstTotal: 0, grandTotal: 0, cgst: 0, sgst: 0 };
    }
    const cgst = sale.gstTotal / 2;
    const sgst = sale.gstTotal / 2;
    return {
      subtotal: sale.subtotal,
      discountTotal: sale.discountTotal,
      gstTotal: sale.gstTotal,
      grandTotal: sale.grandTotal,
      cgst,
      sgst,
    };
  }, [sale]);

  const customer = sale?.customer || {
    name: 'Walk-in Customer',
    phone: '0000000000',
    address: 'Walk-in',
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
    <div className="min-h-screen bg-slate-100 p-6 print:bg-white print:p-0">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between print-hidden">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Invoice Preview</h1>
            <p className="text-sm text-slate-500">Review and print the GST invoice.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Print Invoice
            </button>
            <button
              onClick={() => window.print()}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Download PDF
            </button>
          </div>
        </div>

        <div className="invoice-container relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-8 shadow-sm print:rounded-none print:border-0 print:shadow-none">
          {settings.watermarkEnabled ? (
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
              <div className="invoice-watermark whitespace-pre-line text-slate-200">
                {(settings.watermarkText || shopSettings.shopName).toUpperCase()}
              </div>
            </div>
          ) : null}

          <div className="relative z-10 space-y-6">
            <header className="flex flex-col gap-6 border-b border-slate-200 pb-6 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <div className="text-2xl font-bold uppercase tracking-wide text-slate-900">
                  {shopSettings.shopName}
                </div>
                <div className="text-sm text-slate-600">
                  <div>{shopSettings.addressLine1}</div>
                  {shopSettings.addressLine2 ? <div>{shopSettings.addressLine2}</div> : null}
                </div>
                <div className="text-sm text-slate-600">
                  <div>Phone: {shopSettings.phone}</div>
                  <div>Email: {shopSettings.email}</div>
                </div>
                <div className="text-sm font-semibold text-slate-700">GSTIN: {shopSettings.gstin}</div>
              </div>

              <div className="min-w-[240px] rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <div className="flex justify-between">
                  <span className="text-slate-500">Invoice No:</span>
                  <span className="font-semibold text-slate-900">{sale.invoiceNumber}</span>
                </div>
                <div className="mt-2 flex justify-between">
                  <span className="text-slate-500">Date:</span>
                  <span>{formatDate(sale.createdAt)}</span>
                </div>
                <div className="mt-2 flex justify-between">
                  <span className="text-slate-500">Payment:</span>
                  <span>{sale.paymentMode}</span>
                </div>
              </div>
            </header>

            <section className="grid gap-6 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Bill To</div>
                <div className="mt-3 space-y-1 text-slate-700">
                  <div className="font-semibold text-slate-900">{customer.name}</div>
                  <div>{customer.address}</div>
                  <div>Phone: {customer.phone}</div>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Invoice Details</div>
                <div className="mt-3 space-y-1 text-slate-700">
                  <div>Invoice Type: GST</div>
                  <div>Items: {sale.saleItems.length}</div>
                </div>
              </div>
            </section>

            <section>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-slate-100 text-[11px] uppercase tracking-widest text-slate-500">
                    <tr>
                      <th className="px-3 py-3">S.No</th>
                      <th className="px-3 py-3">Product</th>
                      <th className="px-3 py-3">Batch</th>
                      <th className="px-3 py-3">Exp</th>
                      <th className="px-3 py-3">HSN</th>
                      <th className="px-3 py-3 text-right">MRP</th>
                      <th className="px-3 py-3 text-right">Qty</th>
                      <th className="px-3 py-3 text-right">Rate</th>
                      <th className="px-3 py-3 text-right">Discount</th>
                      <th className="px-3 py-3 text-right">GST</th>
                      <th className="px-3 py-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sale.saleItems.map((item, index) => {
                      const afterDiscount = item.quantity * item.rate - item.discount;
                      const gstPercent = afterDiscount > 0 ? (item.gst / afterDiscount) * 100 : 0;
                      return (
                        <tr key={item.id} className="border-t border-slate-200 text-slate-700">
                          <td className="px-3 py-3">{index + 1}</td>
                          <td className="px-3 py-3">
                            <div className="font-semibold text-slate-900">{item.medicine.name}</div>
                          </td>
                          <td className="px-3 py-3">{item.batch.batchNumber}</td>
                          <td className="px-3 py-3">{formatExpiry(item.batch.expiryDate)}</td>
                          <td className="px-3 py-3">{item.medicine.hsn}</td>
                          <td className="px-3 py-3 text-right">{numberFormatter.format(item.mrp)}</td>
                          <td className="px-3 py-3 text-right">{item.quantity}</td>
                          <td className="px-3 py-3 text-right">{numberFormatter.format(item.rate)}</td>
                          <td className="px-3 py-3 text-right">{numberFormatter.format(item.discount)}</td>
                          <td className="px-3 py-3 text-right">{gstPercent.toFixed(1)}%</td>
                          <td className="px-3 py-3 text-right font-semibold">
                            {numberFormatter.format(item.amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="flex flex-col items-end gap-3 border-t border-slate-200 pt-4 text-sm">
              <div className="w-full max-w-sm space-y-2 text-slate-700">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatCurrency(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Discount</span>
                  <span>-{formatCurrency(totals.discountTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>CGST</span>
                  <span>{formatCurrency(totals.cgst)}</span>
                </div>
                <div className="flex justify-between">
                  <span>SGST</span>
                  <span>{formatCurrency(totals.sgst)}</span>
                </div>
                <div className="flex justify-between border-t border-dashed border-slate-300 pt-2 text-base font-semibold text-slate-900">
                  <span>Grand Total</span>
                  <span>{formatCurrency(totals.grandTotal)}</span>
                </div>
              </div>
            </section>

            <footer className="grid gap-6 border-t border-slate-200 pt-6 text-sm text-slate-600 md:grid-cols-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Authorized Signature
                </div>
                <div className="mt-6 h-12 border-b border-slate-300" />
              </div>
              <div className="flex flex-col items-start justify-between gap-3 md:items-end">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                  Thank you for shopping with us.
                </div>
                <div className="text-xs text-slate-400">Computer generated invoice</div>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
