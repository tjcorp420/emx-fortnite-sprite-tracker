import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'EMX Fortnite Sprite Tracker',
  description: 'Track owned and mastered Fortnite Sprites with EMX.',
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = { themeColor: '#08080d', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
