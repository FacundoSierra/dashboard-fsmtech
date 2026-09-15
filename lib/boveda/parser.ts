import { parse } from 'yaml';
import type { Nota, Propiedades, Seccion, Tarea } from './tipos';

const RE_FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const RE_COMENTARIO = /%%[\s\S]*?%%/g;
const RE_VALLA = /^\s*(```|~~~)/;
const RE_TITULO = /^(#{1,6})\s+(.+?)\s*$/;
const RE_TAREA = /^(\s*)[-*+] \[([ xX])\] (.*)$/;
const RE_VINETA = /^\s*[-*+] (?!\[[ xX]\] )(.*\S.*)$/;
const RE_ENLACE = /!?\[\[([^\]|#\\]+)/g;
const RE_ETIQUETA = /(?:^|\s)#([A-Za-z0-9_ÁÉÍÓÚÜÑáéíóúüñ][A-Za-z0-9_ÁÉÍÓÚÜÑáéíóúüñ/-]*)/g;

export function separarFrontmatter(texto: string): { propiedades: Propiedades; cuerpo: string } {
  const coincidencia = texto.match(RE_FRONTMATTER);
  if (!coincidencia) return { propiedades: {}, cuerpo: texto };

  let propiedades: Propiedades = {};
  try {
    // YAML 1.2: las fechas quedan como texto `YYYY-MM-DD`, no como objetos Date
    const datos: unknown = parse(coincidencia[1]);
    if (datos && typeof datos === 'object' && !Array.isArray(datos)) propiedades = datos as Propiedades;
  } catch {
    // Frontmatter mal formado: la nota se muestra igualmente, sin propiedades
  }
  return { propiedades, cuerpo: texto.slice(coincidencia[0].length) };
}

export function dividirSecciones(cuerpo: string): Seccion[] {
  const secciones: Seccion[] = [];
  let actual = { titulo: '', nivel: 0, lineas: [] as string[] };
  let enCodigo = false;

  for (const linea of cuerpo.split(/\r?\n/)) {
    if (RE_VALLA.test(linea)) enCodigo = !enCodigo;
    const titulo = enCodigo ? null : linea.match(RE_TITULO);
    if (titulo) {
      secciones.push({ titulo: actual.titulo, nivel: actual.nivel, contenido: actual.lineas.join('\n') });
      actual = { titulo: titulo[2], nivel: titulo[1].length, lineas: [] };
    } else {
      actual.lineas.push(linea);
    }
  }
  secciones.push({ titulo: actual.titulo, nivel: actual.nivel, contenido: actual.lineas.join('\n') });
  return secciones;
}

export function tareasDe(texto: string): Tarea[] {
  const tareas: Tarea[] = [];
  let enCodigo = false;

  for (const linea of texto.split(/\r?\n/)) {
    if (RE_VALLA.test(linea)) {
      enCodigo = !enCodigo;
      continue;
    }
    const tarea = enCodigo ? null : linea.match(RE_TAREA);
    if (!tarea || !tarea[3].trim()) continue; // las `- [ ]` vacías de las plantillas no cuentan

    const sangria = tarea[1].replace(/\t/g, '  ').length;
    tareas.push({ texto: tarea[3].trim(), hecha: tarea[2] !== ' ', nivel: Math.floor(sangria / 2) });
  }
  return tareas;
}

/** Viñetas con texto que no son tareas */
export function vinetasDe(texto: string): string[] {
  return texto
    .split(/\r?\n/)
    .map((linea) => linea.match(RE_VINETA)?.[1]?.trim())
    .filter((vineta): vineta is string => Boolean(vineta));
}

/** `carpeta/nota.md`, `nota` o `nota\` (alias escapado en tablas) → `nota` */
export function nombreDeDestino(destino: string): string {
  const base = destino.trim().replace(/\\$/, '').split('/').pop() ?? '';
  return base.replace(/\.md$/i, '');
}

export function enlacesDe(texto: string): string[] {
  const nombres = new Set<string>();
  for (const coincidencia of texto.matchAll(RE_ENLACE)) nombres.add(nombreDeDestino(coincidencia[1]));
  return [...nombres];
}

export function etiquetasDe(texto: string): string[] {
  const sinCodigo = texto.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  const etiquetas = new Set<string>();
  for (const coincidencia of sinCodigo.matchAll(RE_ETIQUETA)) etiquetas.add(coincidencia[1]);
  return [...etiquetas];
}

/** Minúsculas, sin tildes ni emojis: "🎯 Objetivos" → "objetivos" */
export function normalizar(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9/ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Contenido de la primera sección cuyo título contiene `clave`, con sus subsecciones */
export function contenidoSeccion(nota: Nota, clave: string): string | undefined {
  const buscada = normalizar(clave);
  const indice = nota.secciones.findIndex((s) => s.nivel > 0 && normalizar(s.titulo).includes(buscada));
  if (indice === -1) return undefined;

  const { nivel } = nota.secciones[indice];
  const partes = [nota.secciones[indice].contenido];
  for (let i = indice + 1; i < nota.secciones.length && nota.secciones[i].nivel > nivel; i++) {
    const sub = nota.secciones[i];
    partes.push(`${'#'.repeat(sub.nivel)} ${sub.titulo}`, sub.contenido);
  }
  return partes.join('\n');
}

export function parsearNota(ruta: string, contenido: string): Nota {
  const sinComentarios = contenido.replace(/^﻿/, '').replace(RE_COMENTARIO, '');
  const { propiedades, cuerpo } = separarFrontmatter(sinComentarios);
  const secciones = dividirSecciones(cuerpo);
  const partes = ruta.split('/');
  const nombre = nombreDeDestino(ruta);

  return {
    ruta,
    nombre,
    carpeta: partes.length > 1 ? partes[0] : '',
    titulo: secciones.find((s) => s.nivel === 1)?.titulo ?? nombre,
    propiedades,
    cuerpo,
    secciones,
    etiquetas: etiquetasDe(cuerpo),
    enlaces: enlacesDe(sinComentarios),
  };
}
