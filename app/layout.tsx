import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: { default: 'Dashboard FSMTECH', template: '%s · Dashboard FSMTECH' },
  description: 'Panel privado de clientes, proyectos y objetivos',
  applicationName: 'Dashboard FSMTECH',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'FSMTECH', statusBarStyle: 'default' },
};

// La barra del navegador y la de la app, del color del fondo de cada modo (`--fondo`). `colorScheme`:
// el navegador pinta en oscuro desde el primer momento, antes de que llegue el CSS
export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f5f3' },
    { media: '(prefers-color-scheme: dark)', color: '#0e0e0d' },
  ],
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
