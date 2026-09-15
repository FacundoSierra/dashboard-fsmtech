/**
 * Token de sesión firmado con HMAC-SHA256: `v1.<expira en segundos>.<firma>`.
 * Usa Web Crypto para funcionar igual en `proxy.ts` y en el resto del servidor.
 */

export const COOKIE_SESION = 'sesion_panel';
export const DURACION_SESION_S = 60 * 60 * 24 * 30;

const codificador = new TextEncoder();

/** Sin un secreto de al menos 32 caracteres no se crea ni se acepta ninguna sesión */
function secreto(): string | null {
  const valor = process.env.DASHBOARD_SECRET;
  return valor && valor.length >= 32 ? valor : null;
}

function base64url(bytes: ArrayBuffer): string {
  let binario = '';
  for (const byte of new Uint8Array(bytes)) binario += String.fromCharCode(byte);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function firmar(clave: string, datos: string): Promise<string> {
  const llave = await crypto.subtle.importKey(
    'raw',
    codificador.encode(clave),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return base64url(await crypto.subtle.sign('HMAC', llave, codificador.encode(datos)));
}

function igualesEnTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}

export async function crearToken(ahora = Date.now()): Promise<string | null> {
  const clave = secreto();
  if (!clave) return null;
  const datos = `v1.${Math.floor(ahora / 1000) + DURACION_SESION_S}`;
  return `${datos}.${await firmar(clave, datos)}`;
}

export async function tokenValido(token: string | undefined, ahora = Date.now()): Promise<boolean> {
  const clave = secreto();
  if (!clave || !token) return false;

  const [version, expira, firma] = token.split('.');
  if (version !== 'v1' || !firma || !/^\d+$/.test(expira ?? '')) return false;
  if (Number(expira) * 1000 <= ahora) return false;

  return igualesEnTiempoConstante(await firmar(clave, `${version}.${expira}`), firma);
}
