'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings } from 'lucide-react';
import { segmento } from '@/components/estilos';

const PESTANAS = [
  { href: '/consultoria', etiqueta: 'Resumen' },
  { href: '/consultoria/clientes', etiqueta: 'Clientes' },
  { href: '/consultoria/produccion', etiqueta: 'Producción' },
  { href: '/consultoria/liquidaciones', etiqueta: 'Liquidaciones' },
] as const;

const activaEn = (ruta: string | null, href: string) =>
  href === '/consultoria' ? ruta === href : ruta === href || Boolean(ruta?.startsWith(`${href}/`));

/**
 * Las pestañas de la sección y el engranaje de Ajustes, en píldora como las de Crear: la elegida,
 * rellena del azul oscuro y en seminegrita. La hucha no tiene pestaña: se abre desde el Resumen y
 * desde Liquidaciones. En el móvil van de dos en dos, en dos filas: en una sola no cabían y
 * «Liquidaciones», la de cada mes, quedaba escondida sin que se notara que había más. Desde `sm`, en
 * una fila, que se desplaza dentro de su barra antes que ensanchar la página.
 */
export default function PestanasConsultoria() {
  const ruta = usePathname();
  const enAjustes = activaEn(ruta, '/consultoria/ajustes');

  return (
    <div className="no-imprimir mb-4 flex items-start gap-2 sm:mb-5 sm:items-center">
      <nav aria-label="Consultoría" className="min-w-0 flex-1 overflow-x-auto rounded-[1.625rem] bg-superficie p-1 sm:flex-none sm:rounded-full">
        <ul className="grid grid-cols-2 gap-1 sm:flex sm:w-max">
          {PESTANAS.map(({ href, etiqueta }) => {
            const activa = activaEn(ruta, href);
            return (
              <li key={href} className="min-w-0">
                <Link href={href} aria-current={activa ? 'page' : undefined} className={`${segmento(activa)} w-full sm:px-5`}>
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
        // Redondo, del alto de la barra de pestañas (52 px); el de Ajustes elegido, relleno como una pestaña
        className={`inline-flex size-[3.25rem] shrink-0 items-center justify-center rounded-full transition-colors ${
          enAjustes ? 'bg-acento-fuerte text-white' : 'bg-superficie text-tenue hover:text-texto'
        }`}
      >
        <Settings className="size-5" aria-hidden />
      </Link>
    </div>
  );
}
