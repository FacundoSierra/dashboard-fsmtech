import Link from 'next/link';
import { ListaTareas } from '@/components/tareas';
import { Chip, Encabezado, Tarjeta, TituloBloque, Vacio } from '@/components/ui';
import {
  esPrioritaria,
  obtenerBoveda,
  proyectos,
  requerimientosPendientes,
  resumenHoy,
  reunionesProximas,
  texto,
} from '@/lib/boveda/consultas';
import { cuandoEs, fechaLarga, hoyMadrid } from '@/lib/fechas';
import { hrefNota } from '@/lib/rutas';

export default async function PaginaHoy() {
  const boveda = await obtenerBoveda();
  const { rutas } = boveda;
  const hoy = hoyMadrid();

  const { daily, objetivos, completado, anteriores } = resumenHoy(boveda, hoy);
  const principales = objetivos.filter((t) => t.nivel === 0);
  const hechos = principales.filter((t) => t.hecha).length;
  const porcentaje = principales.length ? Math.round((hechos / principales.length) * 100) : 0;

  const proximas = reunionesProximas(boveda, hoy);
  const activos = proyectos(boveda).filter((p) => p.estado === 'activo');
  const urgentes = activos.flatMap((proyecto) =>
    proyecto.abiertas.filter(esPrioritaria).map((tarea) => ({ tarea, proyecto })),
  );
  const ideas = boveda.notas.filter((nota) => nota.carpeta === 'ideas');

  return (
    <>
      <Encabezado titulo="Hoy" subtitulo={fechaLarga(hoy)} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Tarjeta>
            <TituloBloque
              extra={
                daily && (
                  <Link href={hrefNota(daily.ruta)} className="text-sm text-acento hover:underline">
                    Abrir la daily
                  </Link>
                )
              }
            >
              Objetivos
            </TituloBloque>
            {!daily ? (
              <Vacio>Todavía no hay daily de hoy.</Vacio>
            ) : principales.length === 0 ? (
              <Vacio>La daily de hoy no tiene objetivos.</Vacio>
            ) : (
              <>
                <div className="mb-4">
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span>
                      {hechos} de {principales.length} hechos
                    </span>
                    <span className="text-tenue">{porcentaje} %</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-fondo">
                    <div className="h-full rounded-full bg-ok" style={{ width: `${porcentaje}%` }} />
                  </div>
                </div>
                <ListaTareas tareas={objetivos} rutas={rutas} />
              </>
            )}
          </Tarjeta>

          {anteriores.length > 0 && (
            <Tarjeta>
              <TituloBloque>Pendientes de días anteriores</TituloBloque>
              <div className="space-y-4">
                {anteriores.map(({ fecha, nota, tareas }) => (
                  <div key={fecha}>
                    <p className="mb-2 text-sm text-tenue first-letter:uppercase">
                      <Link href={hrefNota(nota.ruta)} className="hover:text-acento">
                        {fechaLarga(fecha)}
                      </Link>{' '}
                      · {cuandoEs(fecha, hoy)}
                    </p>
                    <ListaTareas tareas={tareas} rutas={rutas} />
                  </div>
                ))}
              </div>
            </Tarjeta>
          )}

          {completado.length > 0 && (
            <Tarjeta>
              <details>
                <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-tenue">
                  Completado hoy ({completado.length})
                </summary>
                <div className="mt-3">
                  <ListaTareas tareas={completado} rutas={rutas} />
                </div>
              </details>
            </Tarjeta>
          )}
        </div>

        <div className="space-y-4">
          <Tarjeta>
            <TituloBloque
              extra={
                <Link href="/reuniones" className="text-sm text-acento hover:underline">
                  Todas
                </Link>
              }
            >
              Próximas reuniones
            </TituloBloque>
            {proximas.length === 0 ? (
              <Vacio>No hay reuniones previstas.</Vacio>
            ) : (
              <ul className="space-y-3">
                {proximas.slice(0, 4).map((reunion) => (
                  <li key={reunion.nota.ruta}>
                    <Link href={hrefNota(reunion.nota.ruta)} className="font-medium leading-snug hover:text-acento">
                      {reunion.nota.titulo}
                    </Link>
                    {reunion.fecha && (
                      <p className="text-sm text-tenue first-letter:uppercase">
                        {cuandoEs(reunion.fecha, hoy)} · {fechaLarga(reunion.fecha)}
                        {reunion.hora && ` · ${reunion.hora}`}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>

          {urgentes.length > 0 && (
            <Tarjeta>
              <TituloBloque>Urgente</TituloBloque>
              <ul className="space-y-3">
                {urgentes.map(({ tarea, proyecto }, i) => (
                  <li key={i}>
                    <Link href={hrefNota(proyecto.nota.ruta)} className="mb-1 block text-sm text-tenue hover:text-acento">
                      {proyecto.nota.titulo}
                    </Link>
                    <ListaTareas tareas={[{ ...tarea, nivel: 0 }]} rutas={rutas} />
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}

          <Tarjeta>
            <TituloBloque>De un vistazo</TituloBloque>
            <div className="grid grid-cols-2 gap-3">
              <Dato valor={activos.length} etiqueta="proyectos activos" href="/proyectos" />
              <Dato valor={proximas.length} etiqueta="reuniones próximas" href="/reuniones" />
              <Dato valor={requerimientosPendientes(boveda).length} etiqueta="requerimientos pendientes" />
              <Dato valor={boveda.notas.filter((n) => n.carpeta === 'inbox').length} etiqueta="notas en el inbox" />
            </div>
          </Tarjeta>

          {ideas.length > 0 && (
            <Tarjeta>
              <TituloBloque>Ideas</TituloBloque>
              <ul className="space-y-2">
                {ideas.map((idea) => (
                  <li key={idea.ruta} className="flex items-center justify-between gap-2">
                    <Link href={hrefNota(idea.ruta)} className="text-sm hover:text-acento">
                      {idea.titulo}
                    </Link>
                    {texto(idea.propiedades.estado) && <Chip>{texto(idea.propiedades.estado)}</Chip>}
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}
        </div>
      </div>
    </>
  );
}

function Dato({ valor, etiqueta, href }: { valor: number; etiqueta: string; href?: string }) {
  const contenido = (
    <>
      <span className="block text-2xl font-semibold">{valor}</span>
      <span className="block text-xs text-tenue">{etiqueta}</span>
    </>
  );
  return (
    <div className="rounded-xl bg-fondo p-3">
      {href ? (
        <Link href={href} className="block hover:text-acento">
          {contenido}
        </Link>
      ) : (
        contenido
      )}
    </div>
  );
}
