import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BotonImprimir } from '@/components/boton-imprimir';
import { IconoEstado, Pendiente, porcentaje } from '@/components/ui';
import { obtenerBoveda } from '@/lib/boveda/consultas';
import { nombreMes, sumarMeses } from '@/lib/economia';
import { fechaCorta, fechaHoraCorta, hoyMadrid } from '@/lib/fechas';
import { informeCliente, mesAnterior, type InformeProyecto } from '@/lib/informes';
import { duracion } from '@/lib/vigilancia/disponibilidad';
import { estadoGeneral } from '@/lib/vigilancia/estado';

const RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function generateMetadata({ params }: PageProps<'/informes/[cliente]'>): Promise<Metadata> {
  const { cliente } = await params;
  const boveda = await obtenerBoveda();
  const nota = boveda.notas.find((n) => n.nombre === decodeURIComponent(cliente));
  return { title: nota ? `Informe · ${nota.titulo}` : 'Informe' };
}

export default async function PaginaInforme({ params, searchParams }: PageProps<'/informes/[cliente]'>) {
  const { cliente } = await params;
  const { mes: parametro } = await searchParams;
  const boveda = await obtenerBoveda();
  const hoy = hoyMadrid();
  const mesActual = hoy.slice(0, 7);
  const mes = typeof parametro === 'string' && RE_MES.test(parametro) && parametro <= mesActual ? parametro : mesAnterior(hoy);

  const estado = await estadoGeneral(boveda);
  const ahora = new Date(estado.comprobado).getTime();
  const informe = await informeCliente(boveda, decodeURIComponent(cliente), mes, estado, ahora);
  if (!informe) notFound();

  const conWeb = informe.proyectos.filter((p) => p.web);
  const medidas = conWeb.map((p) => p.disponibilidad).filter((d): d is NonNullable<typeof d> => d !== null);
  const mediaDisponibilidad = medidas.length ? medidas.reduce((t, d) => t + d.porcentaje, 0) / medidas.length : null;
  const incidencias = informe.proyectos.reduce((t, p) => t + p.incidencias.length, 0);
  const conCambios = informe.proyectos.filter((p) => p.cambios);
  const publicados = conCambios.reduce(
    (t, p) => t + p.cambios!.mejoras.length + p.cambios!.correcciones.length + p.cambios!.seguridad.length,
    0,
  );
  const vulnerabilidades = informe.proyectos.some((p) => p.vulnerabilidades !== null)
    ? informe.proyectos.reduce((t, p) => t + (p.vulnerabilidades ?? 0), 0)
    : null;
  const enCurso = mes === mesActual;
  const ruta = `/informes/${encodeURIComponent(informe.cliente.nombre)}`;

  return (
    <>
      <div className="no-imprimir mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Link href={`${ruta}?mes=${sumarMeses(mes, -1)}`} aria-label="Mes anterior" className="rounded-lg border border-borde bg-superficie p-2 hover:text-acento">
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
          <span className="min-w-36 text-center text-sm font-medium first-letter:uppercase">{nombreMes(mes, true)}</span>
          {mes < mesActual ? (
            <Link href={`${ruta}?mes=${sumarMeses(mes, 1)}`} aria-label="Mes siguiente" className="rounded-lg border border-borde bg-superficie p-2 hover:text-acento">
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          ) : (
            <span className="rounded-lg border border-borde p-2 text-apagado opacity-50" aria-hidden>
              <ChevronRight className="size-4" />
            </span>
          )}
        </div>
        <BotonImprimir />
      </div>

      {enCurso && (
        <div className="no-imprimir mb-6">
          <Pendiente titulo="Este mes todavía no ha terminado">Los datos son parciales, hasta hoy.</Pendiente>
        </div>
      )}

      <article className="imprimir-plano mx-auto max-w-3xl rounded-xl border border-borde bg-superficie p-6 shadow-tarjeta sm:p-10">
        <header className="flex items-start justify-between gap-4 border-b border-borde pb-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-apagado">Informe de mantenimiento</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{informe.cliente.titulo}</h1>
            <p className="mt-1 text-sm text-tenue first-letter:uppercase">{nombreMes(mes, true)}</p>
          </div>
          <div className="text-right">
            <div className="ml-auto flex size-9 items-center justify-center rounded-lg bg-acento-fuerte text-xs font-bold text-white [-webkit-print-color-adjust:exact] [print-color-adjust:exact]" aria-hidden>
              FS
            </div>
            <p className="mt-1.5 text-xs font-semibold">FSMTECH</p>
            <p className="text-xs text-tenue">Facundo Sierra Morales</p>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-4 border-b border-borde py-6 sm:grid-cols-4">
          <Cifra
            etiqueta="Disponibilidad"
            valor={mediaDisponibilidad === null ? '—' : porcentaje(mediaDisponibilidad, mediaDisponibilidad === 100 ? 0 : 2)}
          />
          <Cifra etiqueta="Incidencias" valor={String(incidencias)} />
          <Cifra etiqueta="Cambios publicados" valor={conCambios.length ? String(publicados) : '—'} />
          <Cifra
            etiqueta="Vulnerabilidades"
            valor={vulnerabilidades === null ? '—' : vulnerabilidades === 0 ? 'Ninguna' : String(vulnerabilidades)}
          />
        </section>

        {informe.proyectos.length === 0 ? (
          <p className="py-6 text-sm text-tenue">Este cliente no tiene proyectos en marcha.</p>
        ) : (
          informe.proyectos.map((p) => <SeccionProyecto key={p.proyecto.nota.ruta} p={p} ahora={ahora} />)
        )}

        {informe.renovaciones.length > 0 && (
          <section className="border-t border-borde py-6">
            <h2 className="text-sm font-semibold">Próximas renovaciones</h2>
            <p className="mt-1 text-xs text-tenue">Servicios que conviene renovar a tiempo para que la web no se interrumpa.</p>
            <ul className="mt-3 space-y-1.5 text-sm">
              {informe.renovaciones.map((r) => (
                <li key={`${r.fecha}-${r.concepto}`} className="flex justify-between gap-3">
                  <span>{r.concepto}</span>
                  <span className="cifras text-tenue">
                    {fechaCorta(r.fecha)} {r.fecha.slice(0, 4)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="border-t border-borde pt-6 text-xs leading-relaxed text-apagado">
          {informe.vigilanciaDesde ? (
            <p>
              La disponibilidad se comprueba cada hora desde el {fechaHoraCorta(informe.vigilanciaDesde)}; las caídas de menos
              de una hora pueden no quedar registradas.
            </p>
          ) : (
            <p>La vigilancia de disponibilidad todavía no estaba en marcha en este periodo.</p>
          )}
          <p className="mt-1">Informe generado el {fechaCorta(hoy)} de {hoy.slice(0, 4)}.</p>
        </footer>
      </article>
    </>
  );
}

function Cifra({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <p className="text-xs text-tenue">{etiqueta}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight">{valor}</p>
    </div>
  );
}

function SeccionProyecto({ p, ahora }: { p: InformeProyecto; ahora: number }) {
  const nombre = p.proyecto.nota.titulo.split(' — ')[0];
  const diasCertificado = p.certificadoHasta
    ? Math.floor((new Date(p.certificadoHasta).getTime() - ahora) / 86_400_000)
    : undefined;

  return (
    <section className="space-y-4 border-b border-borde py-6 last-of-type:border-b-0">
      <div>
        <h2 className="text-base font-semibold">{nombre}</h2>
        {p.web && <p className="text-xs text-tenue">{p.web.replace(/^https?:\/\//, '').replace(/\/$/, '')}</p>}
      </div>

      {p.web && (
        <div className="space-y-2 text-sm">
          <Linea
            nivel={p.disponibilidad === null ? 'sin-datos' : p.incidencias.length ? 'aviso' : 'bien'}
            texto={
              p.disponibilidad === null
                ? 'Sin datos de disponibilidad en este periodo'
                : p.incidencias.length
                  ? `Disponible el ${porcentaje(p.disponibilidad.porcentaje, 2)} del tiempo, con ${p.incidencias.length} ${p.incidencias.length === 1 ? 'incidencia' : 'incidencias'} (${duracion(p.disponibilidad.minutosCaida)} en total)`
                  : `Disponible el ${porcentaje(p.disponibilidad.porcentaje, p.disponibilidad.porcentaje === 100 ? 0 : 2)} del tiempo, sin incidencias`
            }
          />
          {diasCertificado !== undefined && (
            <Linea
              nivel={diasCertificado > 30 ? 'bien' : diasCertificado >= 0 ? 'aviso' : 'critico'}
              texto={
                diasCertificado >= 0
                  ? `Conexión segura (HTTPS) con certificado válido hasta el ${fechaCorta(p.certificadoHasta!.slice(0, 10))}`
                  : 'El certificado de seguridad ha caducado'
              }
            />
          )}
          {p.vulnerabilidades !== null && (
            <Linea
              nivel={p.vulnerabilidades === 0 ? 'bien' : 'aviso'}
              texto={
                p.vulnerabilidades === 0
                  ? 'Sin vulnerabilidades conocidas en las librerías que usa'
                  : `${p.vulnerabilidades} avisos de seguridad en librerías, en revisión`
              }
            />
          )}
        </div>
      )}

      {p.cambios &&
        (p.cambios.mejoras.length + p.cambios.correcciones.length + p.cambios.seguridad.length === 0 ? (
          <p className="text-sm text-tenue">
            {p.cambios.mantenimiento
              ? `Este mes se hicieron ${p.cambios.mantenimiento} tareas de mantenimiento interno.`
              : 'Este mes no hubo cambios en el código.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ListaCambios titulo="Mejoras" lista={p.cambios.mejoras} />
            <ListaCambios titulo="Correcciones" lista={p.cambios.correcciones} />
            <ListaCambios titulo="Seguridad" lista={p.cambios.seguridad} />
            {p.cambios.mantenimiento > 0 && (
              <p className="text-xs text-tenue sm:col-span-2">
                Además, {p.cambios.mantenimiento} {p.cambios.mantenimiento === 1 ? 'tarea' : 'tareas'} de mantenimiento interno
                (documentación, dependencias y ajustes).
              </p>
            )}
          </div>
        ))}
    </section>
  );
}

function Linea({ nivel, texto }: { nivel: 'bien' | 'aviso' | 'critico' | 'sin-datos'; texto: string }) {
  return (
    <p className="flex items-start gap-2">
      <IconoEstado nivel={nivel} className="mt-0.5 size-4" />
      <span>{texto}</span>
    </p>
  );
}

function ListaCambios({ titulo, lista }: { titulo: string; lista: string[] }) {
  if (lista.length === 0) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold text-tenue">
        {titulo} · {lista.length}
      </h3>
      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm">
        {lista.slice(0, 8).map((cambio, i) => (
          <li key={i}>{cambio}</li>
        ))}
      </ul>
      {lista.length > 8 && <p className="mt-1 text-xs text-tenue">y {lista.length - 8} más</p>}
    </div>
  );
}
