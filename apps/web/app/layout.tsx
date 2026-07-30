import type { Metadata, Viewport } from 'next';
import { MotionPreference } from '../components/MotionPreference';
import './globals.css';

export const metadata: Metadata = {
  title: 'persona16 — 和不同的人聊聊',
  description: '从一个具体的人开始，再邀请不同的理解方式进入房间。',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'persona16' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body><MotionPreference />{children}</body>
    </html>
  );
}
