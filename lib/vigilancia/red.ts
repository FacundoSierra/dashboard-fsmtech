import 'server-only';

/** Lo que se espera a una web antes de darla por caída */
export const TIEMPO_LIMITE_MS = 8_000;

/** Así se identifica el panel en los registros de las webs que comprueba */
export const AGENTE = 'FSMTECH-vigilancia/1.0 (+https://dashboard.facundosmtech.com)';

/**
 * Las URLs salen de las notas, así que se filtran antes de llamar a nada: solo http(s)
 * y nunca direcciones internas. Un error en una nota no puede hacer que el servidor del
 * panel llame a su propia red.
 */
export function urlVigilable(valor: string | undefined): URL | undefined {
  if (!valor) return undefined;
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
  if (esHostInterno(url.hostname)) return undefined;
  return url;
}

function esHostInterno(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    // Las webs de los clientes tienen dominio: una IP escrita a mano no se comprueba
    /^\d{1,3}(\.\d{1,3}){3}$/.test(h) ||
    h.startsWith('[')
  );
}

/**
 * Antes de dar algo por caído se reintenta una vez tras esta espera. Un fallo puntual de
 * DNS o de red no puede acabar en una alerta al móvil: el 2026-09-21 un DNS doméstico dio
 * por inexistente una base de Supabase que estaba perfectamente viva.
 */
export const ESPERA_REINTENTO_MS = 1_500;

export const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

/** Traduce los errores de red a algo que se entienda en el panel */
export function explicarError(error: unknown): string {
  const causa = (error as { cause?: { code?: string } })?.cause?.code ?? (error as { code?: string })?.code;
  const nombre = (error as { name?: string })?.name;
  if (nombre === 'TimeoutError' || nombre === 'AbortError') return `No responde en ${TIEMPO_LIMITE_MS / 1000} s`;
  switch (causa) {
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return 'El dominio no resuelve';
    case 'ECONNREFUSED':
      return 'El servidor rechaza la conexión';
    case 'ECONNRESET':
      return 'El servidor cortó la conexión';
    case 'CERT_HAS_EXPIRED':
      return 'El certificado SSL ha caducado';
    case 'ERR_TLS_CERT_ALTNAME_INVALID':
      return 'El certificado SSL no es de este dominio';
    case 'UND_ERR_CONNECT_TIMEOUT':
      return 'No se pudo conectar a tiempo';
    default:
      return causa ? `Error de red (${causa})` : 'Error de red';
  }
}
