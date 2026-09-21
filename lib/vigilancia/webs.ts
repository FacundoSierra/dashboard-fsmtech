import 'server-only';
import { connect } from 'node:tls';
import { unstable_cache } from 'next/cache';
import { AGENTE, ESPERA_REINTENTO_MS, TIEMPO_LIMITE_MS, esperar, explicarError } from './red';

/** A partir de aquí una web se considera lenta */
export const LENTA_MS = 3_000;

export interface EstadoWeb {
  url: string;
  responde: boolean;
  codigo?: number;
  /** Tiempo hasta recibir la respuesta, sin descargar la página, ya en caliente */
  ms?: number;
  /**
   * La primera petición tardó más de `LENTA_MS` y la segunda no: la web estaba dormida.
   * Pasa con las funciones de Vercel poco visitadas. Es real (el primer visitante espera),
   * pero no es un fallo, así que se enseña sin avisar.
   */
  arranqueEnFrio?: number;
  error?: string;
  comprobado: string;
}

/**
 * Pide la web como un navegador y mira solo la respuesta. Cuenta como «responde» todo lo
 * que no sea un error del servidor ni un 404: una web protegida con contraseña (401, 403)
 * está viva.
 */
async function comprobar(url: string): Promise<EstadoWeb> {
  let primera = await pedir(url);
  // Sin respuesta: un segundo intento antes de darla por caída
  if (!primera.responde) {
    await esperar(ESPERA_REINTENTO_MS);
    primera = await pedir(url);
  }
  if (!primera.responde || !primera.ms || primera.ms <= LENTA_MS) return primera;

  // Lenta: se repite para separar un arranque en frío de una web lenta de verdad
  const segunda = await pedir(url);
  return segunda.responde && segunda.ms !== undefined && segunda.ms <= LENTA_MS
    ? { ...segunda, arranqueEnFrio: primera.ms }
    : segunda;
}

async function pedir(url: string): Promise<EstadoWeb> {
  const comprobado = new Date().toISOString();
  const inicio = performance.now();
  try {
    const respuesta = await fetch(url, {
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
      headers: { 'user-agent': AGENTE },
    });
    const ms = Math.round(performance.now() - inicio);
    // No hace falta el cuerpo: se corta para no descargar la página entera
    await respuesta.body?.cancel().catch(() => undefined);
    const codigo = respuesta.status;
    const responde = codigo < 400 || codigo === 401 || codigo === 403;
    return {
      url,
      responde,
      codigo,
      ms,
      error: responde ? undefined : codigo === 404 ? 'La página no existe (404)' : `El servidor responde ${codigo}`,
      comprobado,
    };
  } catch (error) {
    return { url, responde: false, error: explicarError(error), comprobado };
  }
}

/**
 * Dos minutos de caché: navegar por el panel no vuelve a llamar a las webs de los
 * clientes en cada clic, y un cambio de estado se ve enseguida.
 */
export const comprobarWeb = unstable_cache(comprobar, ['vigilancia-web'], { revalidate: 120, tags: ['vigilancia'] });

// ── Certificado SSL ──────────────────────────────────────────────────────────

export interface Certificado {
  /** Fecha de caducidad en ISO; los días que quedan se calculan al usarla, no al guardarla */
  validoHasta?: string;
  /** El navegador lo acepta: cadena de confianza completa y del dominio correcto */
  valido: boolean;
  emisor?: string;
  error?: string;
}

/**
 * Lee el certificado sin validarlo, para poder avisar también de uno caducado o mal
 * emitido; si el navegador lo aceptaría o no queda en `valido`.
 */
function leerCertificado(host: string): Promise<Certificado> {
  return new Promise((resolver) => {
    const socket = connect(
      { host, port: 443, servername: host, rejectUnauthorized: false, timeout: TIEMPO_LIMITE_MS },
      () => {
        const certificado = socket.getPeerCertificate();
        const valido = socket.authorized;
        socket.end();
        if (!certificado?.valid_to) return resolver({ valido: false, error: 'No presenta certificado' });
        const hasta = new Date(certificado.valid_to);
        resolver({
          validoHasta: Number.isNaN(hasta.getTime()) ? undefined : hasta.toISOString(),
          valido,
          // El nombre común se entiende mejor que la razón social: «Don Dominio RSA DV SSL CA 2»
          emisor: [certificado.issuer?.CN, certificado.issuer?.O].find((v): v is string => typeof v === 'string'),
          error: valido ? undefined : 'El navegador no lo acepta',
        });
      },
    );
    socket.on('timeout', () => {
      socket.destroy();
      resolver({ valido: false, error: 'No responde por HTTPS' });
    });
    socket.on('error', (error) => resolver({ valido: false, error: explicarError(error) }));
  });
}

/** Un certificado cambia pocas veces: seis horas de caché */
export const certificadoDe = unstable_cache(leerCertificado, ['vigilancia-certificado'], {
  revalidate: 6 * 3600,
  tags: ['vigilancia'],
});

/**
 * Los emisores que usan renovación automática (ACME): Vercel, Netlify y la mayoría de
 * alojamientos modernos. Un certificado de pago de otro emisor hay que renovarlo a mano.
 */
export function seRenuevaSolo(emisor: string | undefined): boolean {
  return /let'?s encrypt|google trust|zerossl|amazon|^R\d+$|^E\d+$|^WE\d|^WR\d/i.test(emisor ?? '');
}

export function diasHasta(fechaIso: string | undefined, ahora = Date.now()): number | undefined {
  if (!fechaIso) return undefined;
  const fecha = new Date(fechaIso).getTime();
  return Number.isNaN(fecha) ? undefined : Math.floor((fecha - ahora) / 86_400_000);
}
