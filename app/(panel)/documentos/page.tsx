import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Download, ExternalLink, FileText, Upload } from 'lucide-react';
import { SubirDocumento } from '@/components/subir-documento';
import { Chip, Encabezado, Pendiente, Tarjeta, Vacio, euros } from '@/components/ui';
import { obtenerBoveda } from '@/lib/boveda/consultas';
import { almacenConfigurado } from '@/lib/documentos/almacen';
import { tipoParaServir } from '@/lib/documentos/archivos';
import { RE_MES, documentos, hrefArchivo } from '@/lib/documentos/documentos';
import { CATEGORIAS, esCategoria, type Categoria } from '@/lib/documentos/tipos';
import { nombreMes } from '@/lib/economia';
import { fechaCorta, hoyMadrid } from '@/lib/fechas';
import { hrefNota } from '@/lib/rutas';

export const metadata: Metadata = { title: 'Documentos' };

/** El enlace a esta misma página con un filtro cambiado */
function conFiltro(actual: { cliente?: string; categoria?: Categoria }, cambio: { cliente?: string | null; categoria?: Categoria | null }): string {
  const cliente = cambio.cliente === undefined ? actual.cliente : (cambio.cliente ?? undefined);
  const categoria = cambio.categoria === undefined ? actual.categoria : (cambio.categoria ?? undefined);
  const parametros = new URLSearchParams();
  if (cliente) parametros.set('cliente', cliente);
  if (categoria) parametros.set('categoria', categoria);
  const consulta = parametros.toString();
  return consulta ? `/documentos?${consulta}` : '/documentos';
}

function Filtro({ href, activo, children }: { href: string; activo: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={activo ? 'true' : undefined}
      className={`rounded-full border px-3 py-1 text-xs whitespace-nowrap ${
        activo ? 'border-acento bg-acento-suave font-medium text-acento' : 'border-borde text-tenue hover:border-borde-fuerte hover:text-texto'
      }`}
    >
      {children}
    </Link>
  );
}

export default async function PaginaDocumentos({ searchParams }: PageProps<'/documentos'>) {
  const parametros = await searchParams;
  const boveda = await obtenerBoveda();
  const hoy = hoyMadrid();

  // Solo las fichas que están donde tienen que estar: `clientes/<cliente>/<cliente>.md`
  const fichas = boveda.notas
    .filter((nota) => nota.propiedades.tipo === 'cliente' && nota.ruta === `clientes/${nota.nombre}/${nota.nombre}.md`)
    .map((nota) => ({ nombre: nota.nombre, titulo: nota.titulo }))
    .sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
  const tituloDe = new Map(fichas.map((f) => [f.nombre, f.titulo]));

  const cliente = typeof parametros.cliente === 'string' && tituloDe.has(parametros.cliente) ? parametros.cliente : undefined;
  const categoria = esCategoria(parametros.categoria) ? parametros.categoria : undefined;
  const cobro = typeof parametros.cobro === 'string' && RE_MES.test(parametros.cobro) ? parametros.cobro : undefined;
  const filtro = { cliente, categoria };

  const todos = documentos(boveda);
  const visibles = todos.filter((d) => (!cliente || d.cliente === cliente) && (!categoria || d.categoria === categoria));
  const configurado = almacenConfigurado();

  return (
    <>
      <Encabezado
        titulo="Documentos"
        subtitulo="Facturas, contratos y lo que te pasan los clientes. El archivo, en un almacén privado; en la bóveda, una nota con sus datos"
      />

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="space-y-4 xl:col-span-3">
          <div className="flex flex-wrap gap-1.5">
            <Filtro href={conFiltro(filtro, { cliente: null })} activo={!cliente}>
              Todos los clientes
            </Filtro>
            {fichas.map((f) => (
              <Filtro key={f.nombre} href={conFiltro(filtro, { cliente: f.nombre })} activo={cliente === f.nombre}>
                {f.titulo}
              </Filtro>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Filtro href={conFiltro(filtro, { categoria: null })} activo={!categoria}>
              Todo
            </Filtro>
            {Object.entries(CATEGORIAS).map(([valor, nombre]) => (
              <Filtro key={valor} href={conFiltro(filtro, { categoria: valor as Categoria })} activo={categoria === valor}>
                {nombre}
              </Filtro>
            ))}
          </div>

          <Tarjeta titulo={`${visibles.length} ${visibles.length === 1 ? 'documento' : 'documentos'}`} icono={FileText} sinRelleno>
            {visibles.length === 0 ? (
              <div className="p-4">
                <Vacio>{todos.length ? 'Ningún documento con estos filtros.' : 'Todavía no hay documentos subidos desde el panel.'}</Vacio>
              </div>
            ) : (
              <ul className="divide-y divide-borde">
                {visibles.map((d) => {
                  const { enLinea } = d.archivo ? tipoParaServir(d.archivo) : { enLinea: false };
                  return (
                    <li key={d.nota.ruta} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
                      <div className="min-w-0">
                        <Link href={hrefNota(d.nota.ruta)} className="block truncate text-sm font-medium hover:text-acento">
                          {d.nota.titulo}
                        </Link>
                        <p className="mt-0.5 text-xs text-tenue">
                          {tituloDe.get(d.cliente) ?? d.cliente}
                          {d.fecha && ` · ${fechaCorta(d.fecha)} ${d.fecha.slice(0, 4)}`}
                          {d.importe !== undefined && ` · ${euros(d.importe, true)}`}
                          {d.cobro && ` · cobro de ${nombreMes(d.cobro)}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <Chip>{CATEGORIAS[d.categoria]}</Chip>
                        {d.archivo && (
                          <a
                            href={hrefArchivo(d)}
                            target={enLinea ? '_blank' : undefined}
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-tenue hover:text-acento"
                          >
                            {enLinea ? <ExternalLink className="size-3.5" aria-hidden /> : <Download className="size-3.5" aria-hidden />}
                            {enLinea ? 'Abrir' : 'Descargar'}
                          </a>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Tarjeta>
          <p className="text-xs text-apagado">
            Los archivos que ya estaban en <code>clientes/*/documentos/</code> de la bóveda siguen allí y se abren desde Obsidian.
          </p>
        </div>

        <div className="xl:col-span-2">
          <div id="subir" className="scroll-mt-20">
            <Tarjeta titulo="Subir un documento" icono={Upload}>
              {!configurado ? (
                <Pendiente titulo="Falta conectar el almacén de documentos">
                  <p>
                    En Vercel, en el proyecto del panel: <strong>Storage → Create → Blob</strong>, acceso <strong>Private</strong> y región{' '}
                    <strong>Dublín</strong>, y conectarlo al proyecto. Vercel añade solo lo que hace falta; no hay claves que copiar. Detalle en{' '}
                    <code>docs/documentos.md</code>.
                  </p>
                </Pendiente>
              ) : fichas.length === 0 ? (
                <Vacio>No hay fichas de cliente a las que asignar un documento.</Vacio>
              ) : (
                <SubirDocumento clientes={fichas} inicial={{ cliente, categoria, cobro }} hoy={hoy} />
              )}
            </Tarjeta>
          </div>
        </div>
      </div>
    </>
  );
}
