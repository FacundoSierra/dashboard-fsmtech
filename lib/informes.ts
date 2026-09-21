import 'server-only';
import { proyectos, type ResumenProyecto } from '@/lib/boveda/consultas';
import type { Boveda, Nota } from '@/lib/boveda/tipos';
import { economia, sumarMeses, type Renovacion } from '@/lib/economia';
import { disponibilidad } from '@/lib/vigilancia/disponibilidad';
import type { EstadoGeneral } from '@/lib/vigilancia/estado';
import { commitsEntre, tokenLectura, type Incidencia } from '@/lib/vigilancia/github';

/**
 * Informe mensual de mantenimiento para un cliente: si su web ha estado disponible, qué
 * se ha mejorado y corregido, y qué hay que renovar. Es lo que justifica una cuota de
 * mantenimiento: el trabajo que no se ve.
 */

export interface Cambios {
  mejoras: string[];
  correcciones: string[];
  seguridad: string[];
  /** Documentación, dependencias y tareas internas: se cuentan, no se listan */
  mantenimiento: number;
}

export interface InformeProyecto {
  proyecto: ResumenProyecto;
  web?: string;
  disponibilidad: { porcentaje: number; minutosCaida: number; desde: number } | null;
  incidencias: Incidencia[];
  /** `null` si no hay acceso al repo */
  cambios: Cambios | null;
  vulnerabilidades: number | null;
  certificadoHasta?: string;
}

export interface Informe {
  cliente: Nota;
  mes: string;
  proyectos: InformeProyecto[];
  renovaciones: Renovacion[];
  vigilanciaDesde: string | null;
}

const RE_CONVENCIONAL = /^(\w+)(?:\([^)]*\))?!?:\s*(.+)$/;

/** `feat(pagos): panel de pagos con gráficos [REQ-012]` → `Panel de pagos con gráficos` */
function limpiar(mensaje: string): string {
  const sinPrefijo = mensaje.match(RE_CONVENCIONAL)?.[2] ?? mensaje;
  const limpio = sinPrefijo.replace(/(\s*\[REQ-\d+\])+\s*$/i, '').trim();
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

export function clasificar(mensajes: string[]): Cambios {
  const cambios: Cambios = { mejoras: [], correcciones: [], seguridad: [], mantenimiento: 0 };
  for (const mensaje of mensajes) {
    if (/^merge\b/i.test(mensaje)) continue;
    const tipo = mensaje.match(RE_CONVENCIONAL)?.[1]?.toLowerCase();
    if (tipo === 'feat') cambios.mejoras.push(limpiar(mensaje));
    else if (tipo === 'fix') cambios.correcciones.push(limpiar(mensaje));
    else if (tipo === 'seguridad' || tipo === 'security' || /vulnerab/i.test(mensaje)) cambios.seguridad.push(limpiar(mensaje));
    else cambios.mantenimiento += 1;
  }
  return cambios;
}

/** `2026-09` → inicio y fin del mes en UTC */
export function limitesMes(mes: string): { inicio: number; fin: number } {
  const [anio, m] = mes.split('-').map(Number);
  return { inicio: Date.UTC(anio, m - 1, 1), fin: Date.UTC(anio, m, 1) };
}

export function mesAnterior(hoy: string): string {
  return sumarMeses(hoy.slice(0, 7), -1);
}

export async function informeCliente(
  boveda: Boveda,
  nombreCliente: string,
  mes: string,
  estado: EstadoGeneral,
  ahora: number,
): Promise<Informe | null> {
  const cliente = boveda.notas.find((n) => n.nombre === nombreCliente && n.propiedades.tipo === 'cliente');
  if (!cliente) return null;

  const { inicio, fin } = limitesMes(mes);
  const token = tokenLectura();
  const suyos = proyectos(boveda).filter((p) => p.cliente === cliente.nombre && p.estado !== 'completado');
  const incidencias = estado.incidencias ?? [];

  const lista = await Promise.all(
    suyos.map(async (proyecto): Promise<InformeProyecto> => {
      const vivo = estado.proyectos.find((e) => e.proyecto.nota.ruta === proyecto.nota.ruta);
      const commits =
        proyecto.repo && token
          ? await commitsEntre(proyecto.repo, new Date(inicio).toISOString(), new Date(fin).toISOString(), token)
          : null;
      const alertas = vivo?.repo?.alertas;

      return {
        proyecto,
        web: proyecto.web,
        disponibilidad: proyecto.web
          ? disponibilidad(proyecto.nota.nombre, incidencias, estado.vigilanciaDesde, inicio, fin, ahora)
          : null,
        incidencias: incidencias.filter((i) => {
          if (i.proyecto !== proyecto.nota.nombre) return false;
          const desde = new Date(i.desde).getTime();
          const hasta = i.hasta ? new Date(i.hasta).getTime() : ahora;
          return desde < fin && hasta > inicio;
        }),
        cambios: commits ? clasificar(commits.map((c) => c.mensaje)) : null,
        vulnerabilidades: alertas ? alertas.criticas + alertas.altas + alertas.medias : null,
        certificadoHasta: vivo?.certificado?.validoHasta,
      };
    }),
  );

  // Renovaciones del cliente en los próximos 12 meses: las de su ficha y los dominios de sus webs
  const hoy = new Date(ahora).toISOString().slice(0, 10);
  const dentroDeUnAnio = new Date(ahora + 365 * 86_400_000).toISOString().slice(0, 10);
  const deLaFicha = economia(boveda, hoy).renovaciones.filter((r) => r.origen === cliente.nombre);
  const dominios: Renovacion[] = estado.proyectos
    .filter((e) => e.proyecto.cliente === cliente.nombre && e.dominio?.caduca)
    .map((e) => ({ fecha: e.dominio!.caduca!.slice(0, 10), concepto: `Dominio ${e.dominio!.nombre}`, origen: e.proyecto.nota.nombre, automatica: true }));

  const vistas = new Set<string>();
  const renovaciones = [...deLaFicha, ...dominios]
    .filter((r) => r.fecha >= hoy && r.fecha <= dentroDeUnAnio)
    .filter((r) => (vistas.has(r.concepto) ? false : (vistas.add(r.concepto), true)))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  return { cliente, mes, proyectos: lista, renovaciones, vigilanciaDesde: estado.vigilanciaDesde };
}
