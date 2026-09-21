import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';

declare const marca: unique symbol;

/**
 * Prueba de que la petición trae el secreto de la vigilancia. Solo la crea
 * `autorizarVigilancia()`, y `obtenerBovedaParaVigilancia()` la exige: así no se pueden
 * leer notas sin sesión por descuido desde otra ruta.
 */
export type AutorizacionVigilancia = { readonly [marca]: true };

function huella(valor: string): Buffer {
  return createHash('sha256').update(valor).digest();
}

/**
 * Comprueba la cabecera `Authorization: Bearer <VIGILANCIA_SECRET>`. Falla cerrado: sin
 * un secreto de 32 caracteres o más configurado, no entra nadie.
 */
export function autorizarVigilancia(request: Request): AutorizacionVigilancia | null {
  const secreto = process.env.VIGILANCIA_SECRET ?? '';
  if (secreto.length < 32) return null;

  const cabecera = request.headers.get('authorization') ?? '';
  const recibido = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : '';
  // Se comparan huellas de la misma longitud, en tiempo constante
  return recibido && timingSafeEqual(huella(recibido), huella(secreto)) ? ({} as AutorizacionVigilancia) : null;
}
