import 'server-only';
import { cache } from 'react';
import { diasEntre } from '@/lib/fechas';
import { verificarSesion } from '@/lib/sesion';
import type { AutorizacionVigilancia } from '@/lib/vigilancia/acceso';
import { leerNotas } from './fuente';
import { contenidoSeccion, enlacesDe, nombreDeDestino, parsearNota, tareasDe, vinetasDe } from './parser';
import type { Boveda, Nota, Tarea } from './tipos';

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const DIAS_PENDIENTES_ANTERIORES = 14;

/** Lee y analiza todas las notas una vez por petición, siempre después de comprobar la sesión */
export const obtenerBoveda = cache(async (): Promise<Boveda> => {
  await verificarSesion();
  return cargarBoveda();
});

/**
 * Lo mismo, para `/api/vigilancia`, que no tiene sesión: la llama la vigilancia horaria de
 * GitHub con su propio secreto. Exige la autorización que da `autorizarVigilancia()`.
 */
export async function obtenerBovedaParaVigilancia(autorizacion: AutorizacionVigilancia): Promise<Boveda> {
  if (!autorizacion) throw new Error('Sin autorización de la vigilancia');
  return cargarBoveda();
}

async function cargarBoveda(): Promise<Boveda> {
  const notas = (await leerNotas())
    .map(({ ruta, contenido }) => parsearNota(ruta, contenido))
    .sort((a, b) => a.ruta.localeCompare(b.ruta));

  return {
    notas,
    porRuta: new Map(notas.map((nota) => [nota.ruta, nota])),
    rutas: diccionario(notas.map((nota): [string, string] => [nota.nombre, nota.ruta])),
    titulos: diccionario(notas.map((nota): [string, string] => [nota.nombre, nota.titulo])),
  };
}

/** Objeto sin prototipo: un `[[constructor]]` o `[[toString]]` en una nota no debe resolver a nada */
function diccionario(pares: [string, string][]): Record<string, string> {
  return Object.assign(Object.create(null) as Record<string, string>, Object.fromEntries(pares));
}

// ── Propiedades ──────────────────────────────────────────────────────────────

export function texto(valor: unknown): string | undefined {
  if (typeof valor === 'number') return String(valor);
  return typeof valor === 'string' && valor.trim() ? valor.trim() : undefined;
}

export function lista(valor: unknown): string[] {
  const valores = Array.isArray(valor) ? valor : [valor];
  return valores.map(texto).filter((v): v is string => v !== undefined);
}

/** `"[[cj-fitness|CJ]]"` → `cj-fitness`; un texto sin corchetes se devuelve tal cual */
export function destinoEnlace(valor: string): string {
  const enlace = valor.match(/\[\[([^\]|#\\]+)/);
  return nombreDeDestino(enlace ? enlace[1] : valor);
}

export function esPrioritaria(tarea: Tarea): boolean {
  return /🚨|#prioridad\/alta|urgente/i.test(tarea.texto);
}

// ── Notas ────────────────────────────────────────────────────────────────────

export function buscarNota(boveda: Boveda, segmentos: string[]): Nota | undefined {
  const unida = segmentos.join('/');
  let decodificada = unida;
  try {
    decodificada = decodeURIComponent(unida);
  } catch {
    // La ruta ya venía decodificada
  }
  return boveda.porRuta.get(`${decodificada}.md`) ?? boveda.porRuta.get(`${unida}.md`);
}

export function notasQueEnlazan(boveda: Boveda, nota: Nota): Nota[] {
  return boveda.notas.filter((otra) => otra.ruta !== nota.ruta && otra.enlaces.includes(nota.nombre));
}

export function requerimientosPendientes(boveda: Boveda): Nota[] {
  return boveda.notas.filter(
    (nota) =>
      nota.propiedades.tipo === 'requerimiento' &&
      !['hecho', 'descartado'].includes(texto(nota.propiedades.estado) ?? ''),
  );
}

// ── Daily notes ──────────────────────────────────────────────────────────────

export function dailies(boveda: Boveda): Nota[] {
  return boveda.notas
    .filter((nota) => nota.carpeta === 'daily-notes' && RE_FECHA.test(nota.nombre))
    .sort((a, b) => b.nombre.localeCompare(a.nombre));
}

function claveTarea(textoTarea: string): string {
  return textoTarea.toLowerCase().replace(/\[\[|\]\]/g, '').replace(/\s+/g, ' ').trim();
}

export interface ResumenHoy {
  daily?: Nota;
  /** Todas las tareas de "Objetivos", con subtareas */
  objetivos: Tarea[];
  completado: Tarea[];
  /** Objetivos sin marcar de días anteriores que no están en la daily de hoy */
  anteriores: { fecha: string; nota: Nota; tareas: Tarea[] }[];
}

export function resumenHoy(boveda: Boveda, hoy: string): ResumenHoy {
  const hastaHoy = dailies(boveda).filter((nota) => nota.nombre <= hoy);
  const daily = hastaHoy.find((nota) => nota.nombre === hoy);
  const objetivos = daily ? tareasDe(contenidoSeccion(daily, 'objetivos') ?? '') : [];
  const completado = daily
    ? tareasDe(contenidoSeccion(daily, 'completado') ?? '').filter((t) => t.nivel === 0 && t.hecha)
    : [];

  const vistas = new Set(objetivos.map((t) => claveTarea(t.texto)));
  const anteriores: ResumenHoy['anteriores'] = [];
  for (const nota of hastaHoy) {
    if (nota.nombre === hoy || diasEntre(nota.nombre, hoy) > DIAS_PENDIENTES_ANTERIORES) continue;
    const tareas = tareasDe(contenidoSeccion(nota, 'objetivos') ?? '').filter(
      (t) => t.nivel === 0 && !t.hecha && !vistas.has(claveTarea(t.texto)),
    );
    tareas.forEach((t) => vistas.add(claveTarea(t.texto)));
    if (tareas.length) anteriores.push({ fecha: nota.nombre, nota, tareas });
  }

  return { daily, objetivos, completado, anteriores };
}

// ── Proyectos ────────────────────────────────────────────────────────────────

export interface ResumenProyecto {
  nota: Nota;
  estado: string;
  cliente?: string;
  stack: string[];
  web?: string;
  remoto?: string;
  /** Repo de GitHub sacado de `remoto` */
  repo?: RepoGitHub;
  /** URL pública del proyecto de Supabase (`https://<ref>.supabase.co`); no es una clave */
  supabase?: string;
  /** Tareas sin hacer de "Próximos pasos", las prioritarias primero */
  abiertas: Tarea[];
  hechas: number;
}

export function proyectos(boveda: Boveda): ResumenProyecto[] {
  return boveda.notas
    .filter((nota) => nota.propiedades.tipo === 'proyecto')
    .map((nota) => {
      const p = nota.propiedades;
      const tareas = tareasDe(contenidoSeccion(nota, 'proximos pasos') ?? '');
      const abiertas = tareas.filter((t) => !t.hecha);
      return {
        nota,
        estado: texto(p.estado) ?? 'sin estado',
        cliente: lista(p.cliente).map(destinoEnlace)[0],
        stack: lista(p.stack),
        web: texto(p.web) ?? nota.cuerpo.match(/Web:\s*(https?:\/\/[^\s)>]+)/)?.[1],
        remoto: texto(p.remoto),
        repo: repoDeRemoto(texto(p.remoto)),
        supabase: urlSupabase(texto(p.supabase)),
        abiertas: [...abiertas.filter(esPrioritaria), ...abiertas.filter((t) => !esPrioritaria(t))],
        hechas: tareas.length - abiertas.length,
      };
    })
    .sort((a, b) => a.nota.titulo.localeCompare(b.nota.titulo, 'es'));
}

export interface RepoGitHub {
  propietario: string;
  nombre: string;
}

const RE_REPO_GITHUB = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/;

/** `https://github.com/FacundoSierra/pactum` → `{ propietario, nombre }` */
export function repoDeRemoto(remoto: string | undefined): RepoGitHub | undefined {
  const partes = remoto?.match(RE_REPO_GITHUB);
  return partes ? { propietario: partes[1], nombre: partes[2] } : undefined;
}

/** Solo URLs de proyecto de Supabase: el panel no llama a ninguna otra dirección desde esta propiedad */
function urlSupabase(valor: string | undefined): string | undefined {
  return valor && /^https:\/\/[a-z0-9]{20}\.supabase\.co\/?$/.test(valor) ? valor.replace(/\/$/, '') : undefined;
}

// ── Reuniones ────────────────────────────────────────────────────────────────

export interface ResumenReunion {
  nota: Nota;
  fecha?: string;
  hora?: string;
  cliente?: string;
  proyectos: string[];
  abiertas: Tarea[];
}

export function reuniones(boveda: Boveda): ResumenReunion[] {
  return boveda.notas
    .filter((nota) => nota.propiedades.tipo === 'reunion')
    .map((nota) => {
      const p = nota.propiedades;
      const fecha = texto(p.fecha) ?? nota.nombre.slice(0, 10);
      return {
        nota,
        fecha: RE_FECHA.test(fecha) ? fecha : undefined,
        hora: texto(p.hora),
        cliente: lista(p.cliente).map(destinoEnlace)[0],
        proyectos: lista(p.proyectos).map(destinoEnlace),
        abiertas: tareasDe(nota.cuerpo).filter((t) => !t.hecha),
      };
    })
    .sort((a, b) => `${a.fecha ?? ''} ${a.hora ?? ''}`.localeCompare(`${b.fecha ?? ''} ${b.hora ?? ''}`));
}

export function reunionesProximas(boveda: Boveda, hoy: string): ResumenReunion[] {
  return reuniones(boveda).filter((r) => r.fecha !== undefined && r.fecha >= hoy);
}

export function reunionesAnteriores(boveda: Boveda, hoy: string): ResumenReunion[] {
  return reuniones(boveda)
    .filter((r) => r.fecha === undefined || r.fecha < hoy)
    .reverse();
}

// ── Clientes ─────────────────────────────────────────────────────────────────

export interface ResumenCliente {
  nota: Nota;
  sector?: string;
  web?: string;
  proyectos: ResumenProyecto[];
  contactos: Nota[];
  proximaReunion?: ResumenReunion;
  tareasAbiertas: number;
  ideas: { texto: string; origen: Nota }[];
}

export function clientes(boveda: Boveda, hoy: string): ResumenCliente[] {
  const todosLosProyectos = proyectos(boveda);
  const proximas = reunionesProximas(boveda, hoy);
  const personas = boveda.notas.filter((nota) => nota.carpeta === 'personas');
  const diarias = dailies(boveda);

  return boveda.notas
    .filter((nota) => nota.propiedades.tipo === 'cliente')
    .map((nota) => {
      const suyos = todosLosProyectos.filter((p) => p.cliente === nota.nombre);
      const enlazadosEnContactos = enlacesDe(contenidoSeccion(nota, 'contactos') ?? '');
      const contactos = personas.filter(
        (persona) =>
          lista(persona.propiedades.empresa).map(destinoEnlace).includes(nota.nombre) ||
          enlazadosEnContactos.includes(persona.nombre),
      );

      // Ideas: las de sus contactos y las de las dailies que enlazan al cliente o a sus proyectos
      const relacionadas = new Set([nota.nombre, ...suyos.map((p) => p.nota.nombre)]);
      const ideas = [
        ...contactos.flatMap((persona) =>
          vinetasDe(contenidoSeccion(persona, 'oportunidades') ?? '').map((t) => ({ texto: t, origen: persona })),
        ),
        ...diarias.flatMap((daily) =>
          ['ideas que surgieron', 'ideas / pensamientos']
            .flatMap((clave) => vinetasDe(contenidoSeccion(daily, clave) ?? ''))
            .filter((t) => enlacesDe(t).some((enlace) => relacionadas.has(enlace)))
            .map((t) => ({ texto: t, origen: daily })),
        ),
      ];

      return {
        nota,
        sector: texto(nota.propiedades.sector),
        web: texto(nota.propiedades.web),
        proyectos: suyos,
        contactos,
        proximaReunion: proximas.find((r) => r.cliente === nota.nombre),
        tareasAbiertas: suyos.reduce((total, p) => total + p.abiertas.length, 0),
        ideas,
      };
    })
    .sort((a, b) => a.nota.titulo.localeCompare(b.nota.titulo, 'es'));
}
