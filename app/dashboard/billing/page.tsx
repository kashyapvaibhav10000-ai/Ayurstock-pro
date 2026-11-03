'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CartItem } from '@/types';
import ItemDetailPopup, { ItemDetailSuggestion } from '@/components/billing/ItemDetailPopup';
import CartBatchSelect, { CartBatchOption, invalidateCartBatchCache } from '@/components/billing/CartBatchSelect';
import { batchLabel, isBatchExpired } from '@/lib/batch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeftRight,
  Banknote,
  Building2,
  CreditCard,
  FileText,
  IdCard,
  MapPin,
  Minus,
  NotebookPen,
  Pill,
  Plus,
  QrCode,
  ReceiptText,
  ScanBarcode,
  Search,
  ShoppingBag,
  Smartphone,
  Trash2,
  User,
  X,
} from 'lucide-react';


interface BillingSuggestion {
  id: string;
  batchId: string;
  medicineId: string;
  name: string;
  company: string;
  barcode?: string;
  gstPercent: number;
  hsn?: string;
  packing?: string;
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
  const [isMedicineSearchOpen, setIsMedicineSearchOpen] = useState(false);
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
  const [customerInfoExpanded, setCustomerInfoExpanded] = useState(false);
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
      // Requirement 15: restore last-used Discount_Mode
      const savedDiscountMode = localStorage.getItem('pos_discountMode');
      if (savedDiscountMode === 'flat' || savedDiscountMode === 'percent') {
        setDiscountMode(savedDiscountMode);
      }
      // Note: Company_Filter is intentionally NOT restored from storage on
      // load. It auto-resets to "All Companies" after every item is added
      // (see handleDetailPopupConfirm / addSuggestionToCart) so a forgotten
      // filter never silently hides medicines on a fresh visit or the next
      // search — see clarification from user feedback.
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

  // Requirement 15: persist Discount_Mode
  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem('pos_discountMode', discountMode);
  }, [mounted, discountMode]);

  // If the selected company no longer exists once the real company list has
  // loaded (e.g. it was renamed/removed), fall back to "All Companies".
  useEffect(() => {
    if (companies.length > 0 && companyFilter && !companies.includes(companyFilter)) {
      setCompanyFilter('');
    }
  }, [companies, companyFilter]);

  const openMedicineSearch = useCallback(() => {
    setSearchQuery('');
    setSuggestions([]);
    setActiveSuggestionIndex(0);
    setIsMedicineSearchOpen(true);
  }, []);

  const clearMedicineSearchFilters = () => {
    setSearchQuery('');
    setSuggestions([]);
    setActiveSuggestionIndex(0);
    setCompanyFilter('');
    searchInputRef.current?.focus();
  };

  useEffect(() => {
    if (!isMedicineSearchOpen || isDetailPopupOpen) return;
    const focusTimer = setTimeout(() => searchInputRef.current?.focus(), 50);
    return () => clearTimeout(focusTimer);
  }, [isMedicineSearchOpen, isDetailPopupOpen]);

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
    if (isBatchExpired(suggestion.expiryDate)) {
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
    setIsMedicineSearchOpen(false);
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
    setIsMedicineSearchOpen(true);
    searchInputRef.current?.focus();
  };

  const handleDetailPopupCancel = () => {
    setIsDetailPopupOpen(false);
    setDetailSuggestion(null);
    setSearchQuery('');
    setSuggestions([]);
    setActiveSuggestionIndex(0);
    setIsMedicineSearchOpen(true);
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

  // User override of the FEFO-picked batch for a cart line. Price follows the
  // newly selected batch; quantity and discount stay as entered.
  const changeCartItemBatch = (index: number, batch: CartBatchOption) => {
    setCart((current) =>
      current.map((item, i) => {
        if (i !== index) return item;
        const rate = getBillingRate({
          purchaseRate: batch.purchaseRate,
          rate: batch.sellingRate,
          mrp: batch.mrp,
        } as BillingSuggestion);
        let gst: number;
        let amount: number;
        if (gstMode === 'inclusive') {
          amount = Math.round((rate * item.quantity - item.discount) * 100) / 100;
          const basePrice = Math.round((amount / (1 + item.gstPercent / 100)) * 100) / 100;
          gst = Math.round((amount - basePrice) * 100) / 100;
        } else {
          const afterDiscount = item.quantity * rate - item.discount;
          gst = Math.round(((afterDiscount * item.gstPercent) / 100) * 100) / 100;
          amount = afterDiscount + gst;
        }
        return {
          ...item,
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          expiryDate: new Date(batch.expiryDate),
          mrp: batch.mrp,
          rate,
          gst,
          amount,
        };
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

  const totalMrp = useMemo(
    () => Math.round(cart.reduce((sum, item) => sum + Number(item.mrp || 0) * item.quantity, 0) * 100) / 100,
    [cart]
  );

  const hasCustomerInfo = useMemo(() => {
    const hasName = customerName.trim() && customerName.trim() !== 'Walk-in Customer';
    return Boolean(
      hasName ||
      customerPhone.trim() ||
      customerAddress.trim() ||
      customerGstin.trim() ||
      customerDrugLicense.trim() ||
      customerPan.trim()
    );
  }, [customerName, customerPhone, customerAddress, customerGstin, customerDrugLicense, customerPan]);

  const balance = receivedAmount - totals.grandTotal;

  const resetBill = useCallback(() => {
    setCart([]);
    invalidateCartBatchCache();
    setReceivedAmount(0);
    setOrderId(`#POS-${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`);
    setCustomerName('Walk-in Customer');
    setCustomerPhone('');
    setCustomerAddress('');
    setCustomerGstin('');
    setCustomerDrugLicense('');
    setCustomerPan('');
    setCustomerInfoExpanded(false);
    setPaymentMode('CASH');
    setSearchQuery('');
    setSuggestions([]);
    setActiveSuggestionIndex(0);
    setIsMedicineSearchOpen(false);
    setCompanyFilter('');
    
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

      // Credit sales: the server computes creditDue from the amount received.
      const amountPaid = paymentMode === 'CREDIT' ? Math.max(0, receivedAmount || 0) : undefined;

      const response = await axios.post('/api/sales', {
        saleType,
        items: cart.map((item) => ({
          medicineId: item.medicineId,
          batchId: item.batchId,
          quantity: item.quantity,
          rate: getItemUnitPrice(item),
          discount: item.discount,
        })),
        paymentMode,
        amountPaid,
        customer: normalizedCustomer,
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to create sale');
      }

      const saleId = response.data.data?.id;
      for (const warning of response.data.data?.warnings || []) toast.warning(warning);
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
          setIsMedicineSearchOpen(true);
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
        openMedicineSearch();
        return;
      }

      if (event.key === 'F7') {
        event.preventDefault();
        receivedAmountRef.current?.focus();
        return;
      }

      if (event.key === 'F2') {
        event.preventDefault();
        openMedicineSearch();
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setSearchQuery('');
        setSuggestions([]);
        if (isMedicineSearchOpen) {
          setIsMedicineSearchOpen(false);
        }
        return;
      }

      // Auto-focus search on alphanumeric when not in an input
      if (!isInput && !event.metaKey && !event.ctrlKey && !event.altKey && event.key.length === 1 && /[a-zA-Z0-9]/.test(event.key)) {
        openMedicineSearch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCheckout, handleBarcodeInput, loading, openMedicineSearch, isDetailPopupOpen, isMedicineSearchOpen, enableBarcode]);

  const kbd = 'inline-flex items-center rounded-[6px] bg-fill-strong px-1.5 py-px text-[11px] font-medium text-muted-foreground';
  const fieldWrap = 'relative';
  const fieldIcon = 'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 stroke-[1.75] text-muted-foreground';
  const field = 'h-10 w-full rounded-control border border-transparent bg-fill pl-9 pr-3 text-[14px] text-foreground placeholder:text-label-tertiary transition-[background-color,border-color,box-shadow] duration-200 focus:border-primary/60 focus:bg-surface focus:outline-none focus:ring-[3px] focus:ring-primary/25';
  const paymentIcons = { CASH: Banknote, CARD: CreditCard, UPI: QrCode, CREDIT: NotebookPen } as const;
  const paymentLabels = { CASH: 'Cash', CARD: 'Card', UPI: 'UPI', CREDIT: 'Credit' } as const;
  const saleTypeLabels = { RETAIL: 'Retail', WHOLESALE: 'Wholesale', TRANSFER: 'Transfer' } as const;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-background text-foreground">
      <main className="grid w-full flex-1 grid-cols-12 gap-4 p-3 sm:p-5 lg:h-full lg:overflow-hidden xl:h-[calc(100vh-5rem)]">

        {/* Current order */}
        <div className="col-span-12 flex flex-col lg:col-span-8 lg:h-full lg:overflow-hidden">
          <section className="flex flex-1 flex-col overflow-hidden rounded-card bg-surface shadow-card">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 pb-4 pt-5">
              <div>
                <h2 className="text-title-2 text-foreground">Current order</h2>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  <span className="font-mono">{orderId}</span>
                  <span className="mx-1.5">·</span>
                  {cart.length} item{cart.length !== 1 && 's'}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2.5">
                <div className="inline-flex h-9 items-center rounded-[10px] bg-fill-strong p-[3px]" role="tablist" aria-label="Sale type">
                  {(['RETAIL', 'WHOLESALE', 'TRANSFER'] as const)
                    .filter((mode) => {
                      if (mode === 'RETAIL' && !enableRetail) return false;
                      if (mode === 'WHOLESALE' && !enableWholesale) return false;
                      return true;
                    })
                    .map((mode) => (
                    <button
                      key={mode}
                      role="tab"
                      aria-selected={saleType === mode}
                      onClick={() => setSaleType(mode)}
                      className={`h-full rounded-[8px] px-3 text-[13px] transition-[background-color,box-shadow] duration-200 ${saleType === mode ? 'bg-surface font-semibold text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.12)]' : 'font-medium text-muted-foreground hover:text-foreground'}`}
                    >
                      {saleTypeLabels[mode]}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={openMedicineSearch}
                  className="inline-flex h-9 items-center gap-2 rounded-full bg-primary pl-3.5 pr-2 text-[13px] font-semibold text-primary-foreground transition-[background-color,transform] duration-200 hover:bg-primary-hover active:scale-[0.97]"
                >
                  <Search className="h-4 w-4 stroke-[2]" />
                  Add medicine
                  <span className="rounded-full bg-black/15 px-1.5 py-px text-[11px] font-medium">F2</span>
                </button>
              </div>
            </div>

            <div className="no-scrollbar min-h-[30vh] flex-1 overflow-y-auto px-5">
              {cart.length === 0 ? (
                <div className="flex h-full min-h-[340px] flex-col items-center justify-center pb-10 text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                    <ShoppingBag className="h-7 w-7 stroke-[1.5] text-primary" />
                  </div>
                  <p className="text-title-3 text-foreground">No items yet</p>
                  <p className="mt-1 text-callout text-muted-foreground">Search or scan a medicine to start this bill.</p>
                  <button
                    type="button"
                    onClick={openMedicineSearch}
                    className="mt-5 inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-[14px] font-semibold text-primary-foreground transition-[background-color,transform] duration-200 hover:bg-primary-hover active:scale-[0.97]"
                  >
                    <Search className="h-4 w-4 stroke-[2]" />
                    Add medicine
                  </button>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {cart.map((item, index) => (
                  <li key={`${item.batchId}-${index}`} className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="truncate text-headline text-foreground">{item.medicineName}</h3>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <CartBatchSelect
                            medicineId={item.medicineId}
                            value={item.batchId}
                            fallbackLabel={batchLabel(item)}
                            onChange={(batch) => changeCartItemBatch(index, batch)}
                          />
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">₹{getItemUnitPrice(item).toFixed(2)} / unit</span>
                          <span title="GST is set on the medicine" className="rounded-full bg-fill-strong px-2 py-0.5 text-[11px] font-medium text-muted-foreground">GST {item.gstPercent}%</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-start gap-3">
                        <span className="pt-0.5 text-title-3 font-semibold tabular-nums text-foreground">₹{item.amount.toFixed(2)}</span>
                        <button
                          onClick={() => removeFromCart(index)}
                          aria-label={`Remove ${item.medicineName}`}
                          className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-fill text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                        >
                          <X className="h-3.5 w-3.5 stroke-[2.25]" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2.5">
                      <div className="flex h-9 items-center rounded-full bg-fill p-0.5">
                        <button
                          onClick={() => updateCartItemQuantity(index, item.quantity - 1)}
                          aria-label="Decrease quantity"
                          className="flex h-8 w-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface"
                        >
                          <Minus className="h-3.5 w-3.5 stroke-[2.25]" />
                        </button>
                        <input
                          className="w-12 border-none bg-transparent p-0 text-center text-[14px] font-semibold tabular-nums text-foreground focus:ring-0"
                          type="number"
                          aria-label="Quantity"
                          value={item.quantity}
                          onChange={(e) => updateCartItemQuantity(index, parseInt(e.target.value, 10) || 1)}
                        />
                        <button
                          onClick={() => updateCartItemQuantity(index, item.quantity + 1)}
                          aria-label="Increase quantity"
                          className="flex h-8 w-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface"
                        >
                          <Plus className="h-3.5 w-3.5 stroke-[2.25]" />
                        </button>
                      </div>
                      {allowDiscounts && (
                      <div className="flex h-9 items-center rounded-full bg-fill pl-1 pr-3">
                        <button
                          onClick={() => setDiscountMode(m => m === 'percent' ? 'flat' : 'percent')}
                          title="Switch between % and ₹ discount"
                          className="h-7 min-w-[28px] rounded-full bg-surface px-2 text-[12px] font-semibold text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                        >
                          {discountMode === 'percent' ? '%' : '₹'}
                        </button>
                        <span className="ml-2 text-[12px] text-muted-foreground">Discount</span>
                        <input
                          className="ml-1 w-16 border-none bg-transparent p-0 text-right text-[14px] font-semibold tabular-nums text-foreground focus:ring-0"
                          type="number" min="0" max={discountMode === 'percent' ? "100" : undefined}
                          aria-label="Discount"
                          value={discountMode === 'percent' ? (item.discountPercent || 0) : item.discount}
                          onChange={(e) => updateCartItemDiscount(index, parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      )}
                    </div>
                  </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-between border-t border-border px-5 py-3 text-[12px] text-muted-foreground">
              <span className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${scannerActive ? 'bg-primary' : 'bg-fill-strong'}`} />
                {scannerActive ? 'Scanning…' : 'Scanner ready'}
              </span>
              <ScanBarcode className={`h-5 w-5 stroke-[1.5] ${scannerActive ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
          </section>
        </div>

        {/* Checkout */}
        <div className="col-span-12 flex flex-col pb-4 lg:col-span-4 lg:h-full lg:overflow-hidden lg:pb-0">
          <section className="no-scrollbar flex flex-1 flex-col rounded-card bg-surface shadow-card lg:overflow-y-auto">
            {/* Customer */}
            <div className="shrink-0 px-5 pb-4 pt-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-headline text-foreground">Customer</h2>
                {customerInfoExpanded ? (
                  <button type="button" onClick={() => setCustomerInfoExpanded(false)} className="text-[13px] font-medium text-primary">
                    Done
                  </button>
                ) : hasCustomerInfo ? (
                  <button type="button" onClick={() => setCustomerInfoExpanded(true)} className="text-[13px] font-medium text-primary">
                    Edit
                  </button>
                ) : null}
              </div>

              {customerInfoExpanded ? (
                <div className="space-y-2">
                  <div className={fieldWrap}>
                    <User className={fieldIcon} />
                    <input className={`${field} uppercase placeholder:normal-case`} type="text" placeholder="Customer name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                  </div>
                  <div className={fieldWrap}>
                    <Smartphone className={fieldIcon} />
                    <input className={field} type="text" placeholder="Phone (optional)" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
                  </div>
                  <div className={fieldWrap}>
                    <MapPin className={fieldIcon} />
                    <input className={field} type="text" placeholder="Address (optional)" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} />
                  </div>
                  <p className="pt-2 text-footnote font-medium text-muted-foreground">Business details (optional)</p>
                  <div className={fieldWrap}>
                    <ReceiptText className={fieldIcon} />
                    <input className={`${field} font-mono uppercase placeholder:font-sans placeholder:normal-case`} type="text" placeholder="GSTIN" value={customerGstin} onChange={(e) => setCustomerGstin(e.target.value)} />
                  </div>
                  <div className={fieldWrap}>
                    <Pill className={fieldIcon} />
                    <input className={`${field} font-mono placeholder:font-sans`} type="text" placeholder="Drug licence no." value={customerDrugLicense} onChange={(e) => setCustomerDrugLicense(e.target.value)} />
                  </div>
                  <div className={fieldWrap}>
                    <IdCard className={fieldIcon} />
                    <input className={`${field} font-mono uppercase placeholder:font-sans placeholder:normal-case`} type="text" placeholder="PAN" value={customerPan} onChange={(e) => setCustomerPan(e.target.value)} />
                  </div>
                  <button type="button" onClick={() => setCustomerInfoExpanded(false)} className="mt-1 h-9 w-full rounded-full bg-primary text-[13px] font-semibold text-primary-foreground transition-[background-color,transform] duration-200 hover:bg-primary-hover active:scale-[0.97]">
                    Save customer
                  </button>
                </div>
              ) : hasCustomerInfo ? (
                <div className="rounded-xl bg-fill px-3.5 py-3">
                  {customerName.trim() && customerName.trim() !== 'Walk-in Customer' && <p className="text-[14px] font-semibold text-foreground">{customerName}</p>}
                  {customerPhone.trim() && <p className="text-[13px] text-muted-foreground">{customerPhone}</p>}
                  {customerAddress.trim() && <p className="text-[13px] text-muted-foreground">{customerAddress}</p>}
                  {customerGstin.trim() && <p className="mt-1 font-mono text-[12px] text-muted-foreground">GSTIN {customerGstin}</p>}
                  {customerDrugLicense.trim() && <p className="font-mono text-[12px] text-muted-foreground">DL {customerDrugLicense}</p>}
                  {customerPan.trim() && <p className="font-mono text-[12px] text-muted-foreground">PAN {customerPan}</p>}
                </div>
              ) : (
                <button type="button" onClick={() => setCustomerInfoExpanded(true)} className="flex h-11 w-full items-center gap-2.5 rounded-xl bg-fill px-3.5 text-left text-[14px] font-medium text-primary transition-colors hover:bg-fill-strong">
                  <Plus className="h-4 w-4 stroke-[2.25]" />
                  Add customer
                  <span className="ml-auto text-[12px] font-normal text-muted-foreground">Walk-in</span>
                </button>
              )}
            </div>

            {/* Summary */}
            <div className="sticky top-0 z-10 shrink-0 border-t border-border bg-surface px-5 py-4">
              <dl className="space-y-2 text-[14px]">
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Total MRP</dt>
                  <dd className="tabular-nums text-foreground">₹{totalMrp.toFixed(2)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="tabular-nums text-foreground">₹{totals.subtotal.toFixed(2)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Taxes</dt>
                  <dd className="tabular-nums text-foreground">₹{totals.gstTotal.toFixed(2)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Discount</dt>
                  <dd className={`tabular-nums ${totals.discountTotal > 0 ? 'text-danger' : 'text-foreground'}`}>−₹{totals.discountTotal.toFixed(2)}</dd>
                </div>
              </dl>
              <div className="mt-4 flex items-end justify-between border-t border-border pt-4">
                <span className="pb-1 text-[14px] font-medium text-muted-foreground">Total</span>
                <span className="text-[34px] font-bold leading-none tracking-[-0.03em] tabular-nums text-foreground">₹{totals.grandTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Payment */}
            <div className="shrink-0 border-t border-border px-5 py-4">
              <p className="mb-2.5 text-footnote font-medium text-muted-foreground">Payment</p>
              <div className="grid grid-cols-4 gap-1 rounded-xl bg-fill-strong p-[3px]" role="tablist" aria-label="Payment mode">
                {(['CASH', 'CARD', 'UPI', 'CREDIT'] as const).map(mode => {
                  const Icon = paymentIcons[mode];
                  return (
                    <button
                      key={mode}
                      role="tab"
                      aria-selected={paymentMode === mode}
                      onClick={() => setPaymentMode(mode)}
                      className={`flex flex-col items-center justify-center gap-1 rounded-[9px] py-2 transition-[background-color,box-shadow,color] duration-200 ${paymentMode === mode ? 'bg-surface text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.12)]' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      <Icon className={`h-[18px] w-[18px] stroke-[1.75] ${paymentMode === mode ? 'text-primary' : ''}`} />
                      <span className="text-[12px] font-medium">{paymentLabels[mode]}</span>
                    </button>
                  );
                })}
              </div>

              {paymentMode === 'CASH' && (
                <div className="mt-4">
                  <label className="mb-1.5 flex items-center justify-between text-footnote font-medium text-muted-foreground">
                    <span>Cash received</span>
                    <span className={kbd}>F7</span>
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] text-muted-foreground">₹</span>
                    <input type="number" value={receivedAmount || ''} onChange={(e) => setReceivedAmount(parseFloat(e.target.value) || 0)} ref={receivedAmountRef} placeholder="0.00" className="h-11 w-full rounded-control border border-transparent bg-fill pl-8 pr-3 text-[17px] font-semibold tabular-nums text-foreground placeholder:text-label-tertiary transition-[background-color,border-color,box-shadow] duration-200 focus:border-primary/60 focus:bg-surface focus:outline-none focus:ring-[3px] focus:ring-primary/25" />
                  </div>
                </div>
              )}
              <div className="mt-3 flex items-center justify-between rounded-xl bg-fill px-3.5 py-3">
                <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <ArrowLeftRight className="h-4 w-4 stroke-[1.75]" />
                  Change to return
                </span>
                <span className={`text-title-3 font-semibold tabular-nums ${balance >= 0 ? 'text-foreground' : 'text-danger'}`}>₹{(paymentMode === 'CASH' ? balance : 0).toFixed(2)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-auto shrink-0 space-y-1.5 border-t border-border px-5 pb-5 pt-4">
              <button onClick={handleCheckout} disabled={loading || cart.length === 0} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-semibold text-primary-foreground transition-[background-color,transform,opacity] duration-200 hover:bg-primary-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-primary">
                <FileText className="h-[18px] w-[18px] stroke-[2]" />
                {loading ? 'Generating…' : 'Generate invoice'}
                {!loading && <span className="rounded-full bg-black/15 px-1.5 py-px text-[11px] font-medium">F12</span>}
              </button>
              <button onClick={resetBill} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-full text-[13px] font-medium text-danger transition-colors hover:bg-danger/10">
                <Trash2 className="h-4 w-4 stroke-[1.75]" /> Clear bill
              </button>
            </div>
          </section>
        </div>
      </main>

      <Dialog open={isMedicineSearchOpen} onOpenChange={setIsMedicineSearchOpen}>
        <DialogContent className="max-h-[85vh] w-[calc(100vw-1.5rem)] max-w-2xl gap-0 overflow-hidden p-0 sm:w-full">
          <DialogHeader className="sr-only">
            <DialogTitle>Add medicine</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 border-b border-border p-4">
            <div className="flex h-12 items-center gap-3 rounded-xl bg-fill px-4 pr-12">
              <Search className="h-5 w-5 shrink-0 stroke-[1.75] text-muted-foreground" />
              <input
                className="flex-1 border-none bg-transparent p-0 text-[17px] text-foreground placeholder:text-label-tertiary focus:ring-0"
                placeholder="Search medicine, SKU or barcode"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                ref={searchInputRef}
              />
              <ScanBarcode className={`h-5 w-5 shrink-0 stroke-[1.5] transition-colors duration-200 ${scannerActive ? 'animate-pulse text-primary' : 'text-muted-foreground'}`} />
            </div>

            <div className="flex items-center gap-2">
              <div className="flex h-9 flex-1 items-center gap-2 rounded-full bg-fill pl-3 pr-1">
                <Building2 className="h-4 w-4 shrink-0 stroke-[1.75] text-muted-foreground" />
                <select
                  value={companyFilter}
                  onChange={(e) => setCompanyFilter(e.target.value)}
                  className="min-w-0 flex-1 border-none bg-transparent py-1 text-[13px] font-medium text-foreground focus:ring-0"
                  aria-label="Filter by company"
                >
                  <option value="">All companies</option>
                  {companies.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={clearMedicineSearchFilters}
                className="h-9 rounded-full px-3 text-[13px] font-medium text-primary transition-colors hover:bg-fill"
              >
                Clear
              </button>
            </div>
          </div>

          <section className="flex min-h-[260px] flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between px-5 pb-1 pt-3">
              <h2 className="text-footnote font-medium text-muted-foreground">Results</h2>
              <div className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex">
                <span className={kbd}>↑↓</span> move
                <span className={kbd}>Enter</span> add
                <span className={kbd}>Esc</span> close
              </div>
            </div>
            <div className="no-scrollbar flex flex-1 flex-col overflow-y-auto px-2 pb-2">
              {suggestions.length === 0 ? (
                <div className="my-auto p-8 text-center">
                  <Search className="mx-auto mb-2 h-6 w-6 stroke-[1.5] text-label-tertiary" />
                  <p className="text-[14px] text-muted-foreground">
                    {searchQuery.trim()
                      ? companyFilter
                        ? `No results for "${searchQuery}" in ${companyFilter}.`
                        : 'No matching medicines.'
                      : 'Type to search your stock.'}
                  </p>
                </div>
              ) : (
                suggestions.map((suggestion, index) => (
                  <div
                    key={`${suggestion.batchId}-${index}`}
                    onClick={() => openItemDetailPopup(suggestion)}
                    className={`cursor-pointer rounded-xl px-3 py-2.5 transition-colors duration-150 ${index === activeSuggestionIndex ? 'bg-primary/10' : 'hover:bg-fill'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="truncate text-[15px] font-semibold text-foreground">{suggestion.name}</h4>
                        <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                          {suggestion.company}
                          {suggestion.packing ? ` · ${suggestion.packing}` : ''}
                          {suggestion.rackLocation ? ` · ${suggestion.rackLocation}` : ''}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[15px] font-semibold tabular-nums text-foreground">₹{suggestion.mrp.toFixed(2)}</p>
                        <p className={`mt-0.5 text-[12px] font-medium ${suggestion.stockQty > 0 ? 'text-primary' : 'text-danger'}`}>
                          {suggestion.stockQty > 0 ? `${suggestion.stockQty} in stock` : 'Out of stock'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </DialogContent>
      </Dialog>


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
