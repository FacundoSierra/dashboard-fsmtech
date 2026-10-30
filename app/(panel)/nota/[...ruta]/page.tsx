import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Fragment, type ReactNode } from 'react';
import { ChevronRight, Circle, CircleDot, CircleSlash } from 'lucide-react';
import { Markdown, claveVista } from '@/components/markdown';
import { Estado, TITULO_PANTALLA, Tarjeta, Vacio, nivelEstadoProyecto, type Icono } from '@/components/ui';
import { buscarNota, notasQueEnlazan, obtenerBoveda, proyectos, reuniones, texto } from '@/lib/boveda/consultas';
import type { Boveda, Nota } from '@/lib/boveda/tipos';
import { fechaLarga } from '@/lib/fechas';
import { hrefNota } from '@/lib/rutas';

function valorPropiedad(valor: unknown): string {
  if (Array.isArray(valor)) return valor.map(valorPropiedad).join(', ');
  if (valor && typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}

function tieneValor(valor: unknown): boolean {
  return valor !== null && valor !== undefined && valor !== '' && !(Array.isArray(valor) && valor.length === 0);
}

/** El cuerpo sin su `# Título`: la página ya lo pinta arriba, antes de las propiedades */
function sinTitulo(cuerpo: string, titulo: string): string {
  const lineas = cuerpo.split(/\r?\n/);
  let enCodigo = false;
  for (let i = 0; i < lineas.length; i++) {
    if (/^\s*(```|~~~)/.test(lineas[i])) enCodigo = !enCodigo;
    if (!enCodigo && lineas[i].match(/^#\s+(.+?)\s*$/)?.[1] === titulo) {
      return [...lineas.slice(0, i), ...lineas.slice(i + 1)].join('\n');
    }
  }
  return cuerpo;
}

export async function generateMetadata({ params }: PageProps<'/nota/[...ruta]'>): Promise<Metadata> {
  const { ruta } = await params;
  const nota = buscarNota(await obtenerBoveda(), ruta);
  return { title: nota?.titulo ?? 'Nota' };
}

export default async function PaginaNota({ params }: PageProps<'/nota/[...ruta]'>) {
  const { ruta } = await params;
  const boveda = await obtenerBoveda();
  const nota = buscarNota(boveda, ruta);
  if (!nota) notFound();

  const propiedades = Object.entries(nota.propiedades).filter(([, valor]) => tieneValor(valor));
  const entrantes = notasQueEnlazan(boveda, nota);

  return (
    <article className="mx-auto max-w-3xl">
      {/* Lo primero, qué nota es; en el móvil, con las propiedades delante, había que bajar una pantalla */}
      <h1 className={TITULO_PANTALLA}>{nota.titulo}</h1>
      <p className="mt-2 break-all font-mono text-xs text-tenue">{nota.ruta}</p>

      {propiedades.length > 0 && (
        <details className="group mt-4 rounded-xl bg-superficie">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm text-tenue hover:text-texto [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden />
            Propiedades · {propiedades.length}
          </summary>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t border-borde px-4 py-3 text-sm">
            {propiedades.map(([clave, valor]) => (
              <Fragment key={clave}>
                <dt className="text-tenue">{clave}</dt>
                <dd className="min-w-0 break-words">
                  <Markdown texto={valorPropiedad(valor)} rutas={boveda.rutas} titulos={boveda.titulos} enLinea />
                </dd>
              </Fragment>
            ))}
          </dl>
        </details>
      )}

      {/* El texto de la nota, en una tarjeta blanca como todo lo demás del panel */}
      <div className="imprimir-plano mt-4 rounded-xl bg-superficie px-5 py-4 sm:px-8 sm:py-6">
        <Markdown texto={sinTitulo(nota.cuerpo, nota.titulo)} rutas={boveda.rutas} titulos={boveda.titulos} vistas={vistasDe(boveda, nota)} />
      </div>

      {entrantes.length > 0 && (
        <Tarjeta className="mt-10" titulo={`Enlazada desde · ${entrantes.length}`}>
          <ul className="space-y-1.5 text-sm">
            {entrantes.map((otra) => (
              <li key={otra.ruta}>
                <Link href={hrefNota(otra.ruta)} className="hover:text-acento">
                  {otra.titulo}
                </Link>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}
    </article>
  );
}

// ── Vistas `.base` de Obsidian ───────────────────────────────────────────────

/**
 * Las vistas de las plantillas de proyecto y de cliente, con lo que el panel ya sabe: las de
 * `dashboards/*.base` que filtran por `file.hasLink(this.file)`, o sea, las notas que enlazan a
 * esta. Las demás vistas siguen saliendo como texto
 */
function vistasDe(boveda: Boveda, nota: Nota): Record<string, ReactNode> {
  const enlazan = (otra: Nota) => otra.ruta !== nota.ruta && otra.enlaces.includes(nota.nombre);
  return {
    [claveVista('requerimientos.base', 'Del proyecto')]: (
      <VistaRequerimientos lista={boveda.notas.filter((n) => n.propiedades.tipo === 'requerimiento' && enlazan(n))} />
    ),
    [claveVista('reuniones.base', 'Relacionadas')]: <VistaReuniones lista={reuniones(boveda).filter((r) => enlazan(r.nota)).reverse()} />,
    [claveVista('proyectos.base', 'Relacionados')]: <VistaProyectos lista={proyectos(boveda).filter((p) => enlazan(p.nota))} />,
  };
}

const LISTA = 'divide-y divide-borde overflow-hidden rounded-xl border border-borde bg-superficie';
const FILA_VISTA = 'flex min-h-11 items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-superficie-2';

/**
 * Los estados de un requerimiento (`templates/requerimiento.md`): no son de salud, pero llevan
 * también icono y texto. «Hecho», con el de `bien`
 */
const ESTADO_REQUERIMIENTO: Record<string, { texto: string; icono: Icono; color: string }> = {
  pendiente: { texto: 'Pendiente', icono: Circle, color: 'text-apagado' },
  'en-curso': { texto: 'En curso', icono: CircleDot, color: 'text-acento' },
  descartado: { texto: 'Descartado', icono: CircleSlash, color: 'text-apagado' },
};

function EstadoRequerimiento({ estado }: { estado?: string }) {
  if (estado === 'hecho') return <Estado nivel="bien">Hecho</Estado>;
  const conocido = estado && Object.hasOwn(ESTADO_REQUERIMIENTO, estado) ? ESTADO_REQUERIMIENTO[estado] : undefined;
  if (!conocido) return <Estado nivel="sin-datos">{estado ?? 'Sin estado'}</Estado>;
  const IconoRequerimiento = conocido.icono;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm">
      <IconoRequerimiento className={`size-4 shrink-0 ${conocido.color}`} aria-hidden />
      <span>{conocido.texto}</span>
    </span>
  );
}

/** `REQ-002`, o el número del nombre del archivo (`req-002-…`) si la nota no lo lleva */
function idDe(requerimiento: Nota): string {
  return texto(requerimiento.propiedades.id) ?? requerimiento.nombre.match(/^req-(\d+)/i)?.[0]?.toUpperCase() ?? '';
}

function VistaRequerimientos({ lista }: { lista: Nota[] }) {
  if (lista.length === 0) return <Vacio>Todavía no hay requerimientos de este proyecto.</Vacio>;
  const ordenados = [...lista].sort((a, b) => idDe(a).localeCompare(idDe(b), 'es', { numeric: true }));
  const horas = ordenados.reduce((total, r) => total + (Number(r.propiedades.estimacion_horas) || 0), 0);
  return (
    <>
      <ul className={LISTA}>
        {ordenados.map((requerimiento) => (
          <li key={requerimiento.ruta}>
            <Link href={hrefNota(requerimiento.ruta)} className={FILA_VISTA}>
              <span className="min-w-0">
                {/* Casi todos llevan ya el ID en el título («REQ-003 · Beta…»): solo se añade si no */}
                {!requerimiento.titulo.startsWith(idDe(requerimiento)) && (
                  <span className="mr-2 font-mono text-xs text-apagado">{idDe(requerimiento)}</span>
                )}
                <span className="font-medium">{requerimiento.titulo}</span>
              </span>
              <EstadoRequerimiento estado={texto(requerimiento.propiedades.estado)} />
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-tenue">
        {ordenados.length} {ordenados.length === 1 ? 'requerimiento' : 'requerimientos'}
        {horas > 0 && ` · ${horas.toLocaleString('es-ES')} h estimadas`}
      </p>
    </>
  );
}

function VistaReuniones({ lista }: { lista: ReturnType<typeof reuniones> }) {
  if (lista.length === 0) return <Vacio>Todavía no hay reuniones que enlacen aquí.</Vacio>;
  return (
    <ul className={LISTA}>
      {lista.map((reunion) => (
        <li key={reunion.nota.ruta}>
          <Link href={hrefNota(reunion.nota.ruta)} className={FILA_VISTA}>
            <span className="min-w-0">
              <span className="block font-medium">{reunion.nota.titulo}</span>
              {reunion.fecha && (
                <span className="block text-xs text-tenue first-letter:uppercase">
                  {fechaLarga(reunion.fecha)} de {reunion.fecha.slice(0, 4)}
                  {reunion.hora && ` · ${reunion.hora}`}
                </span>
              )}
            </span>
            {reunion.abiertas.length > 0 && (
              <Estado nivel="aviso">
                <span className="text-xs">
                  {reunion.abiertas.length} {reunion.abiertas.length === 1 ? 'tarea' : 'tareas'}
                </span>
              </Estado>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function VistaProyectos({ lista }: { lista: ReturnType<typeof proyectos> }) {
  if (lista.length === 0) return <Vacio>Todavía no hay proyectos que enlacen aquí.</Vacio>;
  return (
    <ul className={LISTA}>
      {lista.map((proyecto) => (
        <li key={proyecto.nota.ruta}>
          <Link href={hrefNota(proyecto.nota.ruta)} className={FILA_VISTA}>
            <span className="min-w-0 truncate font-medium">{proyecto.nota.titulo}</span>
            <Estado nivel={nivelEstadoProyecto(proyecto.estado)}>
              <span className="capitalize">{proyecto.estado}</span>
            </Estado>
          </Link>
        </li>
      ))}
    </ul>
  );
}

