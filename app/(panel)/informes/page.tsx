import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, FileText } from 'lucide-react';
import { Encabezado, Tarjeta, Vacio, euros } from '@/components/ui';
import { obtenerBoveda, proyectos } from '@/lib/boveda/consultas';
import { economia, nombreMes } from '@/lib/economia';
import { hoyMadrid } from '@/lib/fechas';
import { mesAnterior } from '@/lib/informes';

export const metadata: Metadata = { title: 'Informes' };

export default async function PaginaInformes() {
  const boveda = await obtenerBoveda();
  const hoy = hoyMadrid();
  const mes = mesAnterior(hoy);
  const dinero = economia(boveda, hoy);
  const conProyectos = new Set(proyectos(boveda).map((p) => p.cliente).filter(Boolean));
  const lista = dinero.clientes.filter((c) => conProyectos.has(c.nota.nombre));

  return (
    <>
      <Encabezado
        titulo="Informes"
        subtitulo="Informe mensual de mantenimiento para cada cliente: disponibilidad, cambios publicados y renovaciones"
      />
      <Tarjeta titulo={`Informes de ${nombreMes(mes, true)}`} icono={FileText} sinRelleno>
        {lista.length === 0 ? (
          <div className="p-4">
            <Vacio>No hay clientes con proyectos.</Vacio>
          </div>
        ) : (
          <ul className="divide-y divide-borde">
            {lista.map((c) => (
              <li key={c.nota.ruta}>
                <Link
                  href={`/informes/${encodeURIComponent(c.nota.nombre)}?mes=${mes}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-superficie-2"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{c.nota.titulo}</span>
                    <span className="text-xs text-tenue">{c.actual ? `Cuota de ${euros(c.actual)} al mes` : 'Sin cuota'}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-apagado" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
      <p className="mt-4 text-xs text-apagado">
        Cada informe se puede imprimir o guardar en PDF para mandárselo al cliente. Dentro se puede cambiar de mes.
      </p>
    </>
  );
}
