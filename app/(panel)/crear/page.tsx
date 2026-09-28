import type { Metadata } from 'next';
import Link from 'next/link';
import { FormCliente, FormRequerimiento, FormReunion } from '@/components/formularios-crear';
import { Encabezado, Tarjeta } from '@/components/ui';
import {
  ESTADOS_CLIENTE,
  LINEAS,
  obtenerBoveda,
  proyectos as resumenProyectos,
  reuniones as resumenReuniones,
  siguienteRequerimiento,
} from '@/lib/boveda/consultas';
import { hoyMadrid } from '@/lib/fechas';

export const metadata: Metadata = { title: 'Crear' };

const TIPOS = {
  cliente: 'Cliente',
  reunion: 'Reunión',
  requerimiento: 'Requerimiento',
} as const;
type Tipo = keyof typeof TIPOS;

const AYUDA: Record<Tipo, string> = {
  cliente: 'La ficha en clientes/, con su plantilla. Si ya hay trato, también su nota de cobros del año con las casillas de cada mes.',
  reunion: 'La nota en clientes/<cliente>/reuniones/, con fecha y hora: la diaria de ese día la recoge sola.',
  requerimiento: 'Toda petición que pase de media hora lleva requerimiento. El número REQ-### lo pone el panel, correlativo en cada proyecto.',
};

/** Notas nuevas con las plantillas de la bóveda, sin abrir Obsidian */
export default async function PaginaCrear({ searchParams }: PageProps<'/crear'>) {
  const parametros = await searchParams;
  const tipo: Tipo = typeof parametros.tipo === 'string' && Object.hasOwn(TIPOS, parametros.tipo) ? (parametros.tipo as Tipo) : 'cliente';
  const boveda = await obtenerBoveda();
  const hoy = hoyMadrid();

  const fichas = boveda.notas
    .filter((n) => n.propiedades.tipo === 'cliente' && n.ruta === `clientes/${n.nombre}/${n.nombre}.md`)
    .map((n) => ({ nombre: n.nombre, titulo: n.titulo }))
    .sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
  const proyectos = resumenProyectos(boveda)
    .filter((p) => p.nota.ruta === `proyectos/${p.nota.nombre}/${p.nota.nombre}.md`)
    .map((p) => ({
      nombre: p.nota.nombre,
      titulo: p.nota.titulo.split(' — ')[0],
      cliente: p.cliente,
      siguiente: siguienteRequerimiento(boveda, p.nota.nombre),
    }))
    .sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
  // Las más recientes primero: un requerimiento suele salir de la última reunión
  const reuniones = resumenReuniones(boveda)
    .reverse()
    .slice(0, 40)
    .map((r) => ({
      nombre: r.nota.nombre,
      titulo: `${r.fecha ?? ''} · ${r.nota.titulo}`,
      cliente: r.cliente,
    }));

  const cliente = typeof parametros.cliente === 'string' && fichas.some((f) => f.nombre === parametros.cliente) ? parametros.cliente : undefined;
  const proyecto = typeof parametros.proyecto === 'string' && proyectos.some((p) => p.nombre === parametros.proyecto) ? parametros.proyecto : undefined;

  return (
    <div className="mx-auto max-w-3xl">
      <Encabezado titulo="Crear" subtitulo="Notas nuevas con las plantillas de la bóveda" />

      <nav aria-label="Qué crear" className="mb-4 inline-flex rounded-xl border border-borde bg-fondo p-1">
        {(Object.keys(TIPOS) as Tipo[]).map((valor) => (
          <Link
            key={valor}
            href={`/crear?tipo=${valor}`}
            aria-current={tipo === valor ? 'page' : undefined}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium ${tipo === valor ? 'bg-superficie text-texto shadow-sm' : 'text-tenue hover:text-texto'}`}
          >
            {TIPOS[valor]}
          </Link>
        ))}
      </nav>

      <Tarjeta titulo={`${TIPOS[tipo] === 'Reunión' ? 'Nueva' : 'Nuevo'} ${TIPOS[tipo].toLowerCase()}`}>
        <p className="mb-4 text-sm text-tenue">{AYUDA[tipo]}</p>
        {tipo === 'cliente' && <FormCliente lineas={LINEAS} estados={ESTADOS_CLIENTE} mesActual={hoy.slice(0, 7)} />}
        {tipo === 'reunion' &&
          (fichas.length ? (
            <FormReunion key={cliente} clientes={fichas} proyectos={proyectos} inicial={cliente} hoy={hoy} />
          ) : (
            <p className="text-sm text-tenue">Primero hace falta la ficha de algún cliente.</p>
          ))}
        {tipo === 'requerimiento' &&
          (proyectos.length ? (
            <FormRequerimiento key={proyecto} proyectos={proyectos} reuniones={reuniones} inicial={proyecto} />
          ) : (
            <p className="text-sm text-tenue">No hay proyectos.</p>
          ))}
      </Tarjeta>
    </div>
  );
}
