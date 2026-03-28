# Settings Restructure & Dark Mode Implementation

Modernize the settings interface and implement a premium 'Soft Black and Gold' dark mode.

## 1. Settings Restructure
- [x] Move **Invoices** tab from General to Billing group
- [x] Move **Preferences** tab from Advanced to General group
- [x] Verify sidebar navigation and tab switching still work correctly

## 2. Dark Mode Infrastructure
- [x] Install `next-themes` and wrap the app in `ThemeProvider`
- [x] Configure Tailwind for `darkMode: 'class'`
- [x] Define 'Soft Black and Gold' theme in `globals.css`
  - Background: #0A0A0A (Soft Black)
  - Surface/Cards: #1A1A1A
  - Primary/Accent: #D4AF37 (Gold)
- [x] Add print-safety media query to ensure invoices print in light mode

## 3. Dark Mode Functionality
- [x] Make the Dark Mode toggle in Preferences tab functional using `useTheme`
- [x] Ensure theme persists across page reloads
- [x] Verify compatibility of all core components:
  - [x] Login page
  - [x] Sidebar navigation
  - [x] Dashboard Header & Profile panel
  - [x] Modals and Dialogs
  - [x] Toasts (Sonner)
- [x] Verify mobile view compatibility (Hamburger menu, bottom nav)
- [x] Set Dark Mode as default theme in `Providers`
- [x] Verify Light Mode aesthetics (White & Green) are preserved
- [x] Eliminate white elements (logo discs) from Login page for full Black & Gold immersion
