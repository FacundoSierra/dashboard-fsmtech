'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import BotonBorrar from '@/components/consultoria/BotonBorrar';
import { borrarExtorno, borrarHerramienta } from '@/lib/consultoria/acciones';
import { esCuota, type ContextoReglas, type MovimientoHucha } from '@/lib/consultoria/reglas';
import type { ClienteDeLaLista, HerramientaConAportaciones, ProductoUsado } from '@/lib/consultoria/tipos';
import { BOTON_SECUNDARIO } from './estilos';
import type { MadrePosible } from './formato';
import MensajeHecho from './MensajeHecho';

// Los dos solo viajan cuando se abren
const Cargando = () => <p className="text-sm text-apagado">Un momento…</p>;
const FormularioFirma = dynamic(() => import('./FormularioFirma'), { loading: Cargando });
const AnularHerramienta = dynamic(() => import('./AnularHerramienta'), { loading: Cargando });

/**
 * Lo que se puede hacer con una herramienta: cambiarla (el formulario de la firma, relleno), anularla
 * (con su extorno si se cobró), borrarla si es una prevista que se cae (o una cuota pendiente que no va
 * a llegar), o quitar su extorno. Lo que dice la acción al guardar o al anular se queda debajo de los
 * botones: en una serie puede llevar un aviso aunque se haya guardado («…, pero no se han podido
 * programar sus cuotas»)
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
  const [mensaje, setMensaje] = useState<string | null>(null);
  // Si al anularla el extorno no se pudo guardar, se apunta aquí con el mismo reparto
  const faltaElExtorno = h.estado === 'anulada' && h.liquidada && !h.extorno;
  const cuota = esCuota(h);

  const abrir = (que: 'cambiar' | 'anular') => {
    setMensaje(null);
    setAbierto(que);
  };
  const terminar = (texto?: string) => {
    setAbierto(null);
    setMensaje(texto ?? null);
  };

  if (abierto === 'cambiar') {
    return (
      <FormularioFirma
        contexto={contexto}
        clientes={clientes}
        productosUsados={productosUsados}
        hoy={hoy}
        herramienta={h}
        madres={madres}
        alTerminar={terminar}
      />
    );
  }
  if (abierto === 'anular') {
    return <AnularHerramienta herramienta={h} hoy={hoy} movimientos={movimientosHucha} cuadro={contexto.cuadro} alTerminar={terminar} />;
  }

  return (
    <div className="flex flex-col gap-2">
      {mensaje && <MensajeHecho texto={mensaje} />}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
        <button type="button" onClick={() => abrir('cambiar')} className={BOTON_SECUNDARIO}>
          Cambiar
        </button>
        {(h.estado !== 'anulada' || faltaElExtorno) && (
          <button type="button" onClick={() => abrir('anular')} className={BOTON_SECUNDARIO}>
            {faltaElExtorno ? 'Apuntar el extorno' : 'Anular'}
          </button>
        )}
        {!h.liquidada && !h.extorno && (
          <BotonBorrar
            descripcion={cuota ? `la cuota de ${h.producto} de ${h.cliente}` : `${h.producto} de ${h.cliente}`}
            etiqueta={cuota ? 'Borrar la cuota' : 'Borrar la herramienta'}
            className="min-h-11"
            onBorrar={async () => {
              const resultado = await borrarHerramienta(h.id);
              // Una cuota vuelve a su serie, que es donde se ven las demás
              if (!resultado.error) router.push(cuota && h.cuotaDe ? `/consultoria/produccion/${h.cuotaDe}` : `/consultoria/clientes/${h.clienteId}`);
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
    </div>
  );
}
