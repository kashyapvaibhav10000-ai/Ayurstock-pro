# Requirements Document

## Introduction

This feature enhances the New Sales (billing/POS) page in AyurStock Pro with two related capabilities:

1. A Company filter for medicine search, so a cashier can narrow search results to a single manufacturer/brand.
2. An Item Detail Popup that opens when a search result is manually selected, showing full inventory-sourced details for the medicine/batch and letting the cashier review or adjust Quantity, GST, and Discount before the item is added to the cart — replacing today's behavior of adding the item to the cart immediately on click.

These changes must coexist with the Billing Page's existing barcode-scanner detection and keyboard-driven exact-match flow without degrading their speed, and must reuse the existing GST Mode (inclusive/exclusive) and Discount Mode (flat/percent) logic already used for cart items rather than introducing a second, conflicting calculation path.

**Current behavior (for reference, confirmed by reading the existing code)**:
- `app/dashboard/billing/page.tsx` debounces the search input (300ms), calls `GET /api/billing/search`, and renders results as a `Search_Suggestion` list. Clicking a suggestion calls `addSuggestionToCart()`, which computes rate/GST/amount and pushes a `CartItem` directly into cart state — no confirmation step exists today.
- `app/api/billing/search/route.ts` queries `InventoryBatch` joined with `Medicine`, filtered to `stockQty > 0` and non-expired batches, and returns `company` as a free-text field on `Medicine` (there is no `companyId` relation on `Medicine`). It does **not** currently accept a company filter parameter, and does **not** currently return the medicine's `hsn` field.
- A separate `Company` model exists (`id`, `shopId`, `name`, `description`) and is upserted whenever a medicine is created/edited, but `Medicine.company` itself remains a plain string, not a foreign key.
- An existing `GET /api/medicines/companies` endpoint already returns distinct company names grouped by shop, but it is restricted to the `ADMIN` role only — this would block `CASHIER`/`MANAGER` users from using a company filter on the Billing Page unless access is broadened.
- The Billing Page already has a working barcode-scanner detection mechanism (rapid-keystroke buffering ending in Enter) and a keyboard exact-match lookup (Enter pressed in the search box with no suggestion list open), both of which call `addSuggestionToCart()` directly today.
- `CartItem`, `GST_Mode` (`inclusive`/`exclusive`), and `Discount_Mode` (`flat`/`percent`) are already defined and used for per-item GST/discount calculation in the cart; this feature must reuse that logic rather than duplicate it.

## Glossary

- **Billing_Page**: The dashboard billing/POS page (`app/dashboard/billing/page.tsx`) where a cashier builds a sale by searching medicines, reviewing cart items, and checking out.
- **Medicine_Search**: The existing search feature on the Billing_Page that queries available inventory batches by medicine name, barcode, or batch number and returns matching results as Search_Suggestions.
- **Search_Suggestion**: A single result row returned by Medicine_Search, representing one billable Inventory_Batch of a Medicine.
- **Company_Filter**: A new control on the Billing_Page that, when set to a specific company, restricts Medicine_Search results to Search_Suggestions whose medicine belongs to that company.
- **Barcode_Scan_Flow**: The existing keyboard-based detection mechanism that recognizes rapid keystrokes ending in Enter as scanner input and resolves it to a matching Search_Suggestion.
- **Exact_Match_Lookup**: The existing behavior triggered by pressing Enter in the Medicine_Search input when no Search_Suggestion list is currently displayed, which looks up an exact barcode or batch number match.
- **Item_Detail_Popup**: The new modal dialog that opens when a user manually selects a Search_Suggestion (by click, or by pressing Enter while a suggestion is highlighted in the results list). It displays Inventory-sourced details for that batch and lets the user review/adjust Quantity, GST_Percent, and Discount before confirming.
- **Cart**: The in-progress list of CartItem entries for the current sale.
- **CartItem**: The existing data structure (defined in `types/index.ts`) representing one line item in the Cart.
- **Medicine**: The existing `Medicine` database record (name, company, category, HSN, GST percent, etc.).
- **Inventory_Batch**: The existing `InventoryBatch` database record for a specific batch of a Medicine (batch number, expiry date, stock quantity, MRP, rates, rack location).
- **GST_Mode**: The existing Billing_Page setting, either `inclusive` or `exclusive`, governing how GST is calculated for a cart item.
- **Discount_Mode**: The existing Billing_Page setting, either `flat` or `percent`, governing how a discount value is interpreted for a cart item.
- **Mobile_Viewport**: A browser viewport narrower than the Billing_Page's existing "tablet" breakpoint, consistent with the responsive breakpoints already used elsewhere on the Billing_Page.
- **Desktop_Viewport**: A browser viewport at or above the Billing_Page's existing "desktop" breakpoint, consistent with the responsive breakpoints already used elsewhere on the Billing_Page.

## Requirements

### Requirement 1: Company Filter Control

**User Story:** As a cashier, I want to filter medicine search results by company, so that I can quickly locate items from a specific manufacturer/brand while billing.

#### Acceptance Criteria

1. THE Billing_Page SHALL display a Company_Filter control adjacent to the Medicine_Search input.
2. WHEN the Billing_Page loads, THE Company_Filter SHALL default to a state that applies no company restriction ("All Companies").
3. THE Company_Filter SHALL list distinct company names sourced from Medicine records belonging to the current shop.
4. THE Billing_Page SHALL make the Company_Filter's company list available to every user role permitted to access the Billing_Page.
5. WHEN a user selects a company from the Company_Filter, THE Billing_Page SHALL apply that company as an active filter for subsequent Medicine_Search queries.
6. WHEN a user selects "All Companies" from the Company_Filter, THE Billing_Page SHALL remove the active company filter from subsequent Medicine_Search queries.

### Requirement 2: Company-Scoped Search Results

**User Story:** As a cashier, I want search results limited to the selected company when a company filter is active, so that I do not have to scan through irrelevant results from other manufacturers.

#### Acceptance Criteria

1. WHILE a Company_Filter is active, THE Medicine_Search SHALL return only Search_Suggestions whose medicine's company matches the active Company_Filter.
2. WHEN a user changes the Company_Filter to a different company while search text is present, THE Medicine_Search SHALL re-query and display Search_Suggestions for the newly selected company using the current search text.
3. IF a Company_Filter is active and no Search_Suggestion matches the current search text within the selected company, THEN THE Medicine_Search SHALL return zero Search_Suggestions and THE Billing_Page SHALL display an empty-results state.

### Requirement 3: Company Filter Interaction with Barcode and Exact-Match Flows

**User Story:** As a cashier, I want barcode scanning and keyboard exact-match entry to keep working at full speed even when a company filter is active, so that the filter never slows down checkout.

#### Acceptance Criteria

1. WHILE a Company_Filter is active, THE Barcode_Scan_Flow SHALL resolve scanned input to its matching Search_Suggestion regardless of the active Company_Filter.
2. WHILE a Company_Filter is active, THE Exact_Match_Lookup SHALL resolve an exact barcode or batch number match regardless of the active Company_Filter.
3. WHEN the Barcode_Scan_Flow resolves scanned input to exactly one Search_Suggestion, THE Billing_Page SHALL attempt to add that Search_Suggestion to the Cart directly, and SHALL NOT open the Item_Detail_Popup, regardless of whether the direct addition succeeds or fails.
4. WHEN the Exact_Match_Lookup resolves to exactly one Search_Suggestion, THE Billing_Page SHALL attempt to add that Search_Suggestion to the Cart directly, and SHALL NOT open the Item_Detail_Popup, regardless of whether the direct addition succeeds or fails.

### Requirement 4: Item Detail Popup on Manual Selection

**User Story:** As a cashier, I want to review full medicine/batch details in a popup after manually selecting a search result, so that I can confirm I am billing the correct item before it is added to the cart.

#### Acceptance Criteria

1. WHEN a user selects a Search_Suggestion by clicking it, or by pressing Enter while a Search_Suggestion is highlighted in the results list, THE Billing_Page SHALL open the Item_Detail_Popup for that Search_Suggestion instead of adding it directly to the Cart.
2. WHEN the Item_Detail_Popup opens, THE Item_Detail_Popup SHALL display the medicine name and company of the selected Search_Suggestion.
3. IF a user triggers the cancel action on the Item_Detail_Popup, THEN THE Billing_Page SHALL close the Item_Detail_Popup and leave the Cart unchanged.
4. WHEN a user triggers the confirm action on the Item_Detail_Popup, THE Billing_Page SHALL add one CartItem to the Cart using the reviewed Quantity, GST_Percent, and Discount values from the Item_Detail_Popup.
5. WHEN the Item_Detail_Popup closes after a confirm or cancel action, THE Billing_Page SHALL clear the Medicine_Search input and Search_Suggestions.

### Requirement 5: Item Detail Popup Data Sourced from Inventory

**User Story:** As a cashier, I want every value shown in the item detail popup to come directly from current inventory records, so that I can trust the information when billing a customer.

#### Acceptance Criteria

1. THE Item_Detail_Popup SHALL display the batch number, expiry date, MRP, selling rate, available stock quantity, rack location, GST percent, and HSN code for the selected Search_Suggestion.
2. THE Billing_Page SHALL populate every value listed in Requirement 5.1 from the Medicine and Inventory_Batch records associated with the selected Search_Suggestion.
3. WHEN the Item_Detail_Popup opens, THE Billing_Page SHALL use stock quantity and rate values current as of the most recent Medicine_Search query for that Search_Suggestion.

### Requirement 6: Responsive Layout of the Item Detail Popup

**User Story:** As a cashier using different devices, I want the item detail popup to display correctly on my phone, tablet, or desktop, so that I can complete billing from any device.

#### Acceptance Criteria

1. WHERE the Billing_Page is displayed on a Mobile_Viewport, THE Item_Detail_Popup SHALL occupy the full screen.
2. WHERE the Billing_Page is displayed on a tablet or Desktop_Viewport, THE Item_Detail_Popup SHALL display as a centered dialog constrained to the viewport height, scrolling its own content internally rather than expanding beyond or falling back to a full-screen layout.
3. WHILE the Item_Detail_Popup is open, THE Item_Detail_Popup SHALL keep its confirm and cancel actions visible without requiring the user to scroll, regardless of viewport size.

### Requirement 7: Editable Fields in the Item Detail Popup

**User Story:** As a cashier, I want to adjust quantity, GST, and discount in the popup before confirming, so that I can bill exactly what the customer is purchasing.

#### Acceptance Criteria

1. THE Item_Detail_Popup SHALL provide an editable Quantity field, initialized to 1.
2. THE Item_Detail_Popup SHALL provide an editable GST_Percent field, initialized to the GST percent from the Medicine record of the selected Search_Suggestion.
3. THE Item_Detail_Popup SHALL provide an editable Discount field, initialized to zero.
4. WHILE the Discount_Mode is "percent", THE Item_Detail_Popup SHALL treat the Discount field value as a percentage of the item's extended price.
5. WHILE the Discount_Mode is "flat", THE Item_Detail_Popup SHALL treat the Discount field value as a currency amount.
6. WHILE the GST_Mode is "inclusive", THE Item_Detail_Popup SHALL calculate the GST amount and item amount using the same inclusive-GST formula the Cart uses for existing items.
7. WHILE the GST_Mode is "exclusive", THE Item_Detail_Popup SHALL calculate the GST amount and item amount using the same exclusive-GST formula the Cart uses for existing items.
8. WHEN a user edits the Quantity, GST_Percent, or Discount field in the Item_Detail_Popup, THE Item_Detail_Popup SHALL recalculate the item amount using the current GST_Mode and Discount_Mode.

### Requirement 8: Validation in the Item Detail Popup

**User Story:** As a cashier, I want the popup to prevent invalid quantity, GST, or discount entries, so that I do not accidentally create an incorrect bill.

#### Acceptance Criteria

1. IF a user enters a Quantity less than 1, THEN THE Item_Detail_Popup SHALL reject the entry and retain the last valid Quantity value.
2. WHEN a user enters a Quantity value, THE Item_Detail_Popup SHALL validate that Quantity against the available stock quantity of the selected Search_Suggestion before accepting the entry.
3. IF a user enters a Quantity greater than the available stock quantity of the selected Search_Suggestion, THEN THE Item_Detail_Popup SHALL disable the confirm action and display a message stating the maximum available quantity.
4. IF the available stock quantity of the selected Search_Suggestion is zero or negative, THEN THE Item_Detail_Popup SHALL disable the confirm action and display an out-of-stock message.
5. IF a user enters a Discount value that would produce a negative item amount, THEN THE Item_Detail_Popup SHALL disable the confirm action and display a validation message.
6. IF the selected Search_Suggestion's expiry date is earlier than the current date when the Item_Detail_Popup opens, THEN THE Item_Detail_Popup SHALL disable the confirm action and display an expired-batch message.

### Requirement 9: Cart Integration Consistency

**User Story:** As a cashier, I want items added via the popup to look and behave the same as items added through existing flows, so that the rest of billing (totals, editing, checkout) keeps working without changes.

#### Acceptance Criteria

1. WHEN the Item_Detail_Popup's confirm action adds an item, THE Billing_Page SHALL append a CartItem to the Cart using the same CartItem structure produced by the existing direct-add flow.
2. THE Billing_Page SHALL recalculate Cart totals after a CartItem is added via the Item_Detail_Popup, using the existing totals calculation logic.
3. THE Billing_Page SHALL allow a CartItem added via the Item_Detail_Popup to be edited afterward through the existing per-item quantity, discount, and GST controls in the Cart.

---

## Approved Enhancements (Promoted from Suggestions)

The user approved all previously-suggested enhancements. These are now committed requirements.

### Requirement 10: Multi-Batch Picker

**User Story:** As a cashier, I want to override FEFO and pick a specific batch when a medicine has more than one batch in stock, so that I can bill from a batch other than the earliest-expiring one when needed.

#### Acceptance Criteria

1. WHEN the Item_Detail_Popup opens for a Search_Suggestion whose medicine has more than one non-expired Inventory_Batch in stock, THE Item_Detail_Popup SHALL display a batch selector reusing the existing `BatchSelectionModal` pattern.
2. WHEN a user selects a different batch in the batch selector, THE Item_Detail_Popup SHALL re-populate batch number, expiry date, MRP, selling rate, available stock quantity, and rack location from the newly selected Inventory_Batch.
3. IF a medicine has exactly one non-expired Inventory_Batch in stock, THEN THE Item_Detail_Popup SHALL NOT display a batch selector.

### Requirement 11: Near-Expiry Warning Badge

**User Story:** As a cashier, I want to see a visible warning when a batch is close to expiry, so that I can decide whether to sell it or check with the customer.

#### Acceptance Criteria

1. THE Item_Detail_Popup SHALL display a near-expiry warning badge WHEN the selected Inventory_Batch's expiry date falls within the shop's configured `nearExpiryDays` setting from the current date.
2. THE Item_Detail_Popup SHALL NOT display the near-expiry warning badge WHEN the selected Inventory_Batch's expiry date falls outside the shop's configured `nearExpiryDays` window.

### Requirement 12: Live Subtotal Preview

**User Story:** As a cashier, I want to see the calculated item amount update live as I edit quantity, GST, or discount, so that I can confirm the price before adding to cart.

#### Acceptance Criteria

1. THE Item_Detail_Popup SHALL display the calculated item amount, visibly labeled, at all times while the popup is open.
2. WHEN Quantity, GST_Percent, or Discount changes in the Item_Detail_Popup, THE Item_Detail_Popup SHALL update the displayed item amount without requiring a page refresh or additional user action.

### Requirement 13: Stock Availability Badge

**User Story:** As a cashier, I want a clear visual indicator of low stock in the popup, so that I notice constrained availability before confirming a large quantity.

#### Acceptance Criteria

1. THE Item_Detail_Popup SHALL display a stock availability badge showing the available stock quantity of the selected Inventory_Batch.
2. WHEN the available stock quantity of the selected Inventory_Batch is at or below the shop's configured low-stock threshold, THE Item_Detail_Popup SHALL display the stock availability badge in a visually distinct low-stock style.

### Requirement 14: Popup Keyboard Shortcuts

**User Story:** As a cashier, I want to confirm or cancel the popup using the keyboard, so that billing stays fast and keyboard-driven.

#### Acceptance Criteria

1. WHILE the Item_Detail_Popup is open and focus is not inside a field that requires Enter for its own purpose (e.g. a batch selector awaiting selection), pressing Enter SHALL trigger the confirm action if the confirm action is enabled.
2. WHILE the Item_Detail_Popup is open, pressing Escape SHALL trigger the cancel action.

### Requirement 15: Persisted Discount Mode

**User Story:** As a cashier, I want my last-used discount mode remembered, so that I don't have to reselect it every time I open the popup.

#### Acceptance Criteria

1. WHEN a user changes the Discount_Mode while using the Item_Detail_Popup, THE Billing_Page SHALL persist the selected Discount_Mode to browser local storage.
2. WHEN the Billing_Page loads, THE Billing_Page SHALL initialize Discount_Mode from the persisted value in browser local storage if one exists.

### Requirement 16: Persisted Company Filter

**User Story:** As a cashier, I want my last-selected company filter remembered, so that I don't have to reselect it after a page reload within the same session.

#### Acceptance Criteria

1. WHEN a user changes the Company_Filter, THE Billing_Page SHALL persist the selected company to browser local storage.
2. WHEN the Billing_Page loads, THE Billing_Page SHALL initialize the Company_Filter from the persisted value in browser local storage if one exists and still refers to a valid company; otherwise THE Company_Filter SHALL default to "All Companies".
