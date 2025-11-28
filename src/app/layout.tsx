import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'BUMC ProPresenter Sync',
  description: 'A Next-Auth v5 template for Microsoft Entra ID authentication',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en'>
      <head>
        <meta name="viewport" content="viewport-fit=cover"></meta>
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
