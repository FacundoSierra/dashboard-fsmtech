import 'server-only';
import { cache } from 'react';
import { proyectos, type ResumenProyecto } from '@/lib/boveda/consultas';
import type { Boveda } from '@/lib/boveda/tipos';
import { dominioDe, dominioRegistrable, type Dominio } from './dominios';
import { estadoRepo, incidencias, inicioVigilancia, tokenLectura, type EstadoRepo, type Incidencia } from './github';
import { urlVigilable } from './red';
import { comprobarSupabase, type EstadoSupabase } from './supabase';
import { certificadoDe, comprobarWeb, type Certificado, type EstadoWeb } from './webs';

export interface EstadoProyecto {
  proyecto: ResumenProyecto;
  web?: EstadoWeb;
  certificado?: Certificado;
  dominio?: Dominio;
  supabase?: EstadoSupabase;
  repo?: EstadoRepo;
}

export interface EstadoGeneral {
  proyectos: EstadoProyecto[];
  /** Sin token de lectura, la parte de GitHub no se puede enseñar */
  github: 'configurado' | 'sin-token';
  incidencias: Incidencia[] | null;
  /** Primera ejecución de la vigilancia horaria; `null` si todavía no está en marcha */
  vigilanciaDesde: string | null;
  comprobado: string;
}

async function estadoDe(proyecto: ResumenProyecto, token: string | undefined): Promise<EstadoProyecto> {
  const url = urlVigilable(proyecto.web);
  const dominio = url ? dominioRegistrable(url.hostname) : undefined;

  const [web, certificado, datosDominio, supabase, repo] = await Promise.all([
    url ? comprobarWeb(url.toString()) : undefined,
    url?.protocol === 'https:' ? certificadoDe(url.hostname) : undefined,
    dominio ? dominioDe(dominio) : undefined,
    proyecto.supabase ? comprobarSupabase(proyecto.supabase) : undefined,
    proyecto.repo && token ? estadoRepo(proyecto.repo, token) : undefined,
  ]);

  return { proyecto, web, certificado, dominio: datosDominio, supabase, repo };
}

/**
 * Estado técnico de los proyectos activos. Una vez por petición: la página de Hoy, el
 * menú de avisos y la de Estado comparten el mismo resultado.
 *
 * Los pausados no se vigilan: sus bases de Supabase gratuitas se pausan solas y solo
 * darían avisos que no hay que atender.
 */
export const estadoGeneral = cache(async (boveda: Boveda): Promise<EstadoGeneral> => {
  const token = tokenLectura();
  const activos = proyectos(boveda).filter((p) => p.estado === 'activo');
  const [lista, historial, desde] = await Promise.all([
    Promise.all(activos.map((p) => estadoDe(p, token))),
    token ? incidencias(token) : Promise.resolve(null),
    token ? inicioVigilancia(token) : Promise.resolve(null),
  ]);

  return {
    proyectos: lista,
    github: token ? 'configurado' : 'sin-token',
    incidencias: historial,
    vigilanciaDesde: desde,
    comprobado: new Date().toISOString(),
  };
});
