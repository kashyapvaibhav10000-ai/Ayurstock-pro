import { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'AyurStock Pro - Ayurvedic Pharmacy Management',
  description: 'Complete SaaS solution for Ayurvedic pharmacy operations',
};

export default function HomePage() {
  redirect('/login');
}
