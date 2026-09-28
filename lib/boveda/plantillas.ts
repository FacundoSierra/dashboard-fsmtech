import 'server-only';
import { insertarAlFinal, rangoSeccion, saltoDe } from './lineas';

/**
 * Notas nuevas hechas con las plantillas de verdad de la bóveda (`templates/`), para que una
 * nota creada desde el panel sea igual que una creada en Obsidian o por Claude. De la plantilla
 * solo se cambia lo que se pide: el título, las fechas, las propiedades dadas y el contenido
 * de las secciones dadas. El resto (comentarios de ayuda, secciones, etiquetas) se queda.
 */

/**
 * El valor de una propiedad: un texto ya listo para YAML (`2026-09-28`, `"[[cni]]"`), una lista
 * de textos, o un bloque de líneas con su sangría (el `plan` de los cobros)
 */
export type ValorPropiedad = string | string[] | { bloque: string[] };

export interface Relleno {
  titulo: string;
  /** `AAAA-MM-DD`: sustituye `{{date:…}}` */
  fecha: string;
  propiedades?: Record<string, ValorPropiedad>;
  /** Líneas que van al final de cada sección, por su título sin emoji: `objetivo`, `cobros`… */
  secciones?: Record<string, string[]>;
}

/** Un texto para YAML entre comillas, con lo que haga falta escapado */
export const comillas = (valor: string): string => JSON.stringify(valor);

function lineasDe(clave: string, valor: ValorPropiedad): string[] {
  if (typeof valor === 'string') return [`${clave}: ${valor}`];
  if (Array.isArray(valor)) return valor.length ? [`${clave}:`, ...valor.map((v) => `  - ${v}`)] : [`${clave}: []`];
  return [`${clave}:`, ...valor.bloque];
}

export function rellenarPlantilla(plantilla: string, relleno: Relleno): string {
  const salto = saltoDe(plantilla);
  const texto = plantilla
    .replace(/^﻿/, '')
    .replace(/\{\{title\}\}/g, relleno.titulo)
    .replace(/\{\{date:YYYY-MM-DD\}\}|\{\{date\}\}/g, relleno.fecha)
    .replace(/\{\{date:YYYY-MM\}\}/g, relleno.fecha.slice(0, 7))
    .replace(/\{\{date:YYYY\}\}/g, relleno.fecha.slice(0, 4));
  const lineas = texto.split(/\r?\n/);

  // Propiedades: la línea de la clave y las sangradas que cuelgan de ella se cambian por el valor
  // nuevo; si la plantilla no la tiene, se añade al final del frontmatter
  const cierre = lineas[0] === '---' ? lineas.findIndex((l, i) => i > 0 && l === '---') : -1;
  if (cierre > 0) {
    let fin = cierre;
    for (const [clave, valor] of Object.entries(relleno.propiedades ?? {})) {
      const nuevas = lineasDe(clave, valor);
      const inicio = lineas.findIndex((l, i) => i > 0 && i < fin && l.startsWith(`${clave}:`));
      if (inicio === -1) {
        lineas.splice(fin, 0, ...nuevas);
      } else {
        let hasta = inicio + 1;
        while (hasta < fin && /^\s+\S/.test(lineas[hasta])) hasta++;
        lineas.splice(inicio, hasta - inicio, ...nuevas);
      }
      fin = lineas.findIndex((l, i) => i > 0 && l === '---');
    }
  }

  for (const [clave, nuevas] of Object.entries(relleno.secciones ?? {})) {
    const rango = rangoSeccion(lineas, clave);
    if (rango && nuevas.length) insertarAlFinal(lineas, rango, nuevas);
  }

  // El título de la plantilla, si no llevaba {{title}}, también es el que se pide
  const titulo = lineas.findIndex((l, i) => i > cierre && /^# /.test(l));
  if (titulo !== -1) lineas[titulo] = `# ${relleno.titulo}`;

  return lineas.join(salto);
}
