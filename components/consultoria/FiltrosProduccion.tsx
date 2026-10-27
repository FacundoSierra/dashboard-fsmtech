'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { DatosCompania, EstadoHerramienta } from '@/lib/consultoria/reglas';
import { mesCorto } from '@/lib/consultoria/formato';
import { CAMPO } from './estilos';
import { NOMBRE_ESTADO } from './formato';

const ESTADOS = Object.keys(NOMBRE_ESTADO) as EstadoHerramienta[];

/**
 * Mes de producción, compañía y estado. Van en la dirección (`?mes=2026-11&compania=AXA&estado=prevista`),
 * así que un filtro se guarda o se comparte, y la lista la resuelve el servidor.
 */
export default function FiltrosProduccion({ meses, companias }: { meses: string[]; companias: DatosCompania[] }) {
  const router = useRouter();
  const parametros = useSearchParams();

  function cambiar(clave: 'mes' | 'compania' | 'estado', valor: string) {
    const nuevos = new URLSearchParams(parametros.toString());
    if (valor) nuevos.set(clave, valor);
    else nuevos.delete(clave);
    const consulta = nuevos.toString();
    router.push(consulta ? `/consultoria/produccion?${consulta}` : '/consultoria/produccion');
  }

  const hayFiltros = ['mes', 'compania', 'estado'].some((clave) => parametros.get(clave));

  return (
    // Con la dirección cambia todo: así «Quitar los filtros» también vacía los selectores
    <div key={parametros.toString()} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <label className="text-sm font-medium text-tenue">
        Mes de producción
        <select defaultValue={parametros.get('mes') ?? ''} onChange={(e) => cambiar('mes', e.target.value)} className={`${CAMPO} mt-1`}>
          <option value="">Todos</option>
          {meses.map((mes) => (
            <option key={mes} value={mes.slice(0, 7)}>
              {mesCorto(mes)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-tenue">
        Compañía
        <select defaultValue={parametros.get('compania') ?? ''} onChange={(e) => cambiar('compania', e.target.value)} className={`${CAMPO} mt-1`}>
          <option value="">Todas</option>
          {companias.map((c) => (
            <option key={c.codigo} value={c.codigo}>
              {c.nombre}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-tenue">
        Estado
        <select defaultValue={parametros.get('estado') ?? ''} onChange={(e) => cambiar('estado', e.target.value)} className={`${CAMPO} mt-1`}>
          <option value="">Todos</option>
          {ESTADOS.map((estado) => (
            <option key={estado} value={estado}>
              {NOMBRE_ESTADO[estado]}
            </option>
          ))}
        </select>
      </label>
      {hayFiltros && (
        <button
          type="button"
          onClick={() => router.push('/consultoria/produccion')}
          className="min-h-11 justify-self-start text-sm font-medium text-tenue underline-offset-4 hover:text-texto hover:underline sm:col-span-3"
        >
          Quitar los filtros
        </button>
      )}
    </div>
  );
}
