import type { Metadata } from 'next';
import Link from 'next/link';
import { Chip, Encabezado, Estado, Seccion, Vacio } from '@/components/ui';
import {
  obtenerBoveda,
  reunionesAnteriores,
  reunionesProximas,
  type ResumenReunion,
} from '@/lib/boveda/consultas';
import { cuandoEs, fechaLarga, hoyMadrid } from '@/lib/fechas';
import { hrefNota } from '@/lib/rutas';

export const metadata: Metadata = { title: 'Reuniones' };

export default async function PaginaReuniones() {
  const boveda = await obtenerBoveda();
  const hoy = hoyMadrid();
  const proximas = reunionesProximas(boveda, hoy);
  const anteriores = reunionesAnteriores(boveda, hoy);

  return (
    <>
      <Encabezado titulo="Reuniones" subtitulo={`${proximas.length} próximas`} />
      <div className="space-y-8">
        <Seccion titulo="Próximas">
          <ListaReuniones reuniones={proximas} hoy={hoy} titulos={boveda.titulos} vacio="No hay reuniones previstas." />
        </Seccion>
        <Seccion titulo="Anteriores">
          <ListaReuniones reuniones={anteriores} hoy={hoy} titulos={boveda.titulos} vacio="Todavía no hay reuniones pasadas." />
        </Seccion>
      </div>
    </>
  );
}

function ListaReuniones({
  reuniones,
  hoy,
  titulos,
  vacio,
}: {
  reuniones: ResumenReunion[];
  hoy: string;
  titulos: Record<string, string>;
  vacio: string;
}) {
  if (reuniones.length === 0) return <Vacio>{vacio}</Vacio>;

  return (
    <ul className="divide-y divide-borde overflow-hidden rounded-xl border border-borde bg-superficie shadow-tarjeta">
      {reuniones.map((reunion) => {
        const detalles = [
          reunion.fecha && fechaLarga(reunion.fecha),
          reunion.hora,
          reunion.cliente && (titulos[reunion.cliente] ?? reunion.cliente),
        ].filter(Boolean);

        return (
          <li key={reunion.nota.ruta} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <Link href={hrefNota(reunion.nota.ruta)} className="font-medium hover:text-acento">
                {reunion.nota.titulo}
              </Link>
              <p className="text-sm text-tenue first-letter:uppercase">{detalles.join(' · ')}</p>
            </div>
            <div className="flex gap-2">
              {reunion.fecha && (
                <Chip tono={reunion.fecha >= hoy ? 'acento' : 'neutro'}>{cuandoEs(reunion.fecha, hoy)}</Chip>
              )}
              {reunion.abiertas.length > 0 && (
                <Estado nivel="aviso">
                  <span className="text-xs">{reunion.abiertas.length} tareas</span>
                </Estado>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
