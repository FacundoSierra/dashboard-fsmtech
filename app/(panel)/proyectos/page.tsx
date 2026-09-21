import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ExternalLink, GitBranch } from 'lucide-react';
import { ListaTareas } from '@/components/tareas';
import { Chip, Encabezado, Estado, Medidor, Vacio, nivelEstadoProyecto } from '@/components/ui';
import { obtenerBoveda, proyectos, type ResumenProyecto } from '@/lib/boveda/consultas';
import type { Boveda } from '@/lib/boveda/tipos';
import { hrefNota } from '@/lib/rutas';
import { estadoGeneral, type EstadoProyecto } from '@/lib/vigilancia/estado';
import { LENTA_MS } from '@/lib/vigilancia/webs';

export const metadata: Metadata = { title: 'Proyectos' };

const ORDEN_ESTADOS = ['activo', 'pausado', 'completado'];
const TAREAS_VISIBLES = 3;
const STACK_VISIBLE = 4;

export default async function PaginaProyectos() {
  const boveda = await obtenerBoveda();
  const todos = proyectos(boveda);
  const activos = todos.filter((p) => p.estado === 'activo').length;

  return (
    <>
      <Encabezado titulo="Proyectos" subtitulo={`${activos} activos de ${todos.length}`} />
      {todos.length === 0 ? (
        <Vacio>No hay notas de proyecto.</Vacio>
      ) : (
        <Suspense fallback={<Rejilla todos={todos} boveda={boveda} />}>
          <RejillaConEstado todos={todos} boveda={boveda} />
        </Suspense>
      )}
    </>
  );
}

async function RejillaConEstado({ todos, boveda }: { todos: ResumenProyecto[]; boveda: Boveda }) {
  const estado = await estadoGeneral(boveda);
  const porNota = new Map(estado.proyectos.map((p) => [p.proyecto.nota.ruta, p]));
  return <Rejilla todos={todos} boveda={boveda} estados={porNota} />;
}

function Rejilla({
  todos,
  boveda,
  estados,
}: {
  todos: ResumenProyecto[];
  boveda: Boveda;
  estados?: Map<string, EstadoProyecto>;
}) {
  const grupos = [...new Set([...ORDEN_ESTADOS, ...todos.map((p) => p.estado)])].filter((estado) =>
    todos.some((p) => p.estado === estado),
  );

  return (
    <div className="space-y-8">
      {grupos.map((grupo) => {
        const delGrupo = todos.filter((p) => p.estado === grupo);
        return (
          <section key={grupo}>
            <h2 className="mb-3 text-sm font-semibold capitalize text-tenue">
              {grupo} · {delGrupo.length}
            </h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {delGrupo.map((proyecto) => (
                <TarjetaProyecto
                  key={proyecto.nota.ruta}
                  proyecto={proyecto}
                  boveda={boveda}
                  estado={estados?.get(proyecto.nota.ruta)}
                  cargando={!estados && proyecto.estado === 'activo'}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TarjetaProyecto({
  proyecto,
  boveda,
  estado,
  cargando,
}: {
  proyecto: ResumenProyecto;
  boveda: Boveda;
  estado?: EstadoProyecto;
  cargando: boolean;
}) {
  const { nota, cliente, stack, web, remoto, abiertas, hechas } = proyecto;
  const principales = abiertas.filter((t) => t.nivel === 0);
  const total = abiertas.length + hechas;
  const rutaCliente = cliente ? boveda.rutas[cliente] : undefined;
  const [nombre, descripcion] = nota.titulo.split(' — ');

  return (
    <article className="flex flex-col rounded-xl border border-borde bg-superficie shadow-tarjeta">
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold leading-tight">
              <Link href={hrefNota(nota.ruta)} className="hover:text-acento">
                {nombre}
              </Link>
            </h3>
            <p className="mt-0.5 truncate text-sm text-tenue">
              {rutaCliente && cliente ? (
                <Link href={hrefNota(rutaCliente)} className="hover:text-acento">
                  {boveda.titulos[cliente]}
                </Link>
              ) : (
                (descripcion ?? 'Personal')
              )}
            </p>
          </div>
          <Estado nivel={nivelEstadoProyecto(proyecto.estado)}>
            <span className="capitalize">{proyecto.estado}</span>
          </Estado>
        </div>

        {cargando ? (
          <div className="h-5 w-40 animate-pulse rounded bg-superficie-2" aria-label="Comprobando el estado" />
        ) : (
          estado && <Senales estado={estado} />
        )}

        {stack.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {stack.slice(0, STACK_VISIBLE).map((tecnologia) => (
              <Chip key={tecnologia}>{tecnologia}</Chip>
            ))}
            {stack.length > STACK_VISIBLE && <Chip>+{stack.length - STACK_VISIBLE}</Chip>}
          </div>
        )}
      </div>

      <div className="mt-auto space-y-3 border-t border-borde p-4">
        <div>
          <div className="mb-1.5 flex items-baseline justify-between text-xs">
            <span className="text-tenue">Próximos pasos</span>
            <span className="cifras text-apagado">
              {abiertas.length} pendientes · {hechas} hechos
            </span>
          </div>
          {total > 0 && <Medidor valor={hechas} max={total} etiqueta={`Pasos hechos de ${nombre}`} />}
        </div>
        {principales.length > 0 && (
          <div className="text-sm">
            <ListaTareas tareas={principales.slice(0, TAREAS_VISIBLES)} rutas={boveda.rutas} compacta />
            {principales.length > TAREAS_VISIBLES && (
              <Link href={hrefNota(nota.ruta)} className="mt-2 inline-block text-xs font-medium text-acento hover:underline">
                {principales.length - TAREAS_VISIBLES} más
              </Link>
            )}
          </div>
        )}
        {(web || remoto) && (
          <div className="flex gap-4 text-xs">
            {web && (
              <a href={web} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-tenue hover:text-acento">
                <ExternalLink className="size-3.5" aria-hidden />
                Web
              </a>
            )}
            {remoto && (
              <a href={remoto} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-tenue hover:text-acento">
                <GitBranch className="size-3.5" aria-hidden />
                {remoto.includes('github.com') ? 'GitHub' : 'Repositorio'}
              </a>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

/** Lo técnico de un vistazo: web, base de datos y despliegue */
function Senales({ estado }: { estado: EstadoProyecto }) {
  const { web, supabase, repo } = estado;
  if (!web && !supabase && !repo?.despliegue) return null;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {web &&
        (web.responde ? (
          <Estado nivel={web.ms && web.ms > LENTA_MS ? 'aviso' : 'bien'}>
            <span className="text-xs text-tenue">Web {web.ms !== undefined ? `· ${web.ms} ms` : ''}</span>
          </Estado>
        ) : (
          <Estado nivel="critico">
            <span className="text-xs">Web caída</span>
          </Estado>
        ))}
      {supabase && (
        <Estado nivel={supabase.activa ? 'bien' : 'critico'}>
          <span className={`text-xs ${supabase.activa ? 'text-tenue' : ''}`}>{supabase.activa ? 'Base' : 'Base caída'}</span>
        </Estado>
      )}
      {repo?.despliegue && (
        <Estado nivel={repo.despliegue.nivel}>
          <span className={`text-xs ${repo.despliegue.nivel === 'bien' ? 'text-tenue' : ''}`}>{repo.despliegue.texto}</span>
        </Estado>
      )}
    </div>
  );
}
