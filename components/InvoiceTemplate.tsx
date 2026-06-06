import React, { useMemo } from 'react';

export interface InvoiceSettings {
  invoicePrefix: string;
  watermarkText?: string | null;
  watermarkEnabled?: boolean;
}

export interface ShopSettings {
  shopName: string;
  addressLine1: string;
  addressLine2?: string | null;
  phone: string;
  email: string;
  gstin: string;
}

export interface SaleItem {
  id: string;
  quantity: number;
  mrp: number;
  rate: number;
  discount: number;
  gst: number;
  gstPercent: number;
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

export interface SaleDetails {
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

interface InvoiceTemplateProps {
  sale: SaleDetails;
  settings: InvoiceSettings;
  shopSettings: ShopSettings;
  gstMode?: 'inclusive' | 'exclusive';
}

const numberFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatCurrency = (value: number) => `Rs.${numberFormatter.format(value)}`;

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB');
};

const formatExpiry = (dateString: string) => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${month}/${year}`;
};

export default function InvoiceTemplate({ sale, settings, shopSettings, gstMode = 'inclusive' }: InvoiceTemplateProps) {
  const totals = useMemo(() => {
    if (gstMode === 'inclusive') {
      let grossTotal = 0;
      let gstTotal = 0;
      let grandTotal = 0;
      
      sale.saleItems.forEach(item => {
        const itemAmount = item.amount || ((item.rate || item.mrp) * item.quantity) - item.discount;
        grossTotal += (item.rate || item.mrp) * item.quantity;
        grandTotal += itemAmount;
        gstTotal += item.gst;
      });

      return {
        grossTotal,
        discountTotal: sale.discountTotal,
        gstTotal,
        taxableValue: grandTotal - gstTotal,
        grandTotal,
        cgst: gstTotal / 2,
        sgst: gstTotal / 2,
        isInclusive: true,
      };
    } else {
      const cgst = sale.gstTotal / 2;
      const sgst = sale.gstTotal / 2;
      return {
        grossTotal: sale.subtotal,
        subtotal: sale.subtotal,
        discountTotal: sale.discountTotal,
        gstTotal: sale.gstTotal,
        taxableValue: sale.subtotal - sale.discountTotal,
        grandTotal: sale.grandTotal,
        cgst,
        sgst,
        isInclusive: false,
      };
    }
  }, [sale, gstMode]);

  const customer = sale.customer || {
    name: 'Walk-in Customer',
    phone: '',
    address: '',
  };
  const customerAddress = customer.address?.trim() || '';
  const customerPhone = customer.phone?.trim() || '';
  const shouldShowAddress = customerAddress && customerAddress.toLowerCase() !== 'walk-in';
  const shouldShowPhone = customerPhone && !/^0+$/.test(customerPhone);

  return (
    <>
      {/* 
        CRITICAL PRINT CSS
        Forces backgrounds, borders, and rounded corners to perfectly render when printed 
      */}
      <style dangerouslySetInnerHTML={{ __html: `
        @page {
          size: A4 portrait;
          margin: 10mm;
        }
        @media print {
          body * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          /* Hide standard layout wrappers */
          .print-hidden, header, nav, aside {
            display: none !important;
          }
          /* Standardize paper constraints to fit A4 flawlessly */
          .invoice-container {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 24px !important;
            box-shadow: none !important;
            border: 1px solid #e2e8f0 !important; /* Force border */
            border-radius: 12px !important;       /* Force radius */
          }
          /* Ensure text reads crisp */
          * {
            font-size: 12px;
          }
          .force-print-bg {
            background-color: #f8fafc !important;
          }
          .force-print-border {
            border: 1px solid #e2e8f0 !important;
            border-radius: 12px !important;
          }
        }
      `}} />

      <div className="invoice-container relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 md:p-8 shadow-sm">
        {settings.watermarkEnabled && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 -z-0 -translate-x-1/2 -translate-y-1/2 text-center opacity-10">
            <div className="text-4xl md:text-6xl font-black whitespace-pre-line text-slate-500 tracking-widest uppercase rotate-[-30deg]">
              {(settings.watermarkText || shopSettings.shopName)}
            </div>
          </div>
        )}

        <div className="relative z-10 space-y-5 md:space-y-6 flex flex-col items-stretch justify-start">
          <div className="text-center w-full pb-2">
            <h2 className="text-lg md:text-xl font-bold uppercase tracking-[0.25em] text-slate-800">Tax Invoice</h2>
          </div>
          <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 md:pb-6 md:flex-row print:flex-row md:items-start print:items-start md:justify-between print:justify-between">
            <div className="space-y-1">
              <div className="text-xl md:text-2xl font-bold uppercase tracking-wide text-slate-900">
                {shopSettings.shopName}
              </div>
              <div className="text-xs md:text-sm text-slate-600">
                <div>{shopSettings.addressLine1}</div>
                {shopSettings.addressLine2 && <div>{shopSettings.addressLine2}</div>}
              </div>
              <div className="text-xs md:text-sm text-slate-600 mt-2">
                <div>Phone: {shopSettings.phone}</div>
                {shopSettings.email && shopSettings.email !== 'shop@email.com' && (
                  <div>Email: {shopSettings.email}</div>
                )}
              </div>
              {shopSettings.gstin && (
                <div className="text-xs md:text-sm font-semibold text-slate-700 mt-1">
                  GSTIN: {shopSettings.gstin}
                </div>
              )}
            </div>

            <div className="min-w-[220px] rounded-xl border border-slate-200 bg-slate-50 force-print-bg force-print-border p-4 text-xs md:text-sm text-slate-700">
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
                <span className="font-semibold text-slate-800">{sale.paymentMode}</span>
              </div>
            </div>
          </div>

          <section className="grid gap-4 md:grid-cols-2 print:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white force-print-border p-4 text-sm">
              <div className="text-[10px] md:text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Bill To</div>
              <div className="mt-2 md:mt-3 space-y-1 text-slate-700 text-xs md:text-sm">
                <div className="font-bold text-slate-900">{customer.name}</div>
                {shouldShowAddress && <div>{customerAddress}</div>}
                {shouldShowPhone && <div>Phone: {customerPhone}</div>}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white force-print-border p-4 text-sm">
              <div className="text-[10px] md:text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Invoice Details</div>
              <div className="mt-2 md:mt-3 space-y-1 text-slate-700 text-xs md:text-sm">
                <div>Invoice Type: GST</div>
                <div>Total Items: {sale.saleItems.length}</div>
              </div>
            </div>
          </section>

          <section>
            <div className="overflow-x-auto rounded-xl border border-slate-200 force-print-border">
              <table className="w-full border-collapse text-left text-xs md:text-sm">
                <thead className="bg-slate-100 force-print-bg text-[10px] md:text-[11px] uppercase tracking-widest text-slate-700 border-b-2 border-slate-300">
                  <tr>
                    <th className="px-2 md:px-3 py-2 md:py-3 whitespace-nowrap">S.No</th>
                    <th className="px-2 md:px-3 py-2 md:py-3 whitespace-nowrap">Product</th>
                    <th className="px-2 md:px-3 py-2 md:py-3 whitespace-nowrap">Batch</th>
                    <th className="px-2 md:px-3 py-2 md:py-3 whitespace-nowrap">Exp</th>
                    <th className="px-2 md:px-3 py-2 md:py-3 whitespace-nowrap">HSN</th>
                    <th className="px-2 md:px-3 py-2 md:py-3 text-right whitespace-nowrap">MRP</th>
                    <th className="px-2 md:px-3 py-2 md:py-3 text-right whitespace-nowrap">Qty</th>
                    <th className="px-2 md:px-3 py-2 md:py-3 text-right whitespace-nowrap">Rate</th>
                    <th className="px-2 md:px-3 py-2 md:py-3 text-right whitespace-nowrap">Disc</th>
                    <th className="px-2 md:px-3 py-2 md:py-3 text-right whitespace-nowrap">GST</th>
                    <th className="px-2 md:px-3 py-2 md:py-3 text-right whitespace-nowrap">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.saleItems.map((item, index) => {
                    let itemAmount = item.amount;

                    if (gstMode === 'inclusive') {
                      itemAmount = item.amount || ((item.rate || item.mrp) * item.quantity) - item.discount;
                    } else {
                      const afterDiscount = (item.rate * item.quantity) - item.discount;
                      itemAmount = afterDiscount + item.gst;
                    }

                    return (
                      <tr key={item.id} className="border-t border-slate-100 text-slate-700 text-[11px] md:text-sm">
                        <td className="px-2 md:px-3 py-2 md:py-3">{index + 1}</td>
                        <td className="px-2 md:px-3 py-2 md:py-3 font-semibold text-slate-900 max-w-[120px] truncate">{item.medicine.name}</td>
                        <td className="px-2 md:px-3 py-2 md:py-3">{item.batch.batchNumber}</td>
                        <td className="px-2 md:px-3 py-2 md:py-3">{formatExpiry(item.batch.expiryDate)}</td>
                        <td className="px-2 md:px-3 py-2 md:py-3">{item.medicine.hsn}</td>
                        <td className="px-2 md:px-3 py-2 md:py-3 text-right">{item.mrp.toFixed(2)}</td>
                        <td className="px-2 md:px-3 py-2 md:py-3 text-right">{item.quantity}</td>
                        <td className="px-2 md:px-3 py-2 md:py-3 text-right">{item.rate.toFixed(2)}</td>
                        <td className="px-2 md:px-3 py-2 md:py-3 text-right">{item.discount.toFixed(2)}</td>
                        <td className="px-2 md:px-3 py-2 md:py-3 text-right">{item.gstPercent}%</td>
                        <td className="px-2 md:px-3 py-2 md:py-3 text-right font-bold text-slate-900">
                          {itemAmount.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="flex flex-col items-end gap-3 border-t border-slate-200 pt-4 text-xs md:text-sm">
            <div className="w-full max-w-sm space-y-2 text-slate-700">
              <div className="flex justify-between">
                <span>{totals.isInclusive ? 'MRP Total' : 'Subtotal'}</span>
                <span>{formatCurrency(totals.grossTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Discount</span>
                <span>-{formatCurrency(totals.discountTotal)}</span>
              </div>
              {totals.isInclusive && (
                <div className="flex justify-between font-semibold text-slate-900">
                  <span>Subtotal (Incl. GST)</span>
                  <span>{formatCurrency(totals.grandTotal)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Taxable Value</span>
                <span>{formatCurrency(totals.taxableValue)}</span>
              </div>
              <div className="flex justify-between">
                <span>CGST{totals.isInclusive ? ' (Included)' : ''}</span>
                <span>{formatCurrency(totals.cgst)}</span>
              </div>
              <div className="flex justify-between">
                <span>SGST{totals.isInclusive ? ' (Included)' : ''}</span>
                <span>{formatCurrency(totals.sgst)}</span>
              </div>
              <div className="flex justify-between border-t border-dashed border-slate-300 pt-2 text-sm md:text-base font-bold text-slate-900">
                <span>Grand Total</span>
                <span>{formatCurrency(totals.grandTotal)}</span>
              </div>
            </div>
          </section>

          <div className="grid gap-6 border-t border-slate-200 pt-6 text-xs md:text-sm text-slate-600 md:grid-cols-2 print:grid-cols-2 mt-auto">
            <div>
              <div className="text-[10px] md:text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Authorized Signature
              </div>
              <div className="mt-8 h-10 w-48 border-b border-slate-400" />
            </div>
            <div className="flex flex-col items-start justify-end gap-2 md:items-end print:items-end">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 force-print-bg px-4 py-3 text-xs md:text-sm font-semibold text-emerald-700 text-center">
                Thank you for shopping with us!
              </div>
              <div className="text-[10px] md:text-xs text-slate-400 italic">Computer generated invoice</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
