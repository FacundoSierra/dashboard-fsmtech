import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Avatar } from '@/components/piezas';
import { Encabezado, Tarjeta, Vacio, euros } from '@/components/ui';
import { obtenerBoveda, proyectos } from '@/lib/boveda/consultas';
import { economia, nombreMes, planVigente, sinCuotaFija, type PlanAnual } from '@/lib/economia';
import { hoyMadrid } from '@/lib/fechas';
import { mesAnterior } from '@/lib/informes';

export const metadata: Metadata = { title: 'Informes' };

/** Sin cuota fija (OVB, CNI) se dice: «Te paga 0 € al mes» se leía como que no paga */
function cuota(plan: PlanAnual | undefined): string {
  if (!plan) return 'Sin plan de cobros';
  return sinCuotaFija(plan) ? 'Sin cuota fija' : `Te paga ${euros(plan.cuotaMensual)} al mes`;
}

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
      {/* Cada cliente con el círculo de su nombre, como las personas de Hoy: la fila entera es el enlace */}
      <Tarjeta titulo={`Informes de ${nombreMes(mes, true)}`} sinRelleno>
        {lista.length === 0 ? (
          <div className="px-5 pb-5 sm:px-6 sm:pb-6">
            <Vacio>No hay clientes con proyectos.</Vacio>
          </div>
        ) : (
          <ul className="divide-y divide-borde pb-2">
            {lista.map((c) => (
              <li key={c.nota.ruta}>
                <Link
                  href={`/informes/${encodeURIComponent(c.nota.nombre)}?mes=${mes}`}
                  className="group flex min-h-16 items-center gap-3 px-5 py-3 hover:bg-superficie-2 sm:px-6"
                >
                  <Avatar nombre={c.nota.titulo} dosLetras />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold group-hover:text-acento">{c.nota.titulo}</span>
                    <span className="block text-[13px] text-tenue">{cuota(planVigente(c, hoy))}</span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-tenue" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
      <p className="mt-4 text-[13px] text-tenue">
        Cada informe se puede imprimir o guardar en PDF para mandárselo al cliente. Dentro se puede cambiar de mes.
      </p>
    </>
  );
}
