import { normalizar } from './parser';

/**
 * Cambios de línea sobre el texto crudo de una nota, para las escrituras del panel.
 *
 * Todo trabaja con líneas enteras y dentro de una sección, y nunca adivina: quien lo usa
 * busca la línea tal cual se pintó en la página y, si ya no está, no toca nada.
 */

const RE_TITULO = /^(#{1,6})\s+(.*)$/;
const RE_VALLA = /^\s*(```|~~~)/;
/** Las viñetas vacías de las plantillas (`- [ ]`, `- `): el sitio donde va la primera línea */
const RE_HUECO = /^\s*[-*+](?: \[[ xX]\])?\s*$/;

export function saltoDe(texto: string): string {
  return texto.includes('\r\n') ? '\r\n' : '\n';
}

/** Una sección: la línea de su título y la primera línea que ya no es suya */
export interface Rango {
  titulo: number;
  fin: number;
}

/**
 * La sección de nivel 2 o más cuyo título, sin emojis ni tildes, es exactamente `clave`:
 * `🎯 Objetivos` para `objetivos`. Exacto a propósito: el título de una nota de cobros
 * («Cobros de VM Propiedades») no es su sección «Cobros».
 */
export function rangoSeccion(lineas: string[], clave: string): Rango | null {
  const buscada = normalizar(clave);
  let desde = 0;
  // El frontmatter no tiene títulos, aunque tenga comentarios que empiecen por `#`
  if (lineas[0]?.replace(/^﻿/, '').trim() === '---') {
    const cierre = lineas.findIndex((linea, i) => i > 0 && linea.trim() === '---');
    if (cierre !== -1) desde = cierre + 1;
  }

  let enCodigo = false;
  let inicio = -1;
  let nivel = 0;
  for (let i = desde; i < lineas.length; i++) {
    if (RE_VALLA.test(lineas[i])) {
      enCodigo = !enCodigo;
      continue;
    }
    const titulo = enCodigo ? null : lineas[i].match(RE_TITULO);
    if (!titulo) continue;
    if (inicio === -1) {
      if (titulo[1].length >= 2 && normalizar(titulo[2]) === buscada) {
        inicio = i;
        nivel = titulo[1].length;
      }
    } else if (titulo[1].length <= nivel) {
      return { titulo: inicio, fin: i };
    }
  }
  return inicio === -1 ? null : { titulo: inicio, fin: lineas.length };
}

/** Dónde está `original` dentro de la sección, comparando sin sangría; `null` si ya no está */
export function buscarLinea(lineas: string[], rango: Rango, original: string): number | null {
  const buscada = original.trim();
  for (let i = rango.titulo + 1; i < rango.fin; i++) {
    if (lineas[i].trim() === buscada) return i;
  }
  return null;
}

export function sangriaDe(linea: string): number {
  return (linea.match(/^\s*/)?.[0] ?? '').replace(/\t/g, '  ').length;
}

/** Hasta dónde llega una línea con sus hijas, que son las de debajo con más sangría */
export function finDeBloque(lineas: string[], indice: number, fin: number): number {
  const sangria = sangriaDe(lineas[indice]);
  let i = indice + 1;
  while (i < fin && lineas[i].trim() && sangriaDe(lineas[i]) > sangria) i++;
  return i;
}

/**
 * Mete líneas al final de una sección: en la viñeta vacía de la plantilla si la tiene y,
 * si no, detrás de su última línea con texto, antes de los huecos que la separan de la siguiente.
 */
export function insertarAlFinal(lineas: string[], rango: Rango, nuevas: string[]): void {
  for (let i = rango.titulo + 1; i < rango.fin; i++) {
    if (RE_HUECO.test(lineas[i])) {
      lineas.splice(i, 1, ...nuevas);
      return;
    }
  }
  let ultima = rango.titulo;
  for (let i = rango.titulo + 1; i < rango.fin; i++) {
    if (lineas[i].trim()) ultima = i;
  }
  lineas.splice(ultima + 1, 0, ...nuevas);
}
