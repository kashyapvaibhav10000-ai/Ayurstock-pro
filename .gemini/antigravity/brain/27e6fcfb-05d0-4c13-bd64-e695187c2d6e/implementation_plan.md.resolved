# Login Page Theme Alignment

The login page currently displays in light mode by default, causing a jarring user experience that conflicts with the "Soft Black & Gold" requirement. This plan forces dark mode on the login page and aligns all visual elements with the premium gold aesthetic.

## Proposed Changes

### [LoginPage](file:///c:/Users/vaibh/Documents/Ayur-stock%20pro/app/login/page.tsx)
-   **Force Dark Mode**: Wrap the entire component in a `<div className="dark">` to ensure theme-aware variables resolve to dark mode values regardless of system settings.
-   **Background Refinement**: Ensure the right panel uses `bg-background` (which is `#0A0A0A` in dark mode).
-   **Accent Standardization**:
    -   Replace all remaining green-tinted backgrounds/icons with gold accents.
    -   Update the "Sign in" button to use the gold primary color.
-   **Logo & Glassmorphism**: Refine the logo container and glassmorphism cards to feel more premium and less "flat".

## Verification Plan

### Manual Verification
-   Open the login page and verify it is fully dark.
-   Check that all buttons and icons use the gold color (#D4AF37) and NOT green.
-   Verify mobile responsiveness and visibility.
