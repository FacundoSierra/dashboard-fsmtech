import type { Metadata } from 'next';
import Link from 'next/link';
import { ListaTareas } from '@/components/tareas';
import { Chip, Encabezado, Tarjeta, Vacio, tonoEstado } from '@/components/ui';
import { obtenerBoveda, proyectos, type ResumenProyecto } from '@/lib/boveda/consultas';
import type { Boveda } from '@/lib/boveda/tipos';
import { hrefNota } from '@/lib/rutas';

export const metadata: Metadata = { title: 'Proyectos' };

const ORDEN_ESTADOS = ['activo', 'pausado', 'completado'];
const TAREAS_VISIBLES = 5;

export default async function PaginaProyectos() {
  const boveda = await obtenerBoveda();
  const todos = proyectos(boveda);
  const estados = [...new Set([...ORDEN_ESTADOS, ...todos.map((p) => p.estado)])].filter((estado) =>
    todos.some((p) => p.estado === estado),
  );
  const activos = todos.filter((p) => p.estado === 'activo').length;

  return (
    <>
      <Encabezado titulo="Proyectos" subtitulo={`${activos} activos de ${todos.length}`} />
      {todos.length === 0 ? (
        <Vacio>No hay notas de proyecto.</Vacio>
      ) : (
        <div className="space-y-8">
          {estados.map((estado) => {
            const delEstado = todos.filter((p) => p.estado === estado);
            return (
              <section key={estado}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-tenue">
                  {estado} · {delEstado.length}
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {delEstado.map((proyecto) => (
                    <TarjetaProyecto key={proyecto.nota.ruta} proyecto={proyecto} boveda={boveda} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function TarjetaProyecto({ proyecto, boveda }: { proyecto: ResumenProyecto; boveda: Boveda }) {
  const { nota, cliente, stack, web, remoto, abiertas, hechas } = proyecto;
  const principales = abiertas.filter((t) => t.nivel === 0);
  const visibles = principales.slice(0, TAREAS_VISIBLES);
  const rutaCliente = cliente ? boveda.rutas[cliente] : undefined;

  return (
    <Tarjeta className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold leading-tight">
            <Link href={hrefNota(nota.ruta)} className="hover:text-acento">
              {nota.titulo}
            </Link>
          </h3>
          <p className="mt-0.5 text-sm text-tenue">
            {rutaCliente && cliente ? (
              <Link href={hrefNota(rutaCliente)} className="hover:text-acento">
                {boveda.titulos[cliente]}
              </Link>
            ) : (
              'Personal'
            )}
          </p>
        </div>
        <Chip tono={tonoEstado(proyecto.estado)}>{proyecto.estado}</Chip>
      </div>

      {stack.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {stack.map((tecnologia) => (
            <Chip key={tecnologia}>{tecnologia}</Chip>
          ))}
        </div>
      )}

      {(web || remoto) && (
        <div className="flex flex-wrap gap-4 text-sm">
          {web && (
            <a href={web} target="_blank" rel="noreferrer" className="text-acento hover:underline">
              Web
            </a>
          )}
          {remoto && (
            <a href={remoto} target="_blank" rel="noreferrer" className="text-acento hover:underline">
              {remoto.includes('github.com') ? 'GitHub' : 'Repositorio'}
            </a>
          )}
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-tenue">
          Próximos pasos · {abiertas.length} pendientes, {hechas} hechos
        </p>
        {visibles.length ? <ListaTareas tareas={visibles} rutas={boveda.rutas} /> : <Vacio>Sin tareas pendientes.</Vacio>}
        {principales.length > visibles.length && (
          <Link href={hrefNota(nota.ruta)} className="mt-2 inline-block text-sm text-acento hover:underline">
            Ver {principales.length - visibles.length} más
          </Link>
        )}
      </div>
    </Tarjeta>
  );
}
