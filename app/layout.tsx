import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Providers from './providers';
import { Toaster } from 'sonner';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

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
    <html lang="en" className={inter.className}>
      <body className="min-h-screen bg-surface-muted text-text-primary antialiased selection:bg-primary-light selection:text-primary-hover">
        <Providers>
          {children}
          <Toaster richColors position="top-right" />
        </Providers>
      </body>
    </html>
  );
}
