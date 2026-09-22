import 'server-only';
import type { NivelEstado } from '@/components/ui';
import type { RepoGitHub } from '@/lib/boveda/consultas';
import { API_GITHUB, cabecerasGitHub } from '@/lib/boveda/github';

/**
 * Token de solo lectura para los repos de código. Es otro distinto del de las notas
 * (`GITHUB_TOKEN`), que puede escribir en `brain`: si este se filtra, no toca las notas.
 */
export function tokenLectura(): string | undefined {
  return process.env.GITHUB_TOKEN_LECTURA?.trim() || undefined;
}

type Respuesta<T> = { ok: true; datos: T } | { ok: false; codigo: number };

async function gh<T>(ruta: string, token: string, revalidar = 300): Promise<Respuesta<T>> {
  try {
    const respuesta = await fetch(`${API_GITHUB}${ruta}`, {
      headers: cabecerasGitHub(token),
      signal: AbortSignal.timeout(10_000),
      next: { revalidate: revalidar, tags: ['github'] },
    });
    if (!respuesta.ok) return { ok: false, codigo: respuesta.status };
    return { ok: true, datos: (await respuesta.json()) as T };
  } catch {
    return { ok: false, codigo: 0 };
  }
}

// ── Tipos de la API ──────────────────────────────────────────────────────────

interface CommitApi {
  sha: string;
  html_url: string;
  commit: { message: string; author: { name: string; date: string }; committer: { date: string } };
}

interface EstadoCommitApi {
  statuses: { context: string; state: string; description: string | null; target_url: string | null }[];
}

interface CheckRunApi {
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string | null;
}

// ── Estado de un repo ────────────────────────────────────────────────────────

export interface Senal {
  nivel: NivelEstado;
  texto: string;
  detalle?: string;
  url?: string;
}

export interface EstadoRepo {
  repo: string;
  url: string;
  accesible: boolean;
  /** Por qué no se ha podido leer, en lenguaje de persona */
  motivo?: string;
  rama?: string;
  ultimoCommit?: { sha: string; mensaje: string; autor: string; fecha: string; url: string };
  prAbiertas?: number;
  despliegue?: Senal;
  pruebas?: Senal;
  /** `null`: sin permiso o con las alertas desactivadas en el repo */
  alertas?: { criticas: number; altas: number; medias: number; bajas: number } | null;
}

const RE_DESPLIEGUE = /deploy|despliegue|vercel/i;

/**
 * El resultado del despliegue se lee desde GitHub y no desde Vercel. Así cubre los dos
 * casos que hay: los proyectos donde Vercel publica un estado en cada commit, y los que
 * despliegan con GitHub Actions (CJFIT), que dejan un «check» llamado `deploy`. Y se ve
 * también el de proyectos cuyo Vercel es de otra cuenta.
 */
function despliegueDe(estados: EstadoCommitApi['statuses'], checks: CheckRunApi[]): Senal | undefined {
  const vercel = estados.find((estado) => /vercel/i.test(estado.context));
  if (vercel) {
    const url = vercel.target_url ?? undefined;
    switch (vercel.state) {
      case 'success':
        return { nivel: 'bien', texto: 'Desplegado', url };
      case 'pending':
        return { nivel: 'neutro', texto: 'Desplegando', url };
      default:
        return { nivel: 'critico', texto: 'Falló el despliegue', detalle: vercel.description ?? undefined, url };
    }
  }

  const check = checks.find((c) => RE_DESPLIEGUE.test(c.name));
  if (!check) return undefined;
  const url = check.html_url ?? undefined;
  if (check.status !== 'completed') return { nivel: 'neutro', texto: 'Desplegando', url };
  switch (check.conclusion) {
    case 'success':
      return { nivel: 'bien', texto: 'Desplegado', url };
    case 'cancelled':
      return {
        nivel: 'grave',
        texto: 'Despliegue cancelado',
        detalle: 'El último cambio no se llegó a publicar',
        url,
      };
    case 'skipped':
    case 'neutral':
      return { nivel: 'neutro', texto: 'Sin desplegar', url };
    default:
      return { nivel: 'critico', texto: 'Falló el despliegue', url };
  }
}

function pruebasDe(checks: CheckRunApi[]): Senal | undefined {
  const pruebas = checks.filter((c) => !RE_DESPLIEGUE.test(c.name));
  if (pruebas.length === 0) return undefined;
  const falladas = pruebas.filter((c) => c.status === 'completed' && ['failure', 'timed_out'].includes(c.conclusion ?? ''));
  if (falladas.length) {
    return { nivel: 'critico', texto: 'Pruebas en rojo', detalle: falladas.map((c) => c.name).join(', '), url: falladas[0].html_url ?? undefined };
  }
  if (pruebas.some((c) => c.status !== 'completed')) return { nivel: 'neutro', texto: 'Pruebas en curso' };
  return { nivel: 'bien', texto: 'Pruebas en verde' };
}

function motivoDe(codigo: number): string {
  if (codigo === 401) return 'El token de lectura no es válido o ha caducado';
  if (codigo === 403 || codigo === 404) return 'El token de lectura no tiene acceso a este repo';
  if (codigo === 0) return 'GitHub no responde';
  return `GitHub respondió ${codigo}`;
}

export async function estadoRepo({ propietario, nombre }: RepoGitHub, token: string): Promise<EstadoRepo> {
  const repo = `${propietario}/${nombre}`;
  const base = `/repos/${encodeURIComponent(propietario)}/${encodeURIComponent(nombre)}`;
  const url = `https://github.com/${repo}`;

  const info = await gh<{ default_branch: string; html_url: string }>(base, token, 3600);
  if (!info.ok) return { repo, url, accesible: false, motivo: motivoDe(info.codigo) };
  const rama = info.datos.default_branch;

  const [commits, prs, alertas] = await Promise.all([
    gh<CommitApi[]>(`${base}/commits?sha=${encodeURIComponent(rama)}&per_page=3`, token),
    gh<unknown[]>(`${base}/pulls?state=open&per_page=50`, token),
    gh<{ security_advisory?: { severity?: string } }[]>(`${base}/dependabot/alerts?state=open&per_page=100`, token, 1800),
  ]);

  const resultado: EstadoRepo = {
    repo,
    url: info.datos.html_url,
    accesible: true,
    rama,
    prAbiertas: prs.ok ? prs.datos.length : undefined,
    alertas: alertas.ok
      ? {
          criticas: alertas.datos.filter((a) => a.security_advisory?.severity === 'critical').length,
          altas: alertas.datos.filter((a) => a.security_advisory?.severity === 'high').length,
          medias: alertas.datos.filter((a) => a.security_advisory?.severity === 'medium').length,
          bajas: alertas.datos.filter((a) => a.security_advisory?.severity === 'low').length,
        }
      : null,
  };

  if (!commits.ok || commits.datos.length === 0) return resultado;

  const [ultimo] = commits.datos;
  resultado.ultimoCommit = {
    sha: ultimo.sha,
    mensaje: ultimo.commit.message.split('\n')[0],
    autor: ultimo.commit.author.name,
    fecha: ultimo.commit.committer.date,
    url: ultimo.html_url,
  };

  // El despliegue del último commit; si no tiene, se mira en los anteriores y se avisa
  // de que lo último no ha salido
  for (const [i, commit] of commits.datos.entries()) {
    const [estados, checks] = await Promise.all([
      gh<EstadoCommitApi>(`${base}/commits/${commit.sha}/status`, token),
      gh<{ check_runs: CheckRunApi[] }>(`${base}/commits/${commit.sha}/check-runs?per_page=50`, token),
    ]);
    const listaChecks = checks.ok ? checks.datos.check_runs : [];
    if (i === 0) resultado.pruebas = pruebasDe(listaChecks);
    const despliegue = despliegueDe(estados.ok ? estados.datos.statuses : [], listaChecks);
    if (despliegue) {
      resultado.despliegue =
        i === 0
          ? despliegue
          : { nivel: 'aviso', texto: 'Último cambio sin desplegar', detalle: `El último despliegue es de ${i} commit${i > 1 ? 's' : ''} atrás`, url: despliegue.url };
      break;
    }
  }

  return resultado;
}

// ── Commits de un periodo (informes) ─────────────────────────────────────────

export interface CommitPeriodo {
  sha: string;
  mensaje: string;
  fecha: string;
}

export async function commitsEntre(
  { propietario, nombre }: RepoGitHub,
  desde: string,
  hasta: string,
  token: string,
): Promise<CommitPeriodo[] | null> {
  const base = `/repos/${encodeURIComponent(propietario)}/${encodeURIComponent(nombre)}`;
  const respuesta = await gh<CommitApi[]>(
    `${base}/commits?since=${encodeURIComponent(desde)}&until=${encodeURIComponent(hasta)}&per_page=100`,
    token,
    1800,
  );
  if (!respuesta.ok) return null;
  return respuesta.datos.map((c) => ({ sha: c.sha, mensaje: c.commit.message.split('\n')[0], fecha: c.commit.committer.date }));
}

// ── Incidencias de la vigilancia ─────────────────────────────────────────────

/** Repo donde la vigilancia abre una incidencia por cada caída */
export function repoVigilancia(): string {
  return process.env.VIGILANCIA_REPO?.trim() || 'FacundoSierra/dashboard-fsmtech';
}

export interface Incidencia {
  /** Nombre de la nota del proyecto */
  proyecto: string;
  titulo: string;
  desde: string;
  hasta?: string;
  url: string;
}

const RE_MARCA = /<!-- vigilancia:id=web-caida:([^\s>]+) -->/;

/** Caídas de los últimos meses, sacadas de las incidencias con la etiqueta `caida` */
export async function incidencias(token: string): Promise<Incidencia[] | null> {
  const repo = repoVigilancia();
  const respuesta = await gh<{ title: string; body: string | null; created_at: string; closed_at: string | null; html_url: string }[]>(
    `/repos/${repo}/issues?labels=caida&state=all&per_page=100&sort=created&direction=desc`,
    token,
    300,
  );
  if (!respuesta.ok) return null;
  return respuesta.datos.flatMap((issue) => {
    const proyecto = issue.body?.match(RE_MARCA)?.[1];
    return proyecto
      ? [{ proyecto, titulo: issue.title, desde: issue.created_at, hasta: issue.closed_at ?? undefined, url: issue.html_url }]
      : [];
  });
}

/**
 * Desde cuándo vigila la vigilancia: la primera ejecución abre y cierra una incidencia con
 * la etiqueta `vigilancia-inicio`. Antes de esa fecha no se sabe si las webs estaban
 * bien, así que esos días salen «sin datos» en vez de contarse como buenos.
 */
export async function inicioVigilancia(token: string): Promise<string | null> {
  const respuesta = await gh<{ created_at: string }[]>(
    `/repos/${repoVigilancia()}/issues?labels=vigilancia-inicio&state=all&per_page=1&sort=created&direction=asc`,
    token,
  );
  return respuesta.ok && respuesta.datos.length ? respuesta.datos[0].created_at : null;
}
