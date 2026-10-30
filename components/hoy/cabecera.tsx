import Link from 'next/link';
import { FileText } from 'lucide-react';
import { BOTON_SECUNDARIO } from '@/components/estilos';
import { TITULO_PANTALLA } from '@/components/ui';
import type { Nota } from '@/lib/boveda/tipos';
import { fechaLarga } from '@/lib/fechas';
import { hrefNota } from '@/lib/rutas';
import { BotonNuevoObjetivo } from './nuevo-objetivo';

/**
 * Lo primero de Hoy, como la fila del título de la referencia: «Hoy» grande y, debajo, la fecha y
 * lo que queda (la respuesta a «¿qué tengo hoy?»). A la derecha, los dos botones en píldora: el
 * principal lleva al campo de añadir un objetivo; el otro abre la diaria
 */
export function CabeceraHoy({ hoy, frase, daily }: { hoy: string; frase: string; daily?: Nota }) {
  const fecha = fechaLarga(hoy);
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 sm:mb-6">
      <div className="min-w-0">
        <h1 className={TITULO_PANTALLA}>Hoy</h1>
        <p className="mt-1.5 text-[15px] text-tenue">
          {fecha.charAt(0).toUpperCase() + fecha.slice(1)}. <span className="font-medium text-texto">{frase}.</span>
        </p>
      </div>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <BotonNuevoObjetivo />
        {daily && (
          <Link href={hrefNota(daily.ruta)} className={`${BOTON_SECUNDARIO} max-sm:flex-1`}>
            <FileText className="size-4" aria-hidden />
            Abrir la diaria
          </Link>
        )}
      </div>
    </header>
  );
}
