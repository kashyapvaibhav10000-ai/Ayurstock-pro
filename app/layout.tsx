import type { Metadata } from 'next';
import './globals.css';
import Providers from './providers';

// Font is now handled through a system font stack in globals.css
// to ensure builds succeed on servers without external internet access.

export const metadata: Metadata = {
  title: 'AyurStock Pro - Management System',
  description: 'Ayurvedic Pharmacy Management System',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased selection:bg-primary/20">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
