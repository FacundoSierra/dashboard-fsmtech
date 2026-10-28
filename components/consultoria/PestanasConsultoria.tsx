'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings } from 'lucide-react';

const PESTANAS = [
  { href: '/consultoria', etiqueta: 'Resumen' },
  { href: '/consultoria/clientes', etiqueta: 'Clientes' },
  { href: '/consultoria/produccion', etiqueta: 'Producción' },
  { href: '/consultoria/liquidaciones', etiqueta: 'Liquidaciones' },
] as const;

const activaEn = (ruta: string | null, href: string) =>
  href === '/consultoria' ? ruta === href : ruta === href || Boolean(ruta?.startsWith(`${href}/`));

/**
 * Las pestañas de la sección y el engranaje de Ajustes. La hucha no tiene pestaña: se abre desde
 * el Resumen y desde Liquidaciones. En el móvil van de dos en dos, en dos filas: en una sola no
 * cabían y «Liquidaciones», la de cada mes, quedaba escondida sin que se notara que había más.
 * Desde `sm`, en una fila, que se desplaza dentro de su barra antes que ensanchar la página.
 */
export default function PestanasConsultoria() {
  const ruta = usePathname();
  const enAjustes = activaEn(ruta, '/consultoria/ajustes');

  return (
    <div className="no-imprimir mb-5 flex items-stretch gap-2 sm:items-center">
      <nav aria-label="Consultoría" className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-borde bg-superficie p-1 shadow-tarjeta">
        <ul className="grid grid-cols-2 gap-1 sm:flex sm:w-max sm:min-w-full">
          {PESTANAS.map(({ href, etiqueta }) => {
            const activa = activaEn(ruta, href);
            return (
              <li key={href} className="min-w-0 sm:flex-1">
                <Link
                  href={href}
                  aria-current={activa ? 'page' : undefined}
                  className={`flex min-h-11 items-center justify-center rounded-lg px-2 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-acento sm:px-4 ${
                    activa ? 'bg-acento-suave text-acento' : 'text-tenue hover:bg-superficie-2 hover:text-texto'
                  }`}
                >
                  {etiqueta}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <Link
        href="/consultoria/ajustes"
        aria-label="Ajustes de la consultoría"
        title="Ajustes"
        aria-current={enAjustes ? 'page' : undefined}
        className={`grid w-[54px] shrink-0 place-items-center rounded-xl border shadow-tarjeta transition-colors focus-visible:outline-2 focus-visible:outline-acento sm:h-[54px] ${
          enAjustes ? 'border-acento bg-acento-suave text-acento' : 'border-borde bg-superficie text-tenue hover:text-texto'
        }`}
      >
        <Settings className="size-5" aria-hidden />
      </Link>
    </div>
  );
}
