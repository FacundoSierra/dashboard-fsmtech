import Link from 'next/link';
import { Suspense } from 'react';
import { ZONA_TOQUE } from '@/components/estilos';
import { NuevoObjetivo } from '@/components/tarea-editable';
import { ListaTareas, ListaTareasEditable } from '@/components/tareas';
import { TITULO_TARJETA, Vacio } from '@/components/ui';
import type { ResumenHoy } from '@/lib/boveda/consultas';
import { ultimaSubidaDelPc } from '@/lib/boveda/sincronizacion';
import { cuandoEs, fechaLarga, haceTiempo } from '@/lib/fechas';
import { hrefNota } from '@/lib/rutas';
import { Plegable } from './plegable';

/**
 * Los objetivos de la diaria de hoy, lo que más se toca: la tarjeta grande de Hoy. Arriba, el
 * campo de añadir; debajo, la lista, con cada objetivo plegado a dos líneas. Al pie, plegado, lo
 * que ya se apuntó como hecho y lo que quedó sin marcar en las diarias de las dos últimas semanas
 */
export function Objetivos({
  resumen,
  hoy,
  rutas,
  titulos,
}: {
  resumen: ResumenHoy;
  hoy: string;
  rutas: Record<string, string>;
  titulos: Record<string, string>;
}) {
  const { daily, objetivos, completado, anteriores } = resumen;
  const principales = objetivos.filter((t) => t.nivel === 0);
  const hechos = principales.filter((t) => t.hecha).length;
  const pendientesAnteriores = anteriores.reduce((total, dia) => total + dia.tareas.length, 0);

  return (
    <section id="objetivos" aria-labelledby="titulo-objetivos" className="imprimir-plano scroll-mt-24 rounded-xl bg-superficie">
      <div className="px-5 pt-4 sm:px-6 sm:pt-5">
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3">
          <h2 id="titulo-objetivos" className={TITULO_TARJETA}>
            Objetivos de hoy
          </h2>
          {daily && principales.length > 0 && (
            <p className="text-[13px] text-tenue">
              <span className="cifras font-semibold text-texto">{hechos}</span> de {principales.length} hechos
            </p>
          )}
        </div>

        <div className="mt-2">
          <NuevoObjetivo creaDiaria={!daily} />
        </div>

        {!daily ? (
          <div className="py-5">
            <Vacio>Todavía no hay diaria de hoy.</Vacio>
          </div>
        ) : principales.length === 0 ? (
          <div className="py-5">
            <Vacio>La diaria de hoy no tiene objetivos.</Vacio>
          </div>
        ) : (
          <div className="mt-2">
            <ListaTareasEditable tareas={objetivos} rutas={rutas} titulos={titulos} ruta={daily.ruta} mover="espera" />
          </div>
        )}

        <Suspense fallback={null}>
          <SubidaDelPc />
        </Suspense>
      </div>

      {(completado.length > 0 || pendientesAnteriores > 0) ? (
        <div className="mt-3 divide-y divide-borde border-t border-borde px-5 sm:px-6">
          {completado.length > 0 && (
            <Plegable titulo={`Completado hoy · ${completado.length}`}>
              <ListaTareas tareas={completado} rutas={rutas} titulos={titulos} compacta />
            </Plegable>
          )}
          {pendientesAnteriores > 0 && (
            <Plegable titulo={`De días anteriores · ${pendientesAnteriores}`}>
              <p className="mb-3 text-[13px] text-tenue">Objetivos sin marcar de las dos últimas semanas que no están en la diaria de hoy.</p>
              <div className="space-y-4">
                {anteriores.map(({ fecha, nota, tareas }) => (
                  <div key={fecha}>
                    <p className="text-[13px] text-tenue first-letter:uppercase">
                      <Link href={hrefNota(nota.ruta)} className={`${ZONA_TOQUE} font-semibold text-texto hover:text-acento`}>
                        {fechaLarga(fecha)}
                      </Link>{' '}
                      · {cuandoEs(fecha, hoy)}
                    </p>
                    <ListaTareasEditable tareas={tareas} rutas={rutas} titulos={titulos} ruta={nota.ruta} />
                  </div>
                ))}
              </div>
            </Plegable>
          )}
        </div>
      ) : (
        <div className="pb-5 sm:pb-6" />
      )}
    </section>
  );
}

/** Lo marcado aquí llega a Obsidian cuando el PC sincroniza: esto dice cuándo lo hizo por última vez */
async function SubidaDelPc() {
  const ultima = await ultimaSubidaDelPc();
  if (!ultima) return null;
  return (
    <p className="mt-3 text-[13px] text-apagado">
      Lo que marques aquí llega a Obsidian cuando el PC sincroniza. Última subida del PC: {haceTiempo(ultima)}.
    </p>
  );
}
