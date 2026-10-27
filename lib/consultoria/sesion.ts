import 'server-only';
import { cache } from 'react';
import { baseDeDatos, hayBase } from '@/lib/base/cliente';
import type { LoQueFalta } from '@/lib/consultoria/tipos';
import { verificarSesion } from '@/lib/sesion';

/**
 * La puerta de la sección Consultoría (REQ-001, spec 5), lo que en FSM-Finance era `exigirConsultor()`.
 * El panel tiene un solo usuario y la base, un solo consultor (`consultoria_consultores_uno`): no hay
 * roles que mirar, solo si hay sesión y si la base está lista.
 *
 * - **Sin sesión, a `/login`** (`verificarSesion()`), antes de mirar nada
 * - Sin las variables de la base, `configuracion`; sin la migración (la tabla no existe), `0001`; sin
 *   consultor (la base está vacía hasta la copia), `copia`. La página lo dice con `FaltaMigracion`
 * - Con consultor: su `id` (el mismo que en FSM-Finance) y `fuenteDesde`, la hora del cambio. **Mientras
 *   sea null, la consultoría se sigue llevando en FSM-Finance** y ninguna acción escribe (spec 6.2)
 * - Otro error (la base no responde, está en pausa) no se tapa: va al log con su código y su mensaje,
 *   y se lanza uno sin detalles, que recoge el `error.tsx` de la sección
 * - Memorizada por petición con `cache()` de React: el layout y la página la llaman sin repetir la consulta
 */

export interface Consultor {
  id: string;
  /** Desde cuándo la base del panel es la fuente (AAAA-MM-DDTHH:MM:SS…); null hasta el cambio */
  fuenteDesde: string | null;
}

export type AccesoConsultoria = { consultor: Consultor } | { pendiente: true; falta: LoQueFalta };

/** Tabla, vista, columna o función que no existe: falta la migración */
const CODIGOS_SIN_MIGRACION = new Set(['42P01', '42703', 'PGRST205', 'PGRST204', 'PGRST202']);

export const exigirConsultoria = cache(async (): Promise<AccesoConsultoria> => {
  await verificarSesion();
  if (!hayBase()) return { pendiente: true, falta: 'configuracion' };

  const base = await baseDeDatos();
  const { data, error } = await base.from('consultoria_consultores').select('id, fuente_desde').limit(1).maybeSingle();
  if (error) {
    if (error.code && CODIGOS_SIN_MIGRACION.has(error.code)) return { pendiente: true, falta: '0001' };
    console.error(`[consultoría] No se ha podido leer el consultor: ${error.code || 'sin código'} ${error.message}`);
    throw new Error('No se ha podido leer la consultoría. Vuelve a intentarlo dentro de un momento.');
  }
  if (!data) return { pendiente: true, falta: 'copia' };
  return { consultor: { id: data.id as string, fuenteDesde: (data.fuente_desde as string | null) ?? null } };
});
