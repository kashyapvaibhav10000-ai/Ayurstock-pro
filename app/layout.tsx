import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import Providers from './providers';
import AppPreloader from '@/components/AppPreloader';
import { ACCENT_BOOT_SCRIPT } from '@/lib/accent';

// Font is now handled through a system font stack in globals.css
// to ensure builds succeed on servers without external internet access.

export const metadata: Metadata = {
  title: 'AyurStock Pro - Management System',
  description: 'Ayurvedic Pharmacy Management System',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // CSP nonce from proxy.ts, for next-themes' inline theme script. Reading
  // headers() renders every page per request, which a nonce requires.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased selection:bg-primary/20">
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: ACCENT_BOOT_SCRIPT }} />
        <AppPreloader />
        <Providers nonce={nonce}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
