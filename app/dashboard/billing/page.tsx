'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { Search, ScanLine, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CartItem } from '@/types';
import ItemDetailPopup, { ItemDetailSuggestion } from '@/components/billing/ItemDetailPopup';

const GST_OPTIONS = [
  { value: 5, label: '5%', category: 'Standard' },
  { value: 12, label: '12%', category: 'Proprietary' },
  { value: 18, label: '18%', category: 'Cosmetic' },
];

interface BillingSuggestion {
  id: string;
  batchId: string;
  medicineId: string;
  name: string;
  company: string;
  barcode?: string;
  gstPercent: number;
  hsn?: string;
  batchNumber: string;
  stockQty: number;
  mrp: number;
  rate: number;
  purchaseRate: number;
  rackLocation: string;
  expiryDate: string;
}

export default function BillingPage() {
  const router = useRouter();
  const [saleType, setSaleType] = useState<'RETAIL' | 'WHOLESALE' | 'TRANSFER'>('RETAIL');
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<BillingSuggestion[]>([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [cart, setCart] = useState<CartItem[]>([]);
  // Company filter (Requirement 1/2/16) — "" means "All Companies"
  const [companies, setCompanies] = useState<string[]>([]);
  const [companyFilter, setCompanyFilter] = useState<string>('');
  // Item Detail Popup (Requirement 4-14)
  const [detailSuggestion, setDetailSuggestion] = useState<ItemDetailSuggestion | null>(null);
  const [isDetailPopupOpen, setIsDetailPopupOpen] = useState(false);
  const [nearExpiryDays, setNearExpiryDays] = useState(30);
  const [lowStockThreshold, setLowStockThreshold] = useState(5);
  const [loading, setLoading] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'CARD' | 'UPI' | 'CREDIT'>('CASH');
  const [receivedAmount, setReceivedAmount] = useState<number>(0);
  const [customerName, setCustomerName] = useState<string>('Walk-in Customer');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerAddress, setCustomerAddress] = useState<string>('');
  const [customerGstin, setCustomerGstin] = useState<string>('');
  const [customerDrugLicense, setCustomerDrugLicense] = useState<string>('');
  const [customerPan, setCustomerPan] = useState<string>('');
  const [orderId, setOrderId] = useState<string>('');
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const receivedAmountRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  // Barcode scanner detection
  const barcodeBufferRef = useRef<string>('');
  const barcodeLastKeyTimeRef = useRef<number>(0);
  const [scannerActive, setScannerActive] = useState(false);
  const [gstMode, setGstMode] = useState<'inclusive' | 'exclusive'>('inclusive');
  const [discountMode, setDiscountMode] = useState<'flat' | 'percent'>('flat');
  // Billing settings toggles
  const [enableRetail, setEnableRetail] = useState(true);
  const [enableWholesale, setEnableWholesale] = useState(true);
  const [allowDiscounts, setAllowDiscounts] = useState(true);
  const [enableBarcode, setEnableBarcode] = useState(true);
  const [autoPrintInvoice, setAutoPrintInvoice] = useState(false);

  useEffect(() => {
    setOrderId(`#POS-${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`);
  }, []);

  // Load from local storage on mount
  useEffect(() => {
    setMounted(true);
    axios.get('/api/settings/billing').then(res => {
      if (res.data.success && res.data.data) {
        const d = res.data.data;
        if (d.gstMode) setGstMode(d.gstMode);
        if (typeof d.enableRetail === 'boolean') setEnableRetail(d.enableRetail);
        if (typeof d.enableWholesale === 'boolean') setEnableWholesale(d.enableWholesale);
        if (typeof d.allowDiscounts === 'boolean') setAllowDiscounts(d.allowDiscounts);
        if (typeof d.enableBarcode === 'boolean') setEnableBarcode(d.enableBarcode);
        if (typeof d.autoPrintInvoice === 'boolean') setAutoPrintInvoice(d.autoPrintInvoice);
      }
    }).catch(console.error);

    // Company list for the Company_Filter (Requirement 1.3/1.4)
    axios.get('/api/medicines/companies').then(res => {
      if (res.data.success && Array.isArray(res.data.companies)) {
        setCompanies(res.data.companies.map((c: { name: string }) => c.name).filter(Boolean));
      }
    }).catch(console.error);

    // Near-expiry / low-stock thresholds for popup badges (Requirement 11/13)
    axios.get('/api/settings/inventory').then(res => {
      if (res.data.success && res.data.data) {
        if (typeof res.data.data.nearExpiryDays === 'number') setNearExpiryDays(res.data.data.nearExpiryDays);
        if (typeof res.data.data.lowStockThreshold === 'number') setLowStockThreshold(res.data.data.lowStockThreshold);
      }
    }).catch(console.error);

    try {
      // Requirement 16: restore last-selected Company_Filter
      const savedCompanyFilter = localStorage.getItem('pos_companyFilter');
      if (savedCompanyFilter) setCompanyFilter(savedCompanyFilter);

      // Requirement 15: restore last-used Discount_Mode
      const savedDiscountMode = localStorage.getItem('pos_discountMode');
      if (savedDiscountMode === 'flat' || savedDiscountMode === 'percent') {
        setDiscountMode(savedDiscountMode);
      }
    } catch (error) {
      console.error('Failed to restore POS preferences', error);
    }

    try {
      const savedCart = localStorage.getItem('pos_cart');
      if (savedCart) {
        setCart(JSON.parse(savedCart).map((item: any) => ({
          ...item,
          expiryDate: new Date(item.expiryDate)
        })));
      }
      
      const savedSaleType = localStorage.getItem('pos_saleType');
      if (savedSaleType) setSaleType(savedSaleType as 'RETAIL' | 'WHOLESALE' | 'TRANSFER');
      
      const savedCustomerName = localStorage.getItem('pos_customerName');
      if (savedCustomerName) setCustomerName(savedCustomerName);

      const savedCustomerPhone = localStorage.getItem('pos_customerPhone');
      if (savedCustomerPhone) setCustomerPhone(savedCustomerPhone);

      const savedCustomerAddress = localStorage.getItem('pos_customerAddress');
      if (savedCustomerAddress) setCustomerAddress(savedCustomerAddress);

      const savedCustomerGstin = localStorage.getItem('pos_customerGstin');
      if (savedCustomerGstin) setCustomerGstin(savedCustomerGstin);

      const savedCustomerDrugLicense = localStorage.getItem('pos_customerDrugLicense');
      if (savedCustomerDrugLicense) setCustomerDrugLicense(savedCustomerDrugLicense);

      const savedCustomerPan = localStorage.getItem('pos_customerPan');
      if (savedCustomerPan) setCustomerPan(savedCustomerPan);
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
      localStorage.setItem('pos_customerGstin', customerGstin);
      localStorage.setItem('pos_customerDrugLicense', customerDrugLicense);
      localStorage.setItem('pos_customerPan', customerPan);
    }
  }, [mounted, cart, saleType, customerName, customerPhone, customerAddress, customerGstin, customerDrugLicense, customerPan]);

  // Requirement 16: persist Company_Filter selection
  useEffect(() => {
    if (!mounted) return;
    if (companyFilter) {
      localStorage.setItem('pos_companyFilter', companyFilter);
    } else {
      localStorage.removeItem('pos_companyFilter');
    }
  }, [mounted, companyFilter]);

  // Requirement 15: persist Discount_Mode
  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem('pos_discountMode', discountMode);
  }, [mounted, discountMode]);

  // Requirement 16.2: if the persisted company no longer exists once the
  // real company list has loaded, fall back to "All Companies".
  useEffect(() => {
    if (companies.length > 0 && companyFilter && !companies.includes(companyFilter)) {
      setCompanyFilter('');
    }
  }, [companies, companyFilter]);

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
          // Requirement 2.1/2.2: company filter scopes results when active
          params: { q: searchQuery, limit: 10, ...(companyFilter ? { company: companyFilter } : {}) },
        });

        if (response.data.success) {
          setSuggestions(response.data.data);
          setActiveSuggestionIndex(0);
        }
      } catch (error) {
        console.error('Billing search failed:', error);
      }
    }, 300);
  }, [searchQuery, companyFilter]);

  const getBillingRate = (suggestion: BillingSuggestion) => {
    const purchaseRate = Number(suggestion.purchaseRate || 0);
    const sellingRate = Number(suggestion.rate || 0);
    const mrp = Number(suggestion.mrp || 0);

    if ((saleType === 'WHOLESALE' || saleType === 'TRANSFER') && purchaseRate > 0) {
      return purchaseRate;
    }

    return sellingRate > 0 ? sellingRate : mrp;
  };

  const getItemUnitPrice = (item: CartItem) => {
    return item.rate > 0 ? item.rate : item.mrp;
  };

  const addSuggestionToCart = (suggestion: BillingSuggestion) => {
    const daysToExpiry = Math.ceil(
      (new Date(suggestion.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    if (daysToExpiry < 0) {
      toast.error('This batch is expired and cannot be billed.');
      return;
    }

    const mrp = suggestion.mrp;
    const gstPercent = suggestion.gstPercent ?? 0;

    // Use purchase rate (TP) for wholesale/transfer when available.
    // Imported batches can have TP as 0, so fall back to a billable positive rate.
    const baseRate = getBillingRate(suggestion);

    let rate: number;
    let gst: number;
    let amount: number;

    if (gstMode === 'inclusive') {
      rate = baseRate;
      amount = baseRate * 1;
      const basePrice = Math.round((amount / (1 + gstPercent / 100)) * 100) / 100;
      gst = Math.round((amount - basePrice) * 100) / 100;
    } else {
      rate = baseRate;
      const afterDiscount = rate * 1 - 0;
      gst = Math.round(((afterDiscount * gstPercent) / 100) * 100) / 100;
      amount = afterDiscount + gst;
    }

    const newItem: CartItem = {
      medicineId: suggestion.medicineId,
      medicineName: suggestion.name,
      company: suggestion.company,
      quantity: 1,
      batchId: suggestion.batchId,
      batchNumber: suggestion.batchNumber,
      expiryDate: new Date(suggestion.expiryDate),
      mrp,
      rate,
      discount: 0,
      discountPercent: 0,
      gstPercent,
      gst,
      amount,
      rackLocation: suggestion.rackLocation,
    };

    setCart((current) => [...current, newItem]);
    setSearchQuery('');
    setSuggestions([]);
    setActiveSuggestionIndex(0);
  };

  // Requirement 4.1: manual selection (click, or Enter on a highlighted
  // suggestion) opens the Item_Detail_Popup instead of adding directly.
  // Barcode scanning and Exact_Match_Lookup (Requirement 3) bypass this and
  // continue to call addSuggestionToCart() directly.
  const openItemDetailPopup = (suggestion: BillingSuggestion) => {
    setDetailSuggestion(suggestion);
    setIsDetailPopupOpen(true);
  };

  const handleDetailPopupConfirm = (item: CartItem) => {
    setCart((current) => [...current, item]);
    setIsDetailPopupOpen(false);
    setDetailSuggestion(null);
    // Requirement 4.5: clear search after the popup closes via confirm/cancel
    setSearchQuery('');
    setSuggestions([]);
    setActiveSuggestionIndex(0);
    searchInputRef.current?.focus();
  };

  const handleDetailPopupCancel = () => {
    setIsDetailPopupOpen(false);
    setDetailSuggestion(null);
    setSearchQuery('');
    setSuggestions([]);
    setActiveSuggestionIndex(0);
    searchInputRef.current?.focus();
  };

  const handleSearchKeyDown = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!suggestions.length) {
      if (event.key === 'Enter' && searchQuery.trim()) {
        event.preventDefault();
        try {
          const response = await axios.get('/api/billing/search', {
            params: { q: searchQuery.trim(), limit: 5, ...(companyFilter ? { company: companyFilter } : {}) },
          });

          if (response.data.success) {
            const results: BillingSuggestion[] = response.data.data || [];
            const exactMatch = results.find(
              (item) =>
                item.barcode === searchQuery.trim() || item.batchNumber === searchQuery.trim()
            );

            // Requirement 3.4: Exact_Match_Lookup adds directly, no popup.
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
      // Requirement 4.1: Enter on a highlighted suggestion opens the popup.
      openItemDetailPopup(suggestions[activeSuggestionIndex]);
    }
  };

  const updateCartItemQuantity = (index: number, nextQuantity: number) => {
    setCart((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const quantity = Math.max(1, nextQuantity);
        let gst: number;
        let amount: number;
        const unitPrice = getItemUnitPrice(item);
        if (gstMode === 'inclusive') {
          amount = Math.round((unitPrice * quantity - item.discount) * 100) / 100;
          const basePrice = Math.round((amount / (1 + item.gstPercent / 100)) * 100) / 100;
          gst = Math.round((amount - basePrice) * 100) / 100;
        } else {
          const afterDiscount = quantity * item.rate - item.discount;
          gst = Math.round(((afterDiscount * item.gstPercent) / 100) * 100) / 100;
          amount = afterDiscount + gst;
        }
        return { ...item, quantity, gst, amount };
      })
    );
  };

  const updateCartItemDiscount = (index: number, discountInput: number) => {
    setCart((current) =>
      current.map((item, i) => {
        if (i !== index) return item;
        const unitPrice = getItemUnitPrice(item);
        const discountRupees = discountMode === 'percent'
          ? Math.round((unitPrice * item.quantity * (discountInput / 100)) * 100) / 100
          : discountInput;
        const discountPercent = discountMode === 'percent' ? discountInput : 0;
        
        if (gstMode === 'inclusive') {
          const amount = Math.round((unitPrice * item.quantity - discountRupees) * 100) / 100;
          const basePrice = Math.round((amount / (1 + item.gstPercent / 100)) * 100) / 100;
          const gst = Math.round((amount - basePrice) * 100) / 100;
          return { ...item, discount: discountRupees, discountPercent, gst, amount };
        } else {
          const afterDiscount = item.quantity * item.rate - discountRupees;
          const gst = Math.round(((afterDiscount * item.gstPercent) / 100) * 100) / 100;
          return { ...item, discount: discountRupees, discountPercent, gst, amount: afterDiscount + gst };
        }
      })
    );
  };

  const updateCartItemGst = (index: number, gstPercent: number) => {
    setCart((current) =>
      current.map((item, i) => {
        if (i !== index) return item;
        let gst: number;
        let amount: number;
        const unitPrice = getItemUnitPrice(item);
        if (gstMode === 'inclusive') {
          amount = Math.round((unitPrice * item.quantity - item.discount) * 100) / 100;
          const basePrice = Math.round((amount / (1 + gstPercent / 100)) * 100) / 100;
          gst = Math.round((amount - basePrice) * 100) / 100;
        } else {
          const afterDiscount = item.quantity * item.rate - item.discount;
          gst = Math.round(((afterDiscount * gstPercent) / 100) * 100) / 100;
          amount = afterDiscount + gst;
        }
        return { ...item, gstPercent, gst, amount };
      })
    );
  };

  const removeFromCart = (index: number) => {
    setCart((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const totals = useMemo(() => {
    if (gstMode === 'inclusive') {
      const grandTotal = Math.round(cart.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
      const gstTotal = Math.round(cart.reduce((sum, item) => sum + item.gst, 0) * 100) / 100;
      const discountTotal = Math.round(cart.reduce((sum, item) => sum + item.discount, 0) * 100) / 100;
      const subtotal = Math.round((grandTotal - gstTotal) * 100) / 100;
      return { subtotal, discountTotal, gstTotal, grandTotal };
    } else {
      const subtotal = Math.round(cart.reduce((sum, item) => sum + item.quantity * item.rate, 0) * 100) / 100;
      const discountTotal = Math.round(cart.reduce((sum, item) => sum + item.discount, 0) * 100) / 100;
      const gstTotal = Math.round(cart.reduce((sum, item) => sum + item.gst, 0) * 100) / 100;
      const grandTotal = Math.round((subtotal - discountTotal + gstTotal) * 100) / 100;
      return { subtotal, discountTotal, gstTotal, grandTotal };
    }
  }, [cart, gstMode]);

  const balance = receivedAmount - totals.grandTotal;

  const resetBill = useCallback(() => {
    setCart([]);
    setReceivedAmount(0);
    setOrderId(`#POS-${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`);
    setCustomerName('Walk-in Customer');
    setCustomerPhone('');
    setCustomerAddress('');
    setCustomerGstin('');
    setCustomerDrugLicense('');
    setCustomerPan('');
    
    // Clear localStorage
    localStorage.removeItem('pos_cart');
    localStorage.removeItem('pos_customerName');
    localStorage.removeItem('pos_customerPhone');
    localStorage.removeItem('pos_customerAddress');
    localStorage.removeItem('pos_customerGstin');
    localStorage.removeItem('pos_customerDrugLicense');
    localStorage.removeItem('pos_customerPan');
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
        address: customerAddress.trim(),
        gstin: customerGstin.trim(),
        drugLicense: customerDrugLicense.trim(),
        pan: customerPan.trim(),
      };

      // For credit sales, the outstanding amount is the grand total minus
      // whatever was received up front (partial payment allowed).
      const creditDue =
        paymentMode === 'CREDIT'
          ? Math.max(0, Math.round((totals.grandTotal - (receivedAmount || 0)) * 100) / 100)
          : undefined;

      const response = await axios.post('/api/sales', {
        saleType,
        items: cart.map((item) => ({
          medicineId: item.medicineId,
          batchId: item.batchId,
          quantity: item.quantity,
          rate: getItemUnitPrice(item),
          discount: item.discount,
          gstPercent: item.gstPercent,
        })),
        paymentMode,
        discountTotal: totals.discountTotal,
        gstMode,
        creditDue,
        customer: normalizedCustomer,
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to create sale');
      }

      const saleId = response.data.data?.id;
      resetBill();

      if (saleId) {
        const invoiceUrl = `/dashboard/billing/invoice/${saleId}${autoPrintInvoice ? '?autoprint=1' : ''}`;
        router.push(invoiceUrl);
      } else {
        toast.warning('Sale created but invoice preview failed to load.');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      const message = axios.isAxiosError(error)
        ? error.response?.data?.error || error.response?.data?.message || error.message
        : error instanceof Error
          ? error.message
          : 'Failed to create sale';
      toast.error(message || 'Failed to create sale');
    } finally {
      setLoading(false);
    }
  }, [
    cart,
    saleType,
    paymentMode,
    totals.discountTotal,
    totals.grandTotal,
    receivedAmount,
    gstMode,
    customerName,
    customerPhone,
    customerAddress,
    customerGstin,
    customerDrugLicense,
    customerPan,
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
      // While the Item_Detail_Popup is open, its own keydown handler owns
      // Enter/Escape (Requirement 14) — skip all page-level shortcuts and
      // barcode-buffer capture so typing in the popup can't false-trigger
      // scanner detection, checkout, or other global hotkeys.
      if (isDetailPopupOpen) return;

      const tag = (event.target as HTMLElement)?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      // ── Barcode scanner detection (only when enabled) ─────────
      // Scanners send chars very fast (<80ms apart) then Enter
      const now = Date.now();
      const timeSinceLast = now - barcodeLastKeyTimeRef.current;
      barcodeLastKeyTimeRef.current = now;

      if (enableBarcode && event.key === 'Enter' && barcodeBufferRef.current.length >= 4 && timeSinceLast < 100) {
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
  }, [handleCheckout, handleBarcodeInput, loading, resetBill, isDetailPopupOpen]);

  return (
    <div className="bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col min-h-[calc(100vh-4rem)] relative font-sans">
      <style dangerouslySetInnerHTML={{__html: `
        .material-symbols-outlined { font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />

      <main className="flex-1 p-3 sm:p-4 grid grid-cols-12 gap-3 sm:gap-4 w-full lg:overflow-hidden lg:h-full xl:h-[calc(100vh-6rem)]">
        
        {/* LEFT PANEL: INVENTORY SEARCH */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-4 lg:overflow-hidden lg:h-full">
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3 flex items-center gap-3 shadow-sm shrink-0">
            <span className="material-symbols-outlined text-primary text-2xl">search</span>
            <input 
              className="flex-1 bg-transparent border-none focus:ring-0 text-[15px] font-medium placeholder:text-slate-400 p-0" 
              placeholder="Medication, SKU, Barcode..." 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              ref={searchInputRef}
              autoFocus
            />
            <div className="flex items-center gap-2 border-l border-slate-200 dark:border-slate-600 pl-2">
              <span className={`material-symbols-outlined text-2xl transition-all duration-200 cursor-pointer ${scannerActive ? 'text-primary scale-125 animate-pulse' : 'text-slate-400 hover:text-primary'}`}>qr_code_scanner</span>
            </div>
          </div>

          {/* Company Filter — Requirement 1 */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-2.5 flex items-center gap-2 shadow-sm shrink-0">
            <span className="material-symbols-outlined text-slate-400 text-xl shrink-0">apartment</span>
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="flex-1 min-w-0 bg-transparent border-none focus:ring-0 text-[13px] font-bold text-slate-700 dark:text-slate-200 py-1"
              aria-label="Filter by company"
            >
              <option value="">All Companies</option>
              {companies.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 flex-1 flex flex-col overflow-hidden max-h-[45vh] lg:max-h-none">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between shrink-0">
              <h2 className="text-[13px] font-bold uppercase tracking-widest text-slate-500">Inventory Items</h2>
              {searchQuery && (
                <button onClick={() => { setSearchQuery(''); setSuggestions([]); }} className="text-[13px] font-bold text-red-500 hover:text-red-600 flex items-center gap-1 uppercase transition-colors">
                  <span className="material-symbols-outlined text-[17px]">close</span> Clear
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 no-scrollbar flex flex-col">
              {suggestions.length === 0 ? (
                <div className="p-4 text-center text-[13px] text-slate-400 font-medium my-auto">
                  {searchQuery.trim()
                    ? companyFilter
                      ? `No results for "${companyFilter}".`
                      : 'No matching medicines found.'
                    : 'Search inventory to begin.'}
                </div>
              ) : (
                suggestions.map((suggestion, index) => (
                  <div 
                    key={`${suggestion.batchId}-${index}`}
                    onClick={() => openItemDetailPopup(suggestion)}
                    className={`group p-3 rounded-md border cursor-pointer transition-all ${index === activeSuggestionIndex ? 'border-primary/40 bg-slate-50 dark:bg-slate-900/50' : 'border-transparent hover:border-primary/20 hover:bg-slate-50 dark:hover:bg-slate-900/50'}`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-[15px] font-semibold text-slate-900 dark:text-white">{suggestion.name}</h4>
                        <p className="text-[13px] text-slate-500 mt-0.5">{suggestion.company} {suggestion.rackLocation ? `• ${suggestion.rackLocation}` : ''}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[13px] font-mono font-bold text-slate-900 dark:text-white">₹{suggestion.mrp.toFixed(2)}</p>
                        <p className={`text-[13px] font-bold uppercase ${suggestion.stockQty > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {suggestion.stockQty > 0 ? `Stock: ${suggestion.stockQty}` : 'Out of Stock'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="hidden lg:block p-3 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700 shrink-0">
              <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col items-center py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded shadow-sm">
                  <span className="text-[10px] font-black text-slate-400">ESC</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Clear</span>
                </div>
                <div className="flex flex-col items-center py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded shadow-sm">
                  <span className="text-[10px] font-black text-slate-400">ENT</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Add</span>
                </div>
                <div className="flex flex-col items-center py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded shadow-sm">
                  <span className="text-[10px] font-black text-slate-400">F12</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Pay</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* CENTER PANEL: CURRENT ORDER */}
        <div className="col-span-12 lg:col-span-6 flex flex-col gap-4 lg:overflow-hidden lg:h-full">
          <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 flex-1 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-[17px] font-bold text-slate-900 dark:text-white">Current Order</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[13px] font-mono text-slate-400">{orderId}</span>
                  <span className="w-1 h-1 bg-slate-300 dark:bg-slate-600 rounded-full"></span>
                  <span className="text-[13px] font-bold text-primary uppercase">{cart.length} Item{cart.length !== 1 && 's'} in Cart</span>
                </div>
              </div>
              <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-md">
                {(['RETAIL', 'WHOLESALE', 'TRANSFER'] as const)
                  .filter((mode) => {
                    if (mode === 'RETAIL' && !enableRetail) return false;
                    if (mode === 'WHOLESALE' && !enableWholesale) return false;
                    return true;
                  })
                  .map((mode) => (
                  <button key={mode} onClick={() => setSaleType(mode)} className={`px-3 py-1 text-[12px] font-bold rounded shadow-sm hover:shadow uppercase tracking-wider transition-all ${saleType === mode ? 'bg-primary text-white shadow-primary/20' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                    {mode}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar min-h-[30vh]">
              {cart.map((item, index) => (
                <div key={`${item.batchId}-${index}`} className="p-4 rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 group hover:border-primary/30 transition-all shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-[15px] text-slate-900 dark:text-white uppercase tracking-tight pr-4">{item.medicineName}</h3>
                      <div className="flex flex-wrap gap-2 mt-1.5">
                        <span className="text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded uppercase">B:{item.batchNumber}</span>
                        <span className="text-[10px] font-bold bg-amber-50 dark:bg-amber-900/30 text-amber-600 px-1.5 py-0.5 rounded uppercase">Exp: {new Date(item.expiryDate).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}</span>
                        <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded uppercase">₹{getItemUnitPrice(item).toFixed(2)}/U</span>
                      </div>
                    </div>
                    <button onClick={() => removeFromCart(index)} className="text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 transition-colors">
                      <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-12 gap-2.5 sm:gap-3 xl:gap-4 items-center">
                    <div className="col-span-2 lg:col-span-4 flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded px-1 min-h-[42px] lg:min-h-[34px]">
                      <button onClick={() => updateCartItemQuantity(index, item.quantity - 1)} className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-primary transition-all">
                        <span className="material-symbols-outlined text-[15px]">remove</span>
                      </button>
                      <input 
                        className="w-full text-center border-none bg-transparent focus:ring-0 text-[13px] font-black text-slate-900 dark:text-white p-1" 
                        type="number" 
                        value={item.quantity}
                        onChange={(e) => updateCartItemQuantity(index, parseInt(e.target.value, 10) || 1)}
                      />
                      <button onClick={() => updateCartItemQuantity(index, item.quantity + 1)} className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-primary transition-all">
                        <span className="material-symbols-outlined text-[15px]">add</span>
                      </button>
                    </div>
                    {allowDiscounts && (
                    <div className="col-span-1 lg:col-span-4 relative min-h-[42px] lg:min-h-[34px]">
                      <button onClick={() => setDiscountMode(m => m === 'percent' ? 'flat' : 'percent')} className="absolute left-1.5 top-1/2 -translate-y-1/2 z-10 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-600 dark:text-slate-300 transition-colors">{discountMode === 'percent' ? '%' : '₹'}</button>
                      <input 
                        className="w-full h-full pl-8 pr-2 py-[7px] text-[13px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded focus:ring-1 focus:ring-primary focus:border-primary transition-all text-right shadow-sm"
                        type="number" min="0" max={discountMode === 'percent' ? "100" : undefined}
                        value={discountMode === 'percent' ? (item.discountPercent || 0) : item.discount}
                        onChange={(e) => updateCartItemDiscount(index, parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    )}
                    <div className={`${allowDiscounts ? 'col-span-1' : 'col-span-2'} lg:col-span-4 min-h-[42px] lg:min-h-[34px]`}>
                      <select 
                        value={item.gstPercent}
                        onChange={(e) => updateCartItemGst(index, parseFloat(e.target.value) || 0)}
                        className="w-full h-full py-[7px] pl-2 pr-6 text-[13px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded focus:ring-1 focus:ring-primary focus:border-primary transition-all shadow-sm appearance-none cursor-pointer"
                      >
                        {GST_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>GST {opt.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
                    <span className="text-[13px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Item Subtotal</span>
                    <span className="text-[19px] font-black font-mono text-slate-900 dark:text-white">₹{item.amount.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-slate-400 shrink-0">
              <p className="text-[13px] font-bold uppercase tracking-widest flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${scannerActive ? 'bg-primary shadow-sm shadow-primary/40' : 'bg-slate-300 dark:bg-slate-600'}`}></span>
                Scanning Ready
              </p>
              <span className={`material-symbols-outlined text-2xl transition-all ${scannerActive ? 'text-primary' : 'text-slate-400 dark:text-slate-500'}`}>barcode_scanner</span>
            </div>
          </section>
        </div>

        {/* RIGHT PANEL: CHECKOUT SUMMARY */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-4 lg:overflow-hidden lg:h-full pb-4 lg:pb-0">
          <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 flex-1 flex flex-col lg:overflow-y-auto no-scrollbar">
            
            <div className="p-5 border-b border-slate-100 dark:border-slate-700 shrink-0">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-3.5 bg-primary rounded-full"></div>
                <h2 className="text-[13px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300">Transaction Summary</h2>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase">Subtotal</span>
                  <span className="text-[13px] font-mono font-bold text-slate-700 dark:text-slate-200">₹{totals.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase">Applicable Taxes</span>
                  <span className="text-[13px] font-mono font-bold text-slate-700 dark:text-slate-200">₹{totals.gstTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center py-2 px-3 bg-red-50 dark:bg-red-900/20 rounded border border-red-100 dark:border-red-900/40">
                  <span className="text-[13px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wide">Discount</span>
                  <span className="text-[13px] font-mono font-bold text-red-600 dark:text-red-400">-₹{totals.discountTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="p-5 bg-slate-50/50 dark:bg-slate-900/20 shrink-0">
              <div className="bg-primary p-5 rounded-lg border border-primary/20 shadow-[0_4px_14px_0_rgba(45,122,77,0.2)] text-center relative overflow-hidden">
                <span className="material-symbols-outlined absolute right-0 top-0 opacity-[0.05] text-white text-[120px] -translate-y-4 translate-x-4">payments</span>
                <p className="text-[13px] font-bold text-emerald-50 opacity-90 uppercase tracking-widest mb-1 relative z-10">Total Payable</p>
                <p className="text-5xl font-black text-white font-mono tracking-tighter relative z-10">₹{totals.grandTotal.toFixed(2)}</p>
                <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 bg-white/15 rounded-full relative z-10">
                  <span className="material-symbols-outlined text-[12px] text-white">verified_user</span>
                  <span className="text-[10px] font-bold text-white uppercase tracking-wider">Secured</span>
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-slate-100 dark:border-slate-700 shrink-0">
              <p className="text-[13px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Payment Mode</p>
              <div className="grid grid-cols-2 gap-2">
                {(['CASH', 'CARD', 'UPI', 'CREDIT'] as const).map(mode => {
                  const icons = { 'CASH': 'payments', 'CARD': 'credit_card', 'UPI': 'qr_code_2', 'CREDIT': 'history_edu' };
                  return (
                    <button 
                      key={mode} onClick={() => setPaymentMode(mode)}
                      className={`flex flex-col items-center justify-center gap-1.5 py-3 rounded border-2 transition-all shadow-sm ${paymentMode === mode ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:border-primary/40 hover:text-primary dark:text-slate-400 dark:hover:text-primary'}`}
                    >
                      <span className="material-symbols-outlined text-2xl">{icons[mode]}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider">{mode}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-5 space-y-3 shrink-0">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[15px]">person</span>
                <input 
                  className="w-full pl-9 pr-3 py-2.5 text-[13px] font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded focus:ring-1 focus:ring-primary transition-all uppercase placeholder:text-slate-400 shadow-sm" 
                  type="text" placeholder="Walk-in Customer" value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[15px]">smartphone</span>
                <input 
                  className="w-full pl-9 pr-3 py-2.5 text-[13px] font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded focus:ring-1 focus:ring-primary transition-all placeholder:text-slate-400 shadow-sm" 
                  type="text" placeholder="Contact Number (Optional)" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </div>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[15px]">location_on</span>
                <input 
                  className="w-full pl-9 pr-3 py-2.5 text-[13px] font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded focus:ring-1 focus:ring-primary transition-all placeholder:text-slate-400 shadow-sm" 
                  type="text" placeholder="Address (Optional)" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)}
                />
              </div>

              {/* B2B / GST details — always available, never mandatory, for both RETAIL and WHOLESALE/TRANSFER */}
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pt-1">B2B Details (Optional)</p>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[15px]">receipt_long</span>
                <input 
                  className="w-full pl-9 pr-3 py-2.5 text-[13px] font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded focus:ring-1 focus:ring-primary transition-all uppercase placeholder:text-slate-400 placeholder:normal-case shadow-sm font-mono" 
                  type="text" placeholder="GSTIN (Optional)" value={customerGstin} onChange={(e) => setCustomerGstin(e.target.value)}
                />
              </div>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[15px]">medication</span>
                <input 
                  className="w-full pl-9 pr-3 py-2.5 text-[13px] font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded focus:ring-1 focus:ring-primary transition-all placeholder:text-slate-400 shadow-sm font-mono" 
                  type="text" placeholder="Drug License No. (Optional)" value={customerDrugLicense} onChange={(e) => setCustomerDrugLicense(e.target.value)}
                />
              </div>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[15px]">badge</span>
                <input 
                  className="w-full pl-9 pr-3 py-2.5 text-[13px] font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded focus:ring-1 focus:ring-primary transition-all uppercase placeholder:text-slate-400 placeholder:normal-case shadow-sm font-mono" 
                  type="text" placeholder="PAN No. (Optional)" value={customerPan} onChange={(e) => setCustomerPan(e.target.value)}
                />
              </div>
            </div>

            {paymentMode === 'CASH' && (
              <div className="p-5 border-t border-slate-100 dark:border-slate-700 shrink-0">
                <p className="flex items-center justify-between text-[13px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">
                  <span>Cash Received</span>
                  <span className="bg-slate-100 dark:bg-slate-700 px-1 py-0.5 rounded text-[10px] text-slate-500 dark:text-slate-400">F7</span>
                </p>
                <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[15px] font-black">₹</span>
                    <input type="number" value={receivedAmount || ''} onChange={(e) => setReceivedAmount(parseFloat(e.target.value) || 0)} ref={receivedAmountRef} placeholder="0.00" className="w-full pl-8 pr-3 py-2.5 text-[15px] font-black bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded focus:ring-1 focus:ring-primary transition-all shadow-sm" />
                </div>
              </div>
            )}

            <div className="mt-auto p-5 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 space-y-3 shrink-0">
              <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-sm">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-tight">Return Change</span>
                  <span className={`text-2xl font-mono font-black tracking-tighter ${balance >= 0 ? 'text-primary' : 'text-red-500'}`}>₹{(paymentMode === 'CASH' ? balance : 0).toFixed(2)}</span>
                </div>
                <div className="w-8 h-8 flex items-center justify-center bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 rounded">
                  <span className="material-symbols-outlined text-[19px]">currency_exchange</span>
                </div>
              </div>
              <button onClick={handleCheckout} disabled={loading || cart.length === 0} className="w-full bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary text-white py-4 rounded font-bold uppercase tracking-widest text-[13px] shadow-md shadow-primary/20 transition-all flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[19px]">receipt_long</span>
                {loading ? 'Processing...' : 'Generate Invoice'}
                {!loading && <span className="text-[10px] opacity-60 font-black ml-1 bg-white/20 px-1.5 py-0.5 rounded">F12</span>}
              </button>
              <button onClick={resetBill} className="w-full py-2 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-1 group">
                <span className="material-symbols-outlined text-[17px]">delete</span> Discard Transaction
              </button>
            </div>
          </section>
        </div>
      </main>

      {/* Item Detail Popup — Requirements 4-14 */}
      <ItemDetailPopup
        isOpen={isDetailPopupOpen}
        suggestion={detailSuggestion}
        saleType={saleType}
        gstMode={gstMode}
        discountMode={discountMode}
        onDiscountModeChange={setDiscountMode}
        nearExpiryDays={nearExpiryDays}
        lowStockThreshold={lowStockThreshold}
        onCancel={handleDetailPopupCancel}
        onConfirm={handleDetailPopupConfirm}
      />
    </div>
  );
}
