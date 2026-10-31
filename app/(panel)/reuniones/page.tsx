import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ZONA_TOQUE } from '@/components/estilos';
import { Chip, Contador, EnlaceBoton, Encabezado, EstadoPildora, Tarjeta, Vacio } from '@/components/ui';
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
      <Encabezado
        titulo="Reuniones"
        subtitulo={`${proximas.length} ${proximas.length === 1 ? 'próxima' : 'próximas'}`}
        acciones={
          <EnlaceBoton href="/crear?tipo=reunion" icono={Plus}>
            Reunión
          </EnlaceBoton>
        }
      />
      {/* Cada lista en su tarjeta, con su número al lado del título, como «A la espera» en Hoy */}
      <div className="space-y-3 sm:space-y-4">
        <Tarjeta titulo={<>Próximas<Contador>{proximas.length}</Contador></>} sinRelleno>
          <ListaReuniones reuniones={proximas} hoy={hoy} titulos={boveda.titulos} vacio="No hay reuniones previstas." />
        </Tarjeta>
        <Tarjeta titulo={<>Anteriores<Contador>{anteriores.length}</Contador></>} sinRelleno>
          <ListaReuniones reuniones={anteriores} hoy={hoy} titulos={boveda.titulos} vacio="Todavía no hay reuniones pasadas." />
        </Tarjeta>
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
  if (reuniones.length === 0) {
    return (
      <div className="px-5 pb-5 sm:px-6 sm:pb-6">
        <Vacio>{vacio}</Vacio>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-borde pb-2">
      {reuniones.map((reunion) => {
        const detalles = [
          reunion.fecha && fechaLarga(reunion.fecha),
          reunion.hora,
          reunion.cliente && (titulos[reunion.cliente] ?? reunion.cliente),
        ].filter(Boolean);

        return (
          <li key={reunion.nota.ruta} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 py-3.5 sm:px-6">
            <div className="min-w-0">
              <Link href={hrefNota(reunion.nota.ruta)} className={`${ZONA_TOQUE} text-[15px] font-semibold hover:text-acento`}>
                {reunion.nota.titulo}
              </Link>
              <p className="text-[13px] text-tenue first-letter:uppercase">{detalles.join(' · ')}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {reunion.fecha && (
                <Chip tono={reunion.fecha >= hoy ? 'acento' : 'neutro'}>{cuandoEs(reunion.fecha, hoy)}</Chip>
              )}
              {reunion.abiertas.length > 0 && (
                <EstadoPildora nivel="aviso">
                  {reunion.abiertas.length} {reunion.abiertas.length === 1 ? 'tarea' : 'tareas'}
                </EstadoPildora>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
