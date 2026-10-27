'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import BotonBorrar from '@/components/consultoria/BotonBorrar';
import { borrarExtorno, borrarHerramienta } from '@/lib/consultoria/acciones';
import type { ContextoReglas, MovimientoHucha } from '@/lib/consultoria/reglas';
import type { ClienteDeLaLista, HerramientaConAportaciones, ProductoUsado } from '@/lib/consultoria/tipos';
import { BOTON_SECUNDARIO } from './estilos';
import type { MadrePosible } from './formato';

// Los dos solo viajan cuando se abren
const Cargando = () => <p className="text-sm text-apagado">Un momento…</p>;
const FormularioFirma = dynamic(() => import('./FormularioFirma'), { loading: Cargando });
const AnularHerramienta = dynamic(() => import('./AnularHerramienta'), { loading: Cargando });

/**
 * Lo que se puede hacer con una herramienta: cambiarla (el formulario de la firma, relleno), anularla
 * (con su extorno si se cobró), borrarla si es una prevista que se cae, o quitar su extorno.
 */
export default function AccionesHerramienta({
  herramienta: h,
  contexto,
  clientes,
  productosUsados,
  movimientosHucha,
  madres,
  hoy,
}: {
  herramienta: HerramientaConAportaciones;
  contexto: ContextoReglas;
  clientes: ClienteDeLaLista[];
  productosUsados: ProductoUsado[];
  movimientosHucha: MovimientoHucha[];
  /** De las que puede colgar si es una APEX (`madresPosibles`) */
  madres: MadrePosible[];
  hoy: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState<'cambiar' | 'anular' | null>(null);
  // Si al anularla el extorno no se pudo guardar, se apunta aquí con el mismo reparto
  const faltaElExtorno = h.estado === 'anulada' && h.liquidada && !h.extorno;

  if (abierto === 'cambiar') {
    return (
      <FormularioFirma
        contexto={contexto}
        clientes={clientes}
        productosUsados={productosUsados}
        hoy={hoy}
        herramienta={h}
        madres={madres}
        alTerminar={() => setAbierto(null)}
      />
    );
  }
  if (abierto === 'anular') {
    return <AnularHerramienta herramienta={h} hoy={hoy} movimientos={movimientosHucha} cuadro={contexto.cuadro} alTerminar={() => setAbierto(null)} />;
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
      <button type="button" onClick={() => setAbierto('cambiar')} className={BOTON_SECUNDARIO}>
        Cambiar
      </button>
      {(h.estado !== 'anulada' || faltaElExtorno) && (
        <button type="button" onClick={() => setAbierto('anular')} className={BOTON_SECUNDARIO}>
          {faltaElExtorno ? 'Apuntar el extorno' : 'Anular'}
        </button>
      )}
      {!h.liquidada && !h.extorno && (
        <BotonBorrar
          descripcion={`${h.producto} de ${h.cliente}`}
          etiqueta="Borrar la herramienta"
          className="min-h-11"
          onBorrar={async () => {
            const resultado = await borrarHerramienta(h.id);
            if (!resultado.error) router.push(`/consultoria/clientes/${h.clienteId}`);
            return resultado;
          }}
        />
      )}
      {h.extorno && !h.extorno.aplicado && (
        <BotonBorrar
          descripcion={`el extorno de ${h.producto}`}
          etiqueta="Quitar el extorno"
          enCurso="Quitando…"
          className="min-h-11"
          onBorrar={() => borrarExtorno(h.extorno?.id ?? '')}
        />
      )}
    </div>
  );
}
