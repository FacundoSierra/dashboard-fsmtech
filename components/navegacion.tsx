'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SECCIONES = [
  { href: '/', texto: 'Hoy' },
  { href: '/semana', texto: 'Semana' },
  { href: '/clientes', texto: 'Clientes' },
  { href: '/proyectos', texto: 'Proyectos' },
  { href: '/reuniones', texto: 'Reuniones' },
  { href: '/inbox', texto: 'Inbox' },
];

export function Navegacion() {
  const ruta = usePathname();

  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto px-1">
      {SECCIONES.map(({ href, texto }) => {
        const activa = href === '/' ? ruta === '/' : ruta.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={activa ? 'page' : undefined}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
              activa ? 'bg-acento-suave text-acento' : 'text-tenue hover:text-texto'
            }`}
          >
            {texto}
          </Link>
        );
      })}
    </nav>
  );
}
