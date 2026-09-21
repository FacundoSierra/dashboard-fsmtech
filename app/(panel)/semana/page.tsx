import type { Metadata } from 'next';
import Link from 'next/link';
import { Markdown } from '@/components/markdown';
import { ListaTareas } from '@/components/tareas';
import { Chip, Encabezado, Estado, Kpi, Tarjeta } from '@/components/ui';
import { obtenerBoveda } from '@/lib/boveda/consultas';
import { resumenSemana, type DiaSemana } from '@/lib/boveda/semana';
import { esFechaValida, fechaCorta, fechaLarga, hoyMadrid, inicioSemana, sumarDias } from '@/lib/fechas';
import { hrefNota } from '@/lib/rutas';

export const metadata: Metadata = { title: 'Semana' };

const BOTON = 'rounded-lg border border-borde bg-superficie px-3 py-1.5 shadow-tarjeta hover:text-acento';

export default async function PaginaSemana({ searchParams }: PageProps<'/semana'>) {
  const boveda = await obtenerBoveda();
  const hoy = hoyMadrid();
  const { fecha } = await searchParams;
  const lunes = inicioSemana(esFechaValida(fecha) ? fecha : hoy);
  const semana = resumenSemana(boveda, lunes, hoy);
  const { totales } = semana;

  return (
    <>
      <Encabezado titulo="Semana" subtitulo={`Del ${fechaCorta(semana.lunes)} al ${fechaCorta(semana.domingo)}`} />

      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        <Link href={`/semana?fecha=${sumarDias(lunes, -7)}`} className={BOTON}>
          ← Anterior
        </Link>
        {lunes !== inicioSemana(hoy) && (
          <Link href="/semana" className={BOTON}>
            Esta semana
          </Link>
        )}
        <Link href={`/semana?fecha=${sumarDias(lunes, 7)}`} className={BOTON}>
          Siguiente →
        </Link>
        <span className="ml-auto">
          <Estado nivel="bien">
            Racha de dailies: {semana.racha} {semana.racha === 1 ? 'día' : 'días'}
          </Estado>
        </span>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi etiqueta="Objetivos hechos" valor={`${totales.objetivosHechos}/${totales.objetivosTotales}`} />
        <Kpi etiqueta="Completado en dailies" valor={totales.completado} />
        <Kpi etiqueta="Hecho en proyectos" valor={totales.enNotas} />
        <Kpi etiqueta="Reuniones" valor={totales.reuniones} />
        <Kpi etiqueta="Dailies" valor={`${totales.dailies}/7`} />
      </div>

      <div className="space-y-3">
        {semana.dias.map((dia) => (
          <TarjetaDia key={dia.fecha} dia={dia} hoy={hoy} rutas={boveda.rutas} />
        ))}
      </div>
    </>
  );
}


function TarjetaDia({ dia, hoy, rutas }: { dia: DiaSemana; hoy: string; rutas: Record<string, string> }) {
  const esHoy = dia.fecha === hoy;
  const futuro = dia.fecha > hoy;
  const completo = dia.objetivosTotales > 0 && dia.objetivosHechos === dia.objetivosTotales;

  return (
    <Tarjeta className={`${esHoy ? 'ring-2 ring-acento/40' : ''} ${futuro ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold first-letter:uppercase">
          {fechaLarga(dia.fecha)}
          {esHoy && <span className="font-normal text-acento"> · hoy</span>}
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {dia.daily ? (
            <Link href={hrefNota(dia.daily.ruta)}>
              <Chip tono="acento">Daily</Chip>
            </Link>
          ) : (
            !futuro && <Chip>Sin daily</Chip>
          )}
          {dia.objetivosTotales > 0 && (
            <Estado nivel={completo ? 'bien' : 'neutro'}>
              <span className="text-xs">
                {dia.objetivosHechos}/{dia.objetivosTotales} objetivos
              </span>
            </Estado>
          )}
        </div>
      </div>

      {(dia.reuniones.length > 0 || dia.completado.length > 0 || dia.enNotas.length > 0) && (
        <div className="mt-3 space-y-3 text-sm">
          {dia.reuniones.length > 0 && (
            <ul className="space-y-1">
              {dia.reuniones.map((reunion) => (
                <li key={reunion.nota.ruta}>
                  <span className="text-tenue">Reunión{reunion.hora && ` ${reunion.hora}`}: </span>
                  <Link href={hrefNota(reunion.nota.ruta)} className="hover:text-acento">
                    {reunion.nota.titulo}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {dia.completado.length > 0 && (
            <details>
              <summary className="cursor-pointer text-tenue">Completado en la daily ({dia.completado.length})</summary>
              <div className="mt-2">
                <ListaTareas tareas={dia.completado} rutas={rutas} />
              </div>
            </details>
          )}
          {dia.enNotas.length > 0 && (
            <details>
              <summary className="cursor-pointer text-tenue">Hecho en proyectos y notas ({dia.enNotas.length})</summary>
              <ul className="mt-2 space-y-1.5">
                {dia.enNotas.map((hecho, i) => (
                  <li key={i}>
                    <Markdown texto={hecho.texto} rutas={rutas} enLinea />{' '}
                    <Link href={hrefNota(hecho.nota.ruta)} className="text-tenue hover:text-acento">
                      · {hecho.nota.titulo}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </Tarjeta>
  );
}
