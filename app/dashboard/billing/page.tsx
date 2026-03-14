'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { Search, ScanLine, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { CartItem } from '@/types';

interface BillingSuggestion {
  id: string;
  batchId: string;
  medicineId: string;
  name: string;
  company: string;
  barcode?: string;
  batchNumber: string;
  stockQty: number;
  mrp: number;
  rate: number;
  rackLocation: string;
  expiryDate: string;
}

export default function BillingPage() {
  const router = useRouter();
  const [saleType, setSaleType] = useState<'RETAIL' | 'WHOLESALE'>('RETAIL');
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<BillingSuggestion[]>([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'CARD' | 'UPI' | 'CREDIT'>('CASH');
  const [receivedAmount, setReceivedAmount] = useState<number>(0);
  const [customerName, setCustomerName] = useState<string>('Walk-in Customer');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerAddress, setCustomerAddress] = useState<string>('');
  const [orderId, setOrderId] = useState<string>('');
  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const receivedAmountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setOrderId(`#POS-${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`);
  }, []);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!searchQuery.trim()) {
      setSuggestions([]);
      setActiveSuggestionIndex(0);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await axios.get('/api/billing/search', {
          params: { q: searchQuery, limit: 10 },
        });

        if (response.data.success) {
          setSuggestions(response.data.data);
          setActiveSuggestionIndex(0);
        }
      } catch (error) {
        console.error('Billing search failed:', error);
      }
    }, 300);
  }, [searchQuery]);

  const addSuggestionToCart = (suggestion: BillingSuggestion) => {
    const daysToExpiry = Math.ceil(
      (new Date(suggestion.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    if (daysToExpiry < 0) {
      alert('This batch is expired and cannot be billed.');
      return;
    }

    const newItem: CartItem = {
      medicineId: suggestion.medicineId,
      medicineName: suggestion.name,
      company: suggestion.company,
      quantity: 1,
      batchId: suggestion.batchId,
      batchNumber: suggestion.batchNumber,
      expiryDate: new Date(suggestion.expiryDate),
      mrp: suggestion.mrp,
      rate: suggestion.rate,
      discount: 0,
      gstPercent: saleType === 'RETAIL' ? 5 : 12,
      gst: 0,
      amount: 0,
      rackLocation: suggestion.rackLocation,
    };

    const afterDiscount = newItem.quantity * newItem.rate - newItem.discount;
    newItem.gst = Math.round(((afterDiscount * newItem.gstPercent) / 100) * 100) / 100;
    newItem.amount = afterDiscount + newItem.gst;

    setCart((current) => [...current, newItem]);
    setSearchQuery('');
    setSuggestions([]);
    setActiveSuggestionIndex(0);
  };

  const handleSearchKeyDown = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!suggestions.length) {
      if (event.key === 'Enter' && searchQuery.trim()) {
        event.preventDefault();
        try {
          const response = await axios.get('/api/billing/search', {
            params: { q: searchQuery.trim(), limit: 5 },
          });

          if (response.data.success) {
            const results: BillingSuggestion[] = response.data.data || [];
            const exactMatch = results.find(
              (item) =>
                item.barcode === searchQuery.trim() || item.batchNumber === searchQuery.trim()
            );

            if (exactMatch) {
              addSuggestionToCart(exactMatch);
              return;
            }
          }
        } catch (error) {
          console.error('Barcode lookup failed:', error);
        }
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSuggestionIndex((current) => (current + 1) % suggestions.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSuggestionIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      addSuggestionToCart(suggestions[activeSuggestionIndex]);
    }
  };

  const updateCartItemQuantity = (index: number, nextQuantity: number) => {
    setCart((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        const quantity = Math.max(1, nextQuantity);
        const afterDiscount = quantity * item.rate - item.discount;
        const gst = Math.round(((afterDiscount * item.gstPercent) / 100) * 100) / 100;

        return {
          ...item,
          quantity,
          gst,
          amount: afterDiscount + gst,
        };
      })
    );
  };

  const removeFromCart = (index: number) => {
    setCart((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const totals = useMemo(() => {
    const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.rate, 0);
    const discountTotal = cart.reduce((sum, item) => sum + item.discount, 0);
    const gstTotal = cart.reduce((sum, item) => sum + item.gst, 0);
    const grandTotal = subtotal - discountTotal + gstTotal;
    return { subtotal, discountTotal, gstTotal, grandTotal };
  }, [cart]);

  const balance = receivedAmount - totals.grandTotal;

  const resetBill = useCallback(() => {
    setCart([]);
    setReceivedAmount(0);
    setOrderId(`#POS-${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`);
    setCustomerName('Walk-in Customer');
    setCustomerPhone('');
    setCustomerAddress('');
  }, []);

  const handleCheckout = useCallback(async () => {
    if (cart.length === 0) {
      return;
    }

    setLoading(true);

    try {
      const normalizedCustomer = {
        name: customerName.trim() || 'Walk-in Customer',
        phone: customerPhone.trim() || '0000000000',
        address: customerAddress.trim() || 'Walk-in',
      };

      const response = await axios.post('/api/sales', {
        saleType,
        items: cart.map((item) => ({
          medicineId: item.medicineId,
          batchId: item.batchId,
          quantity: item.quantity,
          rate: item.rate,
          discount: item.discount,
          gstPercent: item.gstPercent,
        })),
        paymentMode,
        discountTotal: totals.discountTotal,
        customer: normalizedCustomer,
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to create sale');
      }

      const saleId = response.data.data?.id;
      resetBill();

      if (saleId) {
        router.push(`/dashboard/billing/invoice/${saleId}`);
      } else {
        alert('Sale created but invoice preview failed to load.');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Failed to create sale');
    } finally {
      setLoading(false);
    }
  }, [
    cart,
    saleType,
    paymentMode,
    totals.discountTotal,
    customerName,
    customerPhone,
    customerAddress,
    router,
    resetBill,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F12') {
        event.preventDefault();
        if (!loading) {
          handleCheckout();
        }
        return;
      }

      if (event.key === 'F1') {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (event.key === 'F7') {
        event.preventDefault();
        receivedAmountRef.current?.focus();
        return;
      }

      if (event.key === 'F2') {
        event.preventDefault();
        resetBill();
        searchInputRef.current?.focus();
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        resetBill();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCheckout, loading, resetBill]);

  return (
    <div className="grid min-h-[calc(100vh-96px)] grid-cols-1 gap-0 xl:grid-cols-[1.15fr_1fr_360px]">
      <section className="border-r border-slate-200 bg-white/80 p-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-600">
                Search Medicine
              </div>
              <p className="mt-1 text-sm text-slate-500">Search inventory by medicine name or barcode.</p>
            </div>
            <div className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600">
              300ms debounce
            </div>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search Medicine (Name / Barcode)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              ref={searchInputRef}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-12 py-4 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
              autoFocus
            />
            <ScanLine className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            {suggestions.length > 0 ? (
              <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={`${suggestion.batchId}-${index}`}
                    onClick={() => addSuggestionToCart(suggestion)}
                    className={`flex w-full flex-col gap-1 border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 ${
                      index === activeSuggestionIndex ? 'bg-emerald-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-sm font-semibold text-slate-900">{suggestion.name}</div>
                    <div className="text-xs text-slate-500">
                      Batch {suggestion.batchNumber} | Stock {suggestion.stockQty} | MRP Rs.{suggestion.mrp.toFixed(2)}
                    </div>
                    <div className="text-xs text-slate-400">
                      {suggestion.company} {suggestion.rackLocation ? `| Rack ${suggestion.rackLocation}` : ''}
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
            Shortcuts: <span className="font-semibold text-slate-700">Arrow keys</span> navigate suggestions,
            <span className="ml-1 font-semibold text-slate-700">Enter</span> adds selected medicine instantly.
          </div>
        </div>
      </section>

      <section className="border-r border-slate-200 bg-white/50 p-6">
        <div className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <div className="text-lg font-semibold text-slate-900">Bill Cart</div>
              <div className="text-xs text-slate-500">
                {orderId} | {cart.length} items
              </div>
            </div>
            <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
              {saleType}
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-auto p-5">
            {cart.length === 0 ? (
              <div className="flex h-full items-center justify-center text-center text-sm text-slate-400">
                Start typing a medicine name to add the first item.
              </div>
            ) : (
              cart.map((item, index) => (
                <div key={`${item.batchId}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-semibold text-slate-900">{item.medicineName}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        Batch {item.batchNumber} | Exp {new Date(item.expiryDate).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => removeFromCart(index)}
                      className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <button
                      onClick={() => updateCartItemQuantity(index, item.quantity - 1)}
                      className="h-8 w-8 rounded-xl border border-slate-200 bg-white text-sm font-semibold"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateCartItemQuantity(index, parseInt(e.target.value, 10) || 1)}
                      className="w-16 rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-sm"
                    />
                    <button
                      onClick={() => updateCartItemQuantity(index, item.quantity + 1)}
                      className="h-8 w-8 rounded-xl border border-slate-200 bg-white text-sm font-semibold"
                    >
                      +
                    </button>
                    <div className="ml-auto text-right">
                      <div className="text-xs text-slate-500">Amount</div>
                      <div className="font-semibold text-slate-900">Rs.{item.amount.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-slate-200 px-5 py-4">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Customer</div>
            <div className="mt-2 text-sm font-medium text-slate-700">{customerName}</div>
            <div className="text-xs text-slate-500">
              {customerPhone ? `Phone ${customerPhone}` : 'Walk-in billing'}
            </div>
          </div>
        </div>
      </section>

      <aside className="bg-slate-50/70 p-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Summary</h2>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>Rs.{totals.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Discount</span>
              <span>-Rs.{totals.discountTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>GST</span>
              <span>Rs.{totals.gstTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-semibold text-slate-900">
              <span>Total</span>
              <span className="text-emerald-700">Rs.{totals.grandTotal.toFixed(2)}</span>
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
              Payment
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(['CASH', 'CARD', 'UPI', 'CREDIT'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setPaymentMode(mode)}
                  className={`rounded-2xl px-4 py-3 text-xs font-semibold transition ${
                    paymentMode === mode
                      ? 'bg-emerald-600 text-white'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
              Customer Details
            </div>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Customer Name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
              />
              <input
                type="text"
                placeholder="Phone Number"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
              />
              <input
                type="text"
                placeholder="Address"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
              />
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Leave phone or address blank to default to walk-in customer values.
            </div>
          </div>

          <div className="mt-6">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
              Received Amount
            </label>
            <input
              type="number"
              value={receivedAmount}
              onChange={(e) => setReceivedAmount(parseFloat(e.target.value) || 0)}
              ref={receivedAmountRef}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
            />
            <div
              className={`mt-3 rounded-2xl px-4 py-3 text-center text-sm font-semibold ${
                balance >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
              }`}
            >
              Balance Rs.{balance.toFixed(2)}
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <button
              onClick={handleCheckout}
              disabled={cart.length === 0 || loading}
              className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Processing Invoice...' : 'Generate Invoice (F12)'}
            </button>
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
              Inventory-backed FEFO search is active. Only batches with stock are suggested.
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
