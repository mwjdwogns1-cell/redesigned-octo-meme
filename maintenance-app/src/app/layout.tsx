import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { AuthProvider } from '@/lib/auth';

export const metadata: Metadata = {
  title: '매장 유지보수',
  description: '매장 단순 유지보수 점검·연간계획',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: '매장 유지보수', statusBarStyle: 'default' },
  icons: { icon: '/icon.svg', apple: '/icon-192.png' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#1428A0' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
