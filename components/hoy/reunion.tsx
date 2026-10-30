import Link from 'next/link';
import { CalendarPlus, FileText } from 'lucide-react';
import { BOTON_PRINCIPAL } from '@/components/estilos';
import { Tarjeta } from '@/components/ui';
import type { ResumenReunion } from '@/lib/boveda/consultas';
import { fechaLarga } from '@/lib/fechas';
import { hrefNota } from '@/lib/rutas';

/**
 * El recordatorio, como «Reminders» en la referencia: la reunión de hoy (o, si hoy no hay, la
 * siguiente), con su título grande en el azul de la marca, cuándo es y un botón en píldora para
 * abrir su nota. Si no hay ninguna prevista, lo dice y ofrece apuntar una
 */
export function Recordatorio({ reuniones, hoy }: { reuniones: ResumenReunion[]; hoy: string }) {
  const [siguiente] = reuniones;
  const deHoy = siguiente?.fecha === hoy;
  const otrasHoy = reuniones.filter((r) => r.fecha === hoy).length - 1;

  return (
    <Tarjeta titulo={deHoy ? 'Reunión de hoy' : 'Próxima reunión'} estirar>
      {siguiente ? (
        <div className="flex flex-1 flex-col">
          <p className="line-clamp-3 text-xl font-semibold leading-snug tracking-[-0.02em] text-acento sm:text-[22px]">{siguiente.nota.titulo}</p>
          <p className="mt-2 text-sm text-tenue first-letter:uppercase">
            {deHoy ? 'Hoy' : siguiente.fecha ? fechaLarga(siguiente.fecha) : 'Sin fecha'}
            {siguiente.hora ? `, a las ${siguiente.hora}` : ''}
            {deHoy && otrasHoy > 0 && ` · y ${otrasHoy} más hoy`}
          </p>
          <span aria-hidden className="block min-h-5 flex-1" />
          <Link href={hrefNota(siguiente.nota.ruta)} className={`${BOTON_PRINCIPAL} w-full`}>
            <FileText className="size-4" aria-hidden />
            Abrir la nota
          </Link>
        </div>
      ) : (
        <div className="flex flex-1 flex-col">
          <p className="text-xl font-semibold leading-snug tracking-[-0.02em] text-acento sm:text-[22px]">No hay reuniones previstas</p>
          <p className="mt-2 text-sm text-tenue">Ni hoy ni en los próximos días.</p>
          <span aria-hidden className="block min-h-5 flex-1" />
          <Link href="/crear?tipo=reunion" className={`${BOTON_PRINCIPAL} w-full`}>
            <CalendarPlus className="size-4" aria-hidden />
            Nueva reunión
          </Link>
        </div>
      )}
    </Tarjeta>
  );
}
