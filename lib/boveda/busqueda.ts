import 'server-only';
import { normalizar } from './parser';
import type { Boveda, Nota } from './tipos';

export interface ResultadoBusqueda {
  nota: Nota;
  puntos: number;
  /** Primera línea del texto que contiene alguno de los términos */
  fragmento?: string;
  terminos: string[];
}

const MAX_RESULTADOS = 50;

/** Minúsculas y sin tildes. En texto en NFC conserva la longitud, lo que permite resaltar */
export function sinTildes(valor: string): string {
  return valor.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function aplanar(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor.flatMap(aplanar);
  return typeof valor === 'string' || typeof valor === 'number' ? [String(valor)] : [];
}

function contar(textoNormalizado: string, termino: string): number {
  let veces = 0;
  for (let i = textoNormalizado.indexOf(termino); i !== -1 && veces < 20; i = textoNormalizado.indexOf(termino, i + termino.length)) {
    veces++;
  }
  return veces;
}

function fragmento(cuerpo: string, terminos: string[]): string | undefined {
  for (const linea of cuerpo.split(/\r?\n/)) {
    const limpia = linea
      .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+(?:\[[ xX]\]\s+)?)/, '')
      .replace(/\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\\?\|([^\]]*))?\]\]/g, (_, destino: string, alias?: string) => alias || destino)
      .trim();
    if (!limpia) continue;

    const posiciones = terminos.map((t) => sinTildes(limpia).indexOf(t)).filter((i) => i >= 0);
    if (posiciones.length === 0) continue;

    const inicio = Math.max(0, Math.min(...posiciones) - 60);
    const fin = inicio + 220;
    return `${inicio > 0 ? '…' : ''}${limpia.slice(inicio, fin)}${limpia.length > fin ? '…' : ''}`;
  }
  return undefined;
}

/** Todas las palabras de la consulta deben aparecer; el título puntúa más que las propiedades y el texto */
export function buscar(boveda: Boveda, consulta: string): ResultadoBusqueda[] {
  const terminos = [...new Set(normalizar(consulta).split(' ').filter((t) => t.length >= 2))];
  if (terminos.length === 0) return [];

  const resultados: ResultadoBusqueda[] = [];
  for (const nota of boveda.notas) {
    const titulo = sinTildes(`${nota.titulo} ${nota.nombre}`);
    const datos = sinTildes([...nota.etiquetas, ...aplanar(nota.propiedades)].join(' '));
    const cuerpo = sinTildes(nota.cuerpo);

    let puntos = 0;
    let coinciden = true;
    for (const termino of terminos) {
      const puntosTermino =
        (titulo.includes(termino) ? 10 : 0) + (datos.includes(termino) ? 4 : 0) + Math.min(contar(cuerpo, termino), 5);
      if (puntosTermino === 0) {
        coinciden = false;
        break;
      }
      puntos += puntosTermino;
    }

    if (coinciden) resultados.push({ nota, puntos, fragmento: fragmento(nota.cuerpo, terminos), terminos });
  }

  return resultados
    .sort((a, b) => b.puntos - a.puntos || a.nota.titulo.localeCompare(b.nota.titulo, 'es'))
    .slice(0, MAX_RESULTADOS);
}
