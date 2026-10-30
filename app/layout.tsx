import type { Metadata, Viewport } from 'next';
import { Geist_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

// La letra del panel, sans geométrica: Plus Jakarta Sans para todo, con los titulares en
// seminegrita y cifras tabulares donde se alinean. Variable: un solo archivo para todos los pesos
const jakarta = Plus_Jakarta_Sans({
  variable: '--font-jakarta',
  subsets: ['latin', 'latin-ext'],
});

// Solo para código: rutas, ramas, órdenes de git dentro de las notas
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

// La barra del navegador y la de la app, del gris de las islas de cada modo (`--fondo`), que en el
// móvil es el suelo. `colorScheme`: el navegador pinta en oscuro desde el primer momento
export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2f4f7' },
    { media: '(prefers-color-scheme: dark)', color: '#13161c' },
  ],
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es" className={`${jakarta.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
