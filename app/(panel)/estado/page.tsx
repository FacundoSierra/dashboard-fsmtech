import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Bell, Database, GitBranch, Globe, HardDrive, Rocket, Settings, ShieldCheck } from 'lucide-react';
import { ListaAvisos } from '@/components/avisos';
import { FranjaDisponibilidad } from '@/components/graficos';
import {
  Encabezado,
  Estado,
  FILA,
  Kpi,
  Pendiente,
  TABLA,
  TD,
  TH,
  Tarjeta,
  Vacio,
  type NivelEstado,
} from '@/components/ui';
import { calcularAvisos } from '@/lib/avisos';
import { obtenerBoveda } from '@/lib/boveda/consultas';
import { economia } from '@/lib/economia';
import { fechaHoraCorta, haceTiempo, hoyMadrid } from '@/lib/fechas';
import { hrefNota } from '@/lib/rutas';
import { disponibilidad, franjaDias } from '@/lib/vigilancia/disponibilidad';
import { estadoGeneral, type EstadoProyecto } from '@/lib/vigilancia/estado';
import { reposLocales } from '@/lib/vigilancia/repos-locales';
import { LENTA_MS, diasHasta } from '@/lib/vigilancia/webs';

export const metadata: Metadata = { title: 'Estado' };

export default function PaginaEstado() {
  return (
    <>
      <Encabezado titulo="Estado" subtitulo="Webs, bases de datos, despliegues y repositorios de los proyectos activos" />
      <Suspense fallback={<Cargando />}>
        <Contenido />
      </Suspense>
    </>
  );
}

function Cargando() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Comprobando las webs">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-[104px] animate-pulse rounded-xl border border-borde bg-superficie" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-borde bg-superficie" />
    </div>
  );
}

async function Contenido() {
  const boveda = await obtenerBoveda();
  const hoy = hoyMadrid();
  const estado = await estadoGeneral(boveda);
  const locales = reposLocales(boveda);
  const avisos = calcularAvisos({ estado, economia: economia(boveda, hoy), repos: locales, hoy });

  const conWeb = estado.proyectos.filter((p) => p.web);
  const enLinea = conWeb.filter((p) => p.web?.responde).length;
  const conBase = estado.proyectos.filter((p) => p.supabase);
  const basesActivas = conBase.filter((p) => p.supabase?.activa).length;
  const conDespliegue = estado.proyectos.filter((p) => p.repo?.despliegue);
  const desplegados = conDespliegue.filter((p) => p.repo?.despliegue?.nivel === 'bien').length;
  const alertas = estado.proyectos.reduce(
    (total, p) => total + (p.repo?.alertas ? p.repo.alertas.criticas + p.repo.alertas.altas : 0),
    0,
  );
  const alertasConocidas = estado.proyectos.some((p) => p.repo?.alertas);

  // «Ahora» es el momento de la comprobación: todo se calcula respecto a lo que se vio
  const ahora = new Date(estado.comprobado);
  const inicioMes = Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1);

  return (
    <div className="space-y-6">
      <p className="-mt-3 text-xs text-apagado">
        Comprobado {haceTiempo(estado.comprobado)} · las webs se vuelven a comprobar cada 2 minutos como mucho
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          etiqueta="Webs en línea"
          valor={`${enLinea}/${conWeb.length}`}
          estado={enLinea === conWeb.length ? 'bien' : 'critico'}
          detalle={enLinea === conWeb.length ? 'Todas responden' : `${conWeb.length - enLinea} sin responder`}
        />
        <Kpi
          etiqueta="Bases de datos"
          valor={`${basesActivas}/${conBase.length}`}
          estado={basesActivas === conBase.length ? 'bien' : 'critico'}
          detalle={conBase.length ? 'Proyectos de Supabase activos' : 'Ningún proyecto con Supabase'}
        />
        <Kpi
          etiqueta="Despliegues"
          valor={estado.github === 'configurado' ? `${desplegados}/${conDespliegue.length}` : '—'}
          estado={estado.github !== 'configurado' ? 'sin-datos' : desplegados === conDespliegue.length ? 'bien' : 'grave'}
          detalle={estado.github === 'configurado' ? 'Último cambio publicado' : 'Falta el token de GitHub'}
        />
        <Kpi
          etiqueta="Vulnerabilidades serias"
          valor={alertasConocidas ? alertas : '—'}
          estado={!alertasConocidas ? 'sin-datos' : alertas ? 'critico' : 'bien'}
          detalle={alertasConocidas ? 'Críticas y altas de Dependabot' : 'Sin acceso a las alertas'}
        />
      </div>

      <Tarjeta titulo={`Avisos · ${avisos.length}`} icono={Bell} sinRelleno>
        {avisos.length ? (
          <ListaAvisos avisos={avisos} />
        ) : (
          <div className="p-4">
            <Vacio>Todo en orden.</Vacio>
          </div>
        )}
      </Tarjeta>

      <Tarjeta titulo="Webs" icono={Globe} sinRelleno>
        {conWeb.length === 0 ? (
          <div className="p-4">
            <Vacio>Ningún proyecto activo tiene web. Se añade con la propiedad `web` de la nota del proyecto.</Vacio>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className={TABLA}>
              <thead>
                <tr>
                  <th className={TH}>Proyecto</th>
                  <th className={TH}>Estado</th>
                  <th className={`${TH} text-right`}>Respuesta</th>
                  <th className={TH}>Certificado</th>
                  <th className={TH}>Dominio</th>
                  <th className={`${TH} min-w-44`}>Últimos 30 días</th>
                </tr>
              </thead>
              <tbody>
                {conWeb.map((p) => (
                  <FilaWeb key={p.proyecto.nota.ruta} p={p} estado={estado} inicioMes={inicioMes} ahora={ahora.getTime()} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!estado.vigilanciaDesde && (
          <p className="border-t border-borde px-4 py-2.5 text-xs text-tenue">
            La franja de 30 días se rellena con la vigilancia horaria, que todavía no está en marcha. Ver{' '}
            <a href="#configuracion" className="text-acento hover:underline">
              configuración
            </a>
            .
          </p>
        )}
      </Tarjeta>

      <div className="grid gap-6 xl:grid-cols-2">
        <Tarjeta titulo="Bases de datos" icono={Database} sinRelleno>
          {conBase.length === 0 ? (
            <div className="p-4">
              <Vacio>Se vigilan con la propiedad `supabase` de la nota del proyecto.</Vacio>
            </div>
          ) : (
            <table className={TABLA}>
              <thead>
                <tr>
                  <th className={TH}>Proyecto</th>
                  <th className={TH}>Estado</th>
                  <th className={`${TH} text-right`}>Respuesta</th>
                </tr>
              </thead>
              <tbody>
                {conBase.map(({ proyecto, supabase }) => (
                  <tr key={proyecto.nota.ruta} className={FILA}>
                    <td className={TD}>
                      <Link href={hrefNota(proyecto.nota.ruta)} className="font-medium hover:text-acento">
                        {nombreCorto(proyecto.nota.titulo)}
                      </Link>
                    </td>
                    <td className={TD}>
                      {supabase?.activa ? <Estado nivel="bien">Activa</Estado> : <Estado nivel="critico">{supabase?.error ?? 'No responde'}</Estado>}
                    </td>
                    <td className={`${TD} cifras text-right text-tenue`}>{supabase?.ms !== undefined ? `${supabase.ms} ms` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Tarjeta>

        <Tarjeta titulo="Repositorios en el PC" icono={HardDrive} sinRelleno>
          <div id="repos-locales" className="scroll-mt-20" />
          {!locales ? (
            <div className="p-4">
              <Pendiente titulo="Todavía no hay datos del PC">
                Los escribe <code>.scripts/estado-repos.ps1</code> en <code>dashboards/repos-locales.md</code>, y la
                sincronización de la bóveda lo lanza cada 2 minutos.
              </Pendiente>
            </div>
          ) : (
            <>
              <table className={TABLA}>
                <thead>
                  <tr>
                    <th className={TH}>Repo</th>
                    <th className={TH}>Rama</th>
                    <th className={`${TH} text-right`}>Sin subir</th>
                    <th className={`${TH} text-right`}>Sin guardar</th>
                  </tr>
                </thead>
                <tbody>
                  {locales.repos.map((repo) => (
                    <tr key={`${repo.grupo}/${repo.nombre}`} className={FILA}>
                      <td className={`${TD} font-medium`}>{repo.nombre}</td>
                      <td className={`${TD} font-mono text-xs text-tenue`}>{repo.rama ?? '—'}</td>
                      <td className={`${TD} cifras text-right`}>
                        {repo.sinSubir === undefined ? (
                          <span className="text-apagado">sin remoto</span>
                        ) : repo.sinSubir ? (
                          <Estado nivel="aviso">{repo.sinSubir}</Estado>
                        ) : (
                          <span className="text-apagado">0</span>
                        )}
                      </td>
                      <td className={`${TD} cifras text-right ${repo.sinCommit ? '' : 'text-apagado'}`}>{repo.sinCommit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {locales.actualizado && (
                <p className="border-t border-borde px-4 py-2.5 text-xs text-apagado">
                  Datos del PC del {fechaHoraCorta(locales.actualizado)}. Si el PC está apagado, no se actualizan.
                </p>
              )}
            </>
          )}
        </Tarjeta>
      </div>

      <Tarjeta titulo="GitHub" icono={GitBranch} sinRelleno>
        {estado.github === 'sin-token' ? (
          <div className="p-4">
            <Pendiente titulo="Falta el token de lectura de GitHub">
              Con él se ven el último cambio, los despliegues, las pruebas y las alertas de seguridad de cada repo. Ver{' '}
              <a href="#configuracion" className="text-acento hover:underline">
                configuración
              </a>
              .
            </Pendiente>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className={TABLA}>
              <thead>
                <tr>
                  <th className={TH}>Proyecto</th>
                  <th className={TH}>Último cambio</th>
                  <th className={TH}>Despliegue</th>
                  <th className={TH}>Pruebas</th>
                  <th className={`${TH} text-right`}>PR</th>
                  <th className={TH}>Seguridad</th>
                </tr>
              </thead>
              <tbody>
                {estado.proyectos
                  .filter((p) => p.proyecto.repo)
                  .map((p) => (
                    <FilaRepo key={p.proyecto.nota.ruta} p={p} />
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      <Tarjeta titulo="Configuración" icono={Settings}>
        <div id="configuracion" className="scroll-mt-20 space-y-3 text-sm">
          <Requisito
            ok={estado.github === 'configurado'}
            titulo="Token de lectura de GitHub"
            detalle="Variable GITHUB_TOKEN_LECTURA en Vercel. Token de permisos finos, solo lectura: Metadata, Contents, Pull requests, Commit statuses, Actions, Deployments, Dependabot alerts e Issues, sobre tus repos y el de este panel."
          />
          <Requisito
            ok={Boolean(estado.vigilanciaDesde)}
            titulo="Vigilancia horaria y avisos al móvil"
            detalle={
              estado.vigilanciaDesde
                ? `En marcha desde el ${fechaHoraCorta(estado.vigilanciaDesde)}. Cada caída abre una incidencia en GitHub, que te avisa en el móvil.`
                : 'Secretos VIGILANCIA_SECRET en Vercel, y VIGILANCIA_SECRET y VIGILANCIA_URL en el repo del panel. Detalle en docs/vigilancia.md.'
            }
          />
          <Requisito
            ok={Boolean(locales)}
            titulo="Repos del PC"
            detalle="Lo escribe la sincronización de la bóveda. Si falta, revisa .scripts/sincronizar-boveda.log."
          />
        </div>
      </Tarjeta>
    </div>
  );
}

function nombreCorto(titulo: string): string {
  return titulo.split(' — ')[0];
}

function FilaWeb({
  p,
  estado,
  inicioMes,
  ahora,
}: {
  p: EstadoProyecto;
  estado: Awaited<ReturnType<typeof estadoGeneral>>;
  inicioMes: number;
  ahora: number;
}) {
  const { proyecto, web, certificado, dominio } = p;
  const diasCertificado = diasHasta(certificado?.validoHasta, ahora);
  const diasDominio = diasHasta(dominio?.caduca, ahora);
  const nombre = nombreCorto(proyecto.nota.titulo);
  const incidencias = estado.incidencias ?? [];
  const mes = disponibilidad(proyecto.nota.nombre, incidencias, estado.vigilanciaDesde, inicioMes, ahora, ahora);

  return (
    <tr className={FILA}>
      <td className={TD}>
        <Link href={hrefNota(proyecto.nota.ruta)} className="font-medium hover:text-acento">
          {nombre}
        </Link>
        <a href={web!.url} target="_blank" rel="noreferrer" className="block max-w-56 truncate text-xs text-apagado hover:text-acento">
          {web!.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
        </a>
      </td>
      <td className={TD}>
        {web!.responde ? (
          web!.ms && web!.ms > LENTA_MS ? (
            <Estado nivel="aviso">Lenta</Estado>
          ) : (
            <Estado nivel="bien">En línea</Estado>
          )
        ) : (
          <Estado nivel="critico">{web!.error ?? 'Caída'}</Estado>
        )}
      </td>
      <td className={`${TD} cifras text-right text-tenue`}>
        {web!.ms !== undefined ? `${web!.ms} ms` : '—'}
        {web!.arranqueEnFrio && (
          <span className="block text-xs text-apagado" title="La primera petición despertó la web; la segunda ya fue rápida">
            en frío {(web!.arranqueEnFrio / 1000).toFixed(1)} s
          </span>
        )}
      </td>
      <td className={TD}>
        {certificado ? (
          <Estado nivel={nivelPlazo(diasCertificado, certificado.valido, 14, 30)}>
            {diasCertificado !== undefined ? `${diasCertificado} días` : (certificado.error ?? '—')}
          </Estado>
        ) : (
          <span className="text-apagado">—</span>
        )}
      </td>
      <td className={TD}>
        {dominio?.caduca ? (
          <Estado nivel={nivelPlazo(diasDominio, true, 30, 60)}>{`${diasDominio} días`}</Estado>
        ) : dominio ? (
          <span className="text-xs text-apagado" title={dominio.error}>
            a mano
          </span>
        ) : (
          <span className="text-apagado">—</span>
        )}
      </td>
      <td className={TD}>
        <div className="flex items-center gap-3">
          <div className="min-w-32 flex-1">
            <FranjaDisponibilidad dias={franjaDias(proyecto.nota.nombre, incidencias, estado.vigilanciaDesde, 30, ahora)} nombre={nombre} />
          </div>
          <span className="cifras w-14 shrink-0 text-right text-xs text-tenue">
            {mes ? `${mes.porcentaje.toFixed(mes.porcentaje === 100 ? 0 : 2)} %` : '—'}
          </span>
        </div>
      </td>
    </tr>
  );
}

function nivelPlazo(dias: number | undefined, valido: boolean, grave: number, aviso: number): NivelEstado {
  if (!valido || dias === undefined) return 'critico';
  if (dias < 0) return 'critico';
  if (dias < grave) return 'grave';
  if (dias < aviso) return 'aviso';
  return 'bien';
}

function FilaRepo({ p }: { p: EstadoProyecto }) {
  const { proyecto, repo } = p;
  const nombre = nombreCorto(proyecto.nota.titulo);

  if (!repo || !repo.accesible) {
    return (
      <tr className={FILA}>
        <td className={`${TD} font-medium`}>{nombre}</td>
        <td className={TD} colSpan={5}>
          <Estado nivel="sin-datos">{repo?.motivo ?? 'Sin datos'}</Estado>
        </td>
      </tr>
    );
  }

  const serias = repo.alertas ? repo.alertas.criticas + repo.alertas.altas : 0;

  return (
    <tr className={FILA}>
      <td className={TD}>
        <a href={repo.url} target="_blank" rel="noreferrer" className="font-medium hover:text-acento">
          {nombre}
        </a>
        <span className="block font-mono text-xs text-apagado">{repo.rama}</span>
      </td>
      <td className={`${TD} max-w-72`}>
        {repo.ultimoCommit ? (
          <a href={repo.ultimoCommit.url} target="_blank" rel="noreferrer" className="block hover:text-acento">
            <span className="block truncate">{repo.ultimoCommit.mensaje}</span>
            <span className="text-xs text-apagado">
              {repo.ultimoCommit.autor} · {haceTiempo(repo.ultimoCommit.fecha)}
            </span>
          </a>
        ) : (
          <span className="text-apagado">—</span>
        )}
      </td>
      <td className={TD}>
        {repo.despliegue ? (
          <span title={repo.despliegue.detalle}>
            <Estado nivel={repo.despliegue.nivel}>{repo.despliegue.texto}</Estado>
          </span>
        ) : (
          <span className="text-xs text-apagado">sin despliegue automático</span>
        )}
      </td>
      <td className={TD}>
        {repo.pruebas ? <Estado nivel={repo.pruebas.nivel}>{repo.pruebas.texto}</Estado> : <span className="text-apagado">—</span>}
      </td>
      <td className={`${TD} cifras text-right ${repo.prAbiertas ? '' : 'text-apagado'}`}>{repo.prAbiertas ?? '—'}</td>
      <td className={TD}>
        {repo.alertas === null || repo.alertas === undefined ? (
          <span className="text-xs text-apagado" title="Sin permiso o con las alertas de Dependabot desactivadas">
            sin acceso
          </span>
        ) : serias ? (
          <Estado nivel={repo.alertas.criticas ? 'critico' : 'grave'}>{`${serias} serias`}</Estado>
        ) : (
          <Estado nivel="bien">{repo.alertas.medias ? `${repo.alertas.medias} medias` : 'Sin alertas'}</Estado>
        )}
      </td>
    </tr>
  );
}

function Requisito({ ok, titulo, detalle }: { ok: boolean; titulo: string; detalle: string }) {
  return (
    <div className="flex items-start gap-3">
      {ok ? (
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-bien" aria-hidden />
      ) : (
        <Rocket className="mt-0.5 size-4 shrink-0 text-apagado" aria-hidden />
      )}
      <div>
        <p className="font-medium">
          {titulo} <span className="font-normal text-tenue">· {ok ? 'listo' : 'pendiente'}</span>
        </p>
        <p className="text-tenue">{detalle}</p>
      </div>
    </div>
  );
}
