'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { Search, ScanLine, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CartItem } from '@/types';

interface BillingSuggestion {
  id: string;
  batchId: string;
  medicineId: string;
  name: string;
  company: string;
  barcode?: string;
  gstPercent: number;
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
      toast.error('This batch is expired and cannot be billed.');
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
      gstPercent: suggestion.gstPercent ?? 0,
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
        phone: customerPhone.trim() || '',
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
        toast.warning('Sale created but invoice preview failed to load.');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      toast.error('Failed to create sale');
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
    <div className="grid min-h-[calc(100vh-96px)] grid-cols-1 gap-6 p-6 xl:grid-cols-[1.15fr_1fr_360px] bg-background">
      {/* Search Section */}
      <section className="flex flex-col h-full rounded-[24px] border border-surface-border bg-surface p-6 shadow-soft transition-shadow hover:shadow-bento">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.22em] text-primary">
              Search Inventory
            </div>
            <p className="mt-1 text-sm text-text-secondary tracking-wide">Scan barcode or search by name to add items.</p>
          </div>
          <div className="rounded-xl bg-surface-muted px-3 py-2 text-xs font-bold text-text-secondary">
            Esc to Clear
          </div>
        </div>

        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search Medicine (Name / Barcode)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            ref={searchInputRef}
            className="w-full rounded-2xl border border-surface-border bg-surface-muted px-14 py-4 text-sm outline-none transition-all focus:border-primary focus:bg-surface focus:ring-4 focus:ring-primary/10 font-medium text-text-primary"
            autoFocus
          />
          <ScanLine className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted" />
          
          {suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 mt-2 overflow-hidden rounded-[20px] border border-surface-border bg-surface shadow-elevated">
              {suggestions.map((suggestion, index) => (
                <button
                  key={`${suggestion.batchId}-${index}`}
                  onClick={() => addSuggestionToCart(suggestion)}
                  className={`flex w-full flex-col gap-1 border-b border-surface-muted px-5 py-4 text-left transition-colors last:border-b-0 ${
                    index === activeSuggestionIndex ? 'bg-primary/5' : 'hover:bg-surface-muted'
                  }`}
                >
                  <div className="text-sm font-bold text-text-primary">{suggestion.name}</div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-text-secondary font-medium">
                    <span className="bg-surface-muted px-2 py-0.5 rounded-md">Batch {suggestion.batchNumber}</span>
                    <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-md">Stock: {suggestion.stockQty}</span>
                    <span className="font-bold text-text-primary">MRP: ₹{suggestion.mrp.toFixed(2)}</span>
                  </div>
                  <div className="text-xs text-text-muted mt-1 uppercase tracking-wider">
                    {suggestion.company} {suggestion.rackLocation ? `• Rack ${suggestion.rackLocation}` : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-auto pt-6">
          <div className="rounded-2xl bg-surface-muted px-4 py-3 text-xs text-text-secondary font-medium text-center">
            Shortcuts: <span className="font-bold text-text-primary">Arrow keys</span> navigate,
            <span className="ml-1 font-bold text-text-primary">Enter</span> adds item,
            <span className="ml-1 font-bold text-text-primary">F12</span> checkout.
          </div>
        </div>
      </section>

      {/* Cart Section */}
      <section className="flex flex-col h-full rounded-[24px] border border-surface-border bg-surface shadow-soft transition-shadow hover:shadow-bento overflow-hidden">
        <div className="flex items-center justify-between border-b border-surface-border px-6 py-5 bg-surface-muted/30">
          <div>
            <div className="text-lg font-extrabold tracking-tight text-text-primary">Bill Cart</div>
            <div className="text-xs font-semibold uppercase tracking-wider text-text-secondary mt-1">
              Order: {orderId} • {cart.length} items
            </div>
          </div>
          <div className="rounded-xl bg-primary/10 px-4 py-2 text-xs font-bold tracking-widest text-primary uppercase">
            {saleType}
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-auto p-6 bg-[#fcfcfc]">
          {cart.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-sm text-text-muted space-y-4">
              <div className="h-16 w-16 bg-surface-muted rounded-full flex items-center justify-center">
                <Search className="h-8 w-8 text-text-secondary opacity-50" />
              </div>
              <p className="max-w-[200px] leading-relaxed">Your cart is empty. Scan an item or search to begin.</p>
            </div>
          ) : (
            cart.map((item, index) => (
              <div key={`${item.batchId}-${index}`} className="group relative rounded-2xl border border-surface-border bg-surface p-4 shadow-sm transition-all hover:border-primary/30">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-bold text-text-primary text-base">{item.medicineName}</div>
                    <div className="mt-1 flex gap-2 text-xs font-semibold text-text-secondary">
                      <span className="bg-surface-muted px-2 py-0.5 rounded-md">B.No: {item.batchNumber}</span>
                      <span className="bg-danger-bg text-danger-text px-2 py-0.5 rounded-md">Exp: {new Date(item.expiryDate).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => removeFromCart(index)}
                    className="opacity-0 group-hover:opacity-100 rounded-xl border border-surface-border bg-surface p-2 text-text-muted transition-all hover:bg-danger-bg hover:text-danger hover:border-danger/30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                
                <div className="mt-5 flex items-center justify-between border-t border-surface-border pt-4">
                  <div className="flex items-center gap-1 bg-surface-muted rounded-xl p-1">
                    <button
                      onClick={() => updateCartItemQuantity(index, item.quantity - 1)}
                      className="h-8 w-8 rounded-lg bg-surface text-sm font-bold shadow-sm hover:text-primary transition-colors"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateCartItemQuantity(index, parseInt(e.target.value, 10) || 1)}
                      className="w-12 border-none bg-transparent px-1 py-1 text-center text-sm font-bold text-text-primary focus:outline-none"
                    />
                    <button
                      onClick={() => updateCartItemQuantity(index, item.quantity + 1)}
                      className="h-8 w-8 rounded-lg bg-surface text-sm font-bold shadow-sm hover:text-primary transition-colors"
                    >
                      +
                    </button>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Total</div>
                    <div className="font-extrabold text-lg text-text-primary">₹{item.amount.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-surface-border px-6 py-5 bg-surface-muted/30">
          <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-text-muted">Customer Link</div>
          <div className="mt-1.5 text-sm font-bold text-text-primary">{customerName}</div>
          <div className="text-xs font-medium text-text-secondary mt-0.5">
            {customerPhone ? `Ph: ${customerPhone}` : 'Standard Walk-in Guest'}
          </div>
        </div>
      </section>

      {/* Summary / Payment Section */}
      <aside className="flex flex-col h-full rounded-[24px] border border-surface-border bg-surface shadow-soft transition-shadow hover:shadow-bento overflow-hidden">
        <div className="p-6 pb-2 border-b border-surface-border bg-surface">
          <h2 className="text-lg font-extrabold tracking-tight text-text-primary">Payment Summary</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-surface">
          <div className="space-y-4 text-sm font-medium">
            <div className="flex justify-between text-text-secondary">
              <span>Subtotal</span>
              <span>₹{totals.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-text-secondary">
              <span>Discount</span>
              <span>-₹{totals.discountTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-text-secondary">
              <span>GST Amount</span>
              <span>₹{totals.gstTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between rounded-xl bg-surface-muted p-4 mt-2">
              <span className="font-bold text-text-primary text-base">Grand Total</span>
              <span className="text-xl font-extrabold text-primary">₹{totals.grandTotal.toFixed(2)}</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-text-muted">
              Payment Method
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(['CASH', 'CARD', 'UPI', 'CREDIT'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setPaymentMode(mode)}
                  className={`rounded-xl px-4 py-3 text-xs font-bold tracking-wider transition-all duration-200 border ${
                    paymentMode === mode
                      ? 'bg-primary border-primary text-white shadow-soft'
                      : 'border-surface-border bg-surface text-text-secondary hover:bg-surface-muted hover:text-text-primary hover:border-surface-border'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-text-muted">
              Customer Details
            </div>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Name (Optional)"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full rounded-xl border border-surface-border bg-surface-muted px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-surface transition-colors"
              />
              <input
                type="text"
                placeholder="Phone (Optional)"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full rounded-xl border border-surface-border bg-surface-muted px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-surface transition-colors"
              />
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-surface-border">
            <label className="block text-[10px] font-bold uppercase tracking-[0.22em] text-text-muted">
              Cash Received (₹)
            </label>
            <input
              type="number"
              value={receivedAmount || ''}
              onChange={(e) => setReceivedAmount(parseFloat(e.target.value) || 0)}
              ref={receivedAmountRef}
              placeholder="0.00"
              className="w-full rounded-xl border border-surface-border bg-surface-muted px-4 py-4 text-center text-xl font-extrabold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-surface transition-colors"
            />
            <div
              className={`rounded-xl px-4 py-3 text-center text-sm font-bold transition-colors ${
                balance >= 0 ? 'bg-success-bg text-success-text border border-success/20' : 'bg-danger-bg text-danger-text border border-danger/20'
              }`}
            >
              Change to Return: ₹{balance.toFixed(2)}
            </div>
          </div>
        </div>

        <div className="p-6 bg-surface-muted/30 border-t border-surface-border mt-auto">
          <button
            onClick={handleCheckout}
            disabled={cart.length === 0 || loading}
            className="w-full rounded-xl bg-primary px-4 py-4 text-sm font-bold tracking-wide text-white transition-all hover:bg-primary-hover hover:shadow-soft active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            {loading ? 'Processing...' : 'Complete Sale (F12)'}
          </button>
        </div>
      </aside>
    </div>
  );
}
