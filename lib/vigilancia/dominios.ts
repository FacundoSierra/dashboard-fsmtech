import 'server-only';
import { AGENTE } from './red';

/** Dominios de plataformas: no se renuevan, no hay caducidad que vigilar */
const RE_PLATAFORMA = /\.(vercel\.app|netlify\.app|github\.io|pages\.dev|supabase\.co|web\.app|onrender\.com)$/i;

/** `www.vm-propiedades.es` → `vm-propiedades.es`; `cjfitness-app.vercel.app` → nada */
export function dominioRegistrable(host: string): string | undefined {
  const limpio = host.toLowerCase().replace(/^www\./, '');
  if (RE_PLATAFORMA.test(limpio)) return undefined;
  const partes = limpio.split('.');
  return partes.length >= 2 ? partes.slice(-2).join('.') : undefined;
}

export interface Dominio {
  nombre: string;
  caduca?: string;
  error?: string;
}

/**
 * Fecha de caducidad del dominio por RDAP, el sustituto moderno de WHOIS.
 *
 * `rdap.org` redirige al registro de cada extensión. Los `.com` y `.net` la publican; el
 * registro de los `.es` no tiene RDAP público, así que esos hay que apuntarlos a mano en
 * la sección «Renovaciones» de la ficha del cliente.
 */
export async function dominioDe(nombre: string): Promise<Dominio> {
  try {
    const respuesta = await fetch(`https://rdap.org/domain/${encodeURIComponent(nombre)}`, {
      headers: { accept: 'application/rdap+json', 'user-agent': AGENTE },
      signal: AbortSignal.timeout(10_000),
      // Cambia una vez al año: un día de caché
      next: { revalidate: 86_400, tags: ['vigilancia'] },
    });
    if (respuesta.status === 404) {
      return { nombre, error: 'Su registro no publica la caducidad: apúntala a mano' };
    }
    if (!respuesta.ok) return { nombre, error: `El registro respondió ${respuesta.status}` };

    const datos = (await respuesta.json()) as { events?: { eventAction?: string; eventDate?: string }[] };
    const caduca = datos.events?.find((evento) => evento.eventAction === 'expiration')?.eventDate;
    return caduca ? { nombre, caduca } : { nombre, error: 'El registro no da la fecha de caducidad' };
  } catch {
    return { nombre, error: 'No se pudo consultar el registro' };
  }
}
