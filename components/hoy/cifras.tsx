import { Suspense } from 'react';
import { Kpi, euros } from '@/components/ui';
import type { ResumenHoy } from '@/lib/boveda/consultas';
import type { Boveda } from '@/lib/boveda/tipos';
import { economia } from '@/lib/economia';
import { CifraAvisos, CifraCargando, CifraWebs } from './avisos';

/**
 * Las cuatro cifras de arriba, como las de la referencia: la primera rellena del azul de la marca
 * (los objetivos, lo que se viene a hacer) y las demás blancas, cada una con su flecha a su
 * sección. En el móvil, dos por fila. Las de la vigilancia llegan aparte: mientras, su sitio
 */
export function CifrasDeHoy({ resumen, boveda, hoy }: { resumen: ResumenHoy; boveda: Boveda; hoy: string }) {
  const principales = resumen.objetivos.filter((t) => t.nivel === 0);
  const hechos = principales.filter((t) => t.hecha).length;
  const quedan = principales.length - hechos;
  const dinero = economia(boveda, hoy);

  return (
    <section aria-label="Cifras de hoy" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <Kpi
        destacada
        etiqueta="Objetivos de hoy"
        valor={resumen.daily ? quedan : '—'}
        href="#objetivos"
        textoEnlace="Ir a los objetivos"
        detalle={
          !resumen.daily
            ? 'Todavía no hay diaria'
            : principales.length === 0
              ? 'La diaria no tiene objetivos'
              : `Por hacer · ${hechos} ${hechos === 1 ? 'hecho' : 'hechos'} de ${principales.length}`
        }
      />
      <Suspense fallback={<CifraCargando etiqueta="Webs en línea" />}>
        <CifraWebs boveda={boveda} hoy={hoy} />
      </Suspense>
      <Kpi
        etiqueta="Te queda al mes"
        valor={dinero.conPlan ? euros(dinero.netoMensual - dinero.negocio.alMes) : '—'}
        href="/economia"
        textoEnlace="Ver la economía"
        detalle={dinero.conPlan ? 'Con los gastos del negocio' : 'Sin planes de cobro'}
      />
      <Suspense fallback={<CifraCargando etiqueta="Avisos" />}>
        <CifraAvisos boveda={boveda} hoy={hoy} />
      </Suspense>
    </section>
  );
}
