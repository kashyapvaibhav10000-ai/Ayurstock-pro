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
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const receivedAmountRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  // Barcode scanner detection
  const barcodeBufferRef = useRef<string>('');
  const barcodeLastKeyTimeRef = useRef<number>(0);
  const [scannerActive, setScannerActive] = useState(false);

  useEffect(() => {
    setOrderId(`#POS-${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`);
  }, []);

  // Load from local storage on mount
  useEffect(() => {
    setMounted(true);
    try {
      const savedCart = localStorage.getItem('pos_cart');
      if (savedCart) {
        setCart(JSON.parse(savedCart).map((item: any) => ({
          ...item,
          expiryDate: new Date(item.expiryDate)
        })));
      }
      
      const savedSaleType = localStorage.getItem('pos_saleType');
      if (savedSaleType) setSaleType(savedSaleType as 'RETAIL' | 'WHOLESALE');
      
      const savedCustomerName = localStorage.getItem('pos_customerName');
      if (savedCustomerName) setCustomerName(savedCustomerName);

      const savedCustomerPhone = localStorage.getItem('pos_customerPhone');
      if (savedCustomerPhone) setCustomerPhone(savedCustomerPhone);

      const savedCustomerAddress = localStorage.getItem('pos_customerAddress');
      if (savedCustomerAddress) setCustomerAddress(savedCustomerAddress);
    } catch (error) {
      console.error('Failed to parse POS local storage', error);
    }
  }, []);

  // Save to local storage when state changes
  useEffect(() => {
    if (mounted) {
      localStorage.setItem('pos_cart', JSON.stringify(cart));
      localStorage.setItem('pos_saleType', saleType);
      localStorage.setItem('pos_customerName', customerName);
      localStorage.setItem('pos_customerPhone', customerPhone);
      localStorage.setItem('pos_customerAddress', customerAddress);
    }
  }, [mounted, cart, saleType, customerName, customerPhone, customerAddress]);

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
    
    // Clear localStorage
    localStorage.removeItem('pos_cart');
    localStorage.removeItem('pos_customerName');
    localStorage.removeItem('pos_customerPhone');
    localStorage.removeItem('pos_customerAddress');
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

  // Barcode scanner: auto-add when scanner fires rapid keystrokes ending with Enter
  const handleBarcodeInput = useCallback(async (barcode: string) => {
    setScannerActive(true);
    setTimeout(() => setScannerActive(false), 800);
    try {
      const response = await axios.get('/api/billing/search', {
        params: { q: barcode.trim(), limit: 5 },
      });
      if (response.data.success) {
        const results: BillingSuggestion[] = response.data.data || [];
        const exact = results.find(
          (r) => r.barcode === barcode.trim() || r.batchNumber === barcode.trim()
        ) || (results.length === 1 ? results[0] : null);
        if (exact) {
          addSuggestionToCart(exact);
          toast.success(`✓ Scanned: ${exact.name}`);
        } else if (results.length > 1) {
          setSearchQuery(barcode.trim());
          setSuggestions(results);
          searchInputRef.current?.focus();
        } else {
          toast.error(`No match found for barcode: ${barcode.trim()}`);
        }
      }
    } catch {
      toast.error('Barcode scan failed');
    }
  }, [addSuggestionToCart]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement)?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      // ── Barcode scanner detection ───────────────────────────────
      // Scanners send chars very fast (<80ms apart) then Enter
      const now = Date.now();
      const timeSinceLast = now - barcodeLastKeyTimeRef.current;
      barcodeLastKeyTimeRef.current = now;

      if (event.key === 'Enter' && barcodeBufferRef.current.length >= 4 && timeSinceLast < 100) {
        // This looks like a scanner — process the buffer
        const scanned = barcodeBufferRef.current;
        barcodeBufferRef.current = '';
        event.preventDefault();
        handleBarcodeInput(scanned);
        return;
      }

      if (event.key.length === 1 && timeSinceLast < 80) {
        barcodeBufferRef.current += event.key;
      } else if (event.key !== 'Enter') {
        // Gap too long — reset buffer (human typing)
        barcodeBufferRef.current = event.key.length === 1 ? event.key : '';
      }
      // ────────────────────────────────────────────────────────────

      if (event.key === 'F12') {
        event.preventDefault();
        if (!loading) handleCheckout();
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
        setSearchQuery('');
        setSuggestions([]);
        searchInputRef.current?.focus();
        return;
      }

      // Auto-focus search on alphanumeric when not in an input
      if (!isInput && !event.metaKey && !event.ctrlKey && !event.altKey && event.key.length === 1 && /[a-zA-Z0-9]/.test(event.key)) {
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCheckout, handleBarcodeInput, loading, resetBill]);

  return (
    <div className="grid grid-cols-1 gap-4 p-4 md:gap-6 md:p-6 xl:grid-cols-[1.1fr_1fr_400px] xl:min-h-[calc(100vh-96px)] bg-background">
      {/* Search Section */}
      <section className="flex flex-col xl:h-full rounded-2xl border border-border bg-surface p-5 md:p-6 shadow-bento relative overflow-hidden">
        <div className="mb-6 flex flex-col md:flex-row md:items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-primary/80">
              Inventory Search
            </div>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-foreground">Find Medicine</h2>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground select-none">
            <kbd className="rounded-lg border border-border bg-surface-muted/50 px-2 py-1 text-[10px] font-black shadow-sm text-foreground">Esc</kbd> clear search
          </div>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground transition-colors peer-focus:text-primary" />
          <input
            type="text"
            placeholder="Search by Name or Barcode..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            ref={searchInputRef}
            className="peer w-full rounded-[20px] border-2 border-border bg-background px-14 py-4 md:py-[18px] text-base outline-none transition-all placeholder:text-muted-foreground/30 focus:border-primary focus:bg-surface/50 focus:ring-4 focus:ring-primary/10 font-bold text-foreground shadow-sm hover:border-primary/40"
            autoFocus
          />
          <ScanLine className={`absolute right-5 top-1/2 h-5 w-5 -translate-y-1/2 transition-all duration-200 ${scannerActive ? 'text-primary scale-125 animate-pulse' : 'text-primary/40 peer-focus:text-primary/80'}`} />
          
          {suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-[calc(100%+12px)] z-40 mt-1 overflow-hidden rounded-[20px] border border-border bg-surface shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150">
              {suggestions.map((suggestion, index) => (
                <button
                  key={`${suggestion.batchId}-${index}`}
                  onClick={() => addSuggestionToCart(suggestion)}
                  className={`flex w-full items-center justify-between border-b border-surface-muted px-6 py-[18px] text-left transition-colors last:border-b-0 ${
                    index === activeSuggestionIndex ? 'bg-primary/5' : 'hover:bg-surface-muted/50'
                  }`}
                >
                  <div className="flex-1 pr-4">
                    <div className="text-sm font-black text-foreground leading-tight">{suggestion.name}</div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mt-1.5 flex items-center gap-2 flex-wrap">
                      <span className="text-muted-foreground">{suggestion.company}</span>
                      {suggestion.rackLocation && (
                        <span className="bg-surface-muted/50 px-1.5 rounded py-0.5 border border-border text-muted-foreground">RACK: {suggestion.rackLocation}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end">
                    <div className="font-black text-primary text-[17px]">₹{suggestion.mrp.toFixed(2)}</div>
                    <div className="flex items-center justify-end gap-1.5 mt-1.5">
                      <span className="rounded-[6px] bg-surface-muted/50 border border-border px-1.5 py-0.5 text-[9px] font-black tracking-widest text-muted-foreground uppercase">B:{suggestion.batchNumber}</span>
                      <span className="rounded-[6px] bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[9px] font-black tracking-widest text-primary uppercase shadow-[0_0_5px_rgba(212,175,55,0.2)]">Q:{suggestion.stockQty}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-8 hidden xl:block mb-2">
          <div className="rounded-[20px] border border-primary/10 bg-primary/[0.03] px-5 py-5 text-[10px] font-black tracking-widest text-primary/80 uppercase">
            <div className="flex items-center gap-6 justify-center">
              <span className="flex items-center gap-2"><div className="flex gap-1"><kbd className="rounded-[6px] bg-surface/50 px-2 pt-0.5 pb-1 text-[10px] font-black border border-primary/20 shadow-sm text-primary/80">&darr;</kbd> <kbd className="rounded-[6px] bg-surface/50 px-2 pt-0.5 pb-1 text-[10px] font-black border border-primary/20 shadow-sm text-primary/80">&uarr;</kbd></div> Navigate</span>
              <span className="flex items-center gap-2"><kbd className="rounded-[6px] bg-surface/50 px-2.5 pt-0.5 pb-1 text-[10px] font-black border border-primary/20 shadow-sm text-primary/80">Enter</kbd> Add item</span>
              <span className="flex items-center gap-2"><kbd className="rounded-[6px] bg-surface/50 px-2.5 pt-0.5 pb-1 text-[10px] font-black border border-primary/20 shadow-sm text-primary/80">F12</kbd> Checkout</span>
            </div>
          </div>
        </div>
      </section>

      {/* Cart Section */}
      <section className="flex flex-col xl:h-full rounded-2xl border border-border bg-surface shadow-bento overflow-hidden">
        <div className="flex flex-wrap items-center justify-between border-b border-border bg-surface-muted/30 px-6 py-5 gap-4">
          <div>
            <div className="text-xl font-black tracking-tight text-foreground">Current Cart</div>
            <div className="mt-1 flex items-center gap-3">
              <span className="rounded-lg bg-background shadow-sm border border-border px-2.5 pt-0.5 pb-1 text-[10px] font-black tracking-widest text-muted-foreground uppercase">{orderId}</span>
              <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">• {cart.length} items</span>
            </div>
          </div>
          <div className="flex items-center rounded-xl border border-border overflow-hidden bg-surface shadow-sm">
            {(['RETAIL', 'WHOLESALE'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setSaleType(mode)}
                className={`px-4 py-2.5 text-[10px] font-black tracking-[0.2em] uppercase transition-all ${
                  saleType === mode
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-muted-foreground hover:bg-surface-muted hover:text-foreground'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 overflow-auto p-4 md:p-6 xl:flex-1 bg-background/50 max-h-[60vh] xl:max-h-none">
          {cart.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center space-y-6 py-16">
              <div className="relative flex h-24 w-24 items-center justify-center rounded-[32px] bg-surface shadow-soft border border-border rotate-3 transition-transform hover:rotate-6">
                <Search className="h-10 w-10 text-muted-foreground/30" />
                <div className="absolute -bottom-3 -right-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-background shadow-lg -rotate-12">
                  <span className="font-black text-2xl leading-none mt-0.5">+</span>
                </div>
              </div>
              <div className="space-y-1">
                <div className="font-black text-foreground text-lg tracking-tight uppercase">Cart is Empty.</div>
                <p className="max-w-[220px] text-[11px] font-bold text-muted-foreground mx-auto leading-relaxed uppercase tracking-wider">Search for medicines or scan barcodes to begin billing.</p>
              </div>
            </div>
          ) : (
            cart.map((item, index) => (
              <div key={`${item.batchId}-${index}`} className="group relative rounded-2xl border border-border bg-surface p-5 shadow-soft transition-all hover:border-primary/40 hover:shadow-bento animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="font-black text-foreground text-[15px] leading-tight pr-8">{item.medicineName}</div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                      <span className="rounded-md bg-surface-muted/50 px-2 py-0.5 border border-border text-foreground">B: {item.batchNumber}</span>
                      <span className="rounded-md bg-danger/10 text-danger border border-danger/20 px-2 py-0.5">Exp: {new Date(item.expiryDate).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}</span>
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 border border-primary/20 text-primary uppercase shadow-[0_0_5px_rgba(212,175,55,0.1)]">₹{item.rate.toFixed(2)}/u</span>
                    </div>
                  </div>
                  <button
                    onClick={() => removeFromCart(index)}
                    className="absolute right-5 top-5 opacity-100 xl:opacity-0 xl:group-hover:opacity-100 rounded-xl bg-surface border border-border p-2 text-muted-foreground transition-all hover:bg-danger/10 hover:text-danger hover:border-danger/20 hover:shadow-sm"
                    title="Remove Item"
                  >
                    <Trash2 className="h-[18px] w-[18px]" />
                  </button>
                </div>
                
                <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
                  <div className="flex items-center overflow-hidden rounded-[14px] border border-border bg-surface-muted/50 shadow-inner">
                    <button
                      onClick={() => updateCartItemQuantity(index, item.quantity - 1)}
                      className="px-4 py-2 text-muted-foreground hover:bg-surface hover:text-primary transition-all font-black text-lg active:bg-primary/10"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateCartItemQuantity(index, parseInt(e.target.value, 10) || 1)}
                      className="w-12 border-x border-border bg-surface p-0 text-center text-[15px] font-black text-foreground focus:outline-none focus:ring-0"
                    />
                    <button
                      onClick={() => updateCartItemQuantity(index, item.quantity + 1)}
                      className="px-4 py-2 text-muted-foreground hover:bg-surface hover:text-primary transition-all font-black text-lg active:bg-primary/10"
                    >
                      +
                    </button>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground mb-0.5">Item Total</div>
                    <div className="font-black text-[19px] text-foreground tracking-tight">₹{item.amount.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Summary / Payment Section */}
      <aside className="flex flex-col xl:h-full rounded-2xl border border-border bg-surface shadow-bento overflow-hidden">
        <div className="border-b border-border bg-surface-muted/30 p-6">
          <h2 className="text-xl font-black tracking-tight text-foreground uppercase">Checkout</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-7">
          <div className="space-y-3.5 text-sm font-black uppercase tracking-widest">
            <div className="flex justify-between text-muted-foreground">
              <span className="tracking-widest">Subtotal</span>
              <span className="text-foreground">₹{totals.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span className="tracking-widest">Discount</span>
              <span className="text-primary">-₹{totals.discountTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span className="tracking-widest">GST Amount</span>
              <span className="text-foreground">₹{totals.gstTotal.toFixed(2)}</span>
            </div>
            <div className="flex flex-col justify-between rounded-[24px] bg-primary/10 p-6 pt-5 mt-5 border-[2px] border-primary/30 shadow-soft relative overflow-hidden">
              <div className="absolute right-0 top-0 opacity-[0.05] scale-150 -translate-y-4 translate-x-4">
                <ScanLine className="w-32 h-32 text-primary" />
              </div>
              <span className="font-black text-primary text-[10px] tracking-[0.3em] uppercase mb-1 relative z-10">Grand Total</span>
              <span className="text-4xl md:text-5xl font-black text-primary tracking-tighter relative z-10 drop-shadow-[0_0_10px_rgba(212,175,55,0.4)]">₹{totals.grandTotal.toFixed(2)}</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Payment Mode</div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {(['CASH', 'CARD', 'UPI', 'CREDIT'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setPaymentMode(mode)}
                  className={`rounded-xl px-4 py-3.5 text-[11px] font-black tracking-widest transition-all duration-200 border shadow-sm ${
                    paymentMode === mode
                      ? 'bg-primary border-primary text-background shadow-primary/30 ring-4 ring-primary/10'
                      : 'border-border bg-surface text-muted-foreground hover:bg-surface-muted hover:text-foreground hover:border-border hover:shadow-md'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Customer Details</div>
            </div>
            <div className="space-y-2.5">
              <input
                type="text"
                placeholder="Name (Optional)"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full rounded-[14px] border-2 border-border bg-background px-4 py-[14px] text-sm font-black shadow-inner focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all placeholder:text-muted-foreground/20 text-foreground uppercase tracking-widest"
              />
              <input
                type="text"
                placeholder="Phone / ID (Optional)"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full rounded-[14px] border-2 border-border bg-background px-4 py-[14px] text-sm font-bold shadow-sm focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all placeholder:text-muted-foreground/60 text-foreground"
              />
            </div>
          </div>

          {paymentMode === 'CASH' && (
            <div className="space-y-3 pt-5 border-t border-border">
              <label className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground px-1">
                <span>Cash Received</span>
                <kbd className="rounded-[4px] bg-surface-muted/50 border border-border px-1.5 pt-0.5 pb-1 text-[9px] shadow-sm text-foreground">F7</kbd>
              </label>
              <div className="relative">
                <span className="absolute left-5 top-1/2 -translate-y-1/2 font-black text-muted-foreground/40 text-xl">₹</span>
                <input
                  type="number"
                  value={receivedAmount || ''}
                  onChange={(e) => setReceivedAmount(parseFloat(e.target.value) || 0)}
                  ref={receivedAmountRef}
                  placeholder="0.00"
                  className="w-full rounded-[20px] border-2 border-border bg-background pl-10 pr-5 py-4 text-left text-2xl font-black shadow-inner focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all placeholder:text-muted-foreground/20 text-foreground"
                />
              </div>
              <div
                className={`rounded-[16px] px-5 py-4 text-center transition-all shadow-sm border ${
                  balance >= 0 
                    ? 'bg-primary/10 text-primary border-primary/20 shadow-primary/5' 
                    : 'bg-danger/10 text-danger border-danger/20 shadow-danger/5'
                }`}
              >
                <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-0.5">Change to Return</div>
                <div className="text-xl font-black tracking-tight">₹{balance.toFixed(2)}</div>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 bg-surface-muted/30 border-t border-border mt-auto">
          <button
            onClick={handleCheckout}
            disabled={cart.length === 0 || loading}
            className={`group relative w-full overflow-hidden rounded-[20px] px-4 py-[22px] font-black tracking-[0.25em] text-background transition-all duration-300 shadow-xl active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:scale-100 disabled:hover:translate-y-0 ${
              loading 
                ? 'bg-primary/80' 
                : cart.length > 0
                  ? 'bg-primary hover:bg-primary/90 hover:shadow-primary/30 hover:-translate-y-1'
                  : 'bg-surface-muted border border-border text-muted-foreground shadow-none'
            }`}
          >
            {cart.length > 0 && !loading && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-[100%] animate-[shimmer_2s_infinite]"></div>
            )}
            <span className="relative z-10 flex items-center justify-center gap-3">
              {loading ? (
                <>PROCESSING...</>
              ) : (
                <>
                  GENERATE INVOICE <kbd className="hidden sm:inline-block ml-1 rounded-[6px] bg-black/20 border border-black/10 px-2 pt-1 pb-1.5 text-[10px] text-background shadow-sm leading-none opacity-90">F12</kbd>
                </>
              )}
            </span>
          </button>
        </div>
      </aside>
    </div>
  );
}
