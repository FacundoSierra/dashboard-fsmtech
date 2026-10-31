import Link from 'next/link';
import { esApex } from '@/lib/consultoria/reglas';
import type { Herramienta } from '@/lib/consultoria/tipos';
import { euros, fechaCorta, mesCorto } from '@/lib/consultoria/formato';
import EstadoHerramienta from './EstadoHerramienta';
import { PREVISTA } from './estilos';
import { aportacionDe, cobraPocoAPoco, cuantoFalta, unidades } from './formato';
import InsigniaApex from './InsigniaApex';
import ListaApex from './ListaApex';

/**
 * Una herramienta en una columna, que cabe en 390 px: estado, producto y compañía, lo que aporta,
 * las unidades y la comisión, y sus fechas. Lleva a su página. En la ficha de un cliente, además,
 * cuándo queda libre de extorno y sus aportaciones extraordinarias (APEX) dentro, cada una con su
 * enlace: la tarjeta deja de ser un solo enlace, porque un enlace no puede ir dentro de otro. Si ella
 * misma es una APEX (en Producción), lleva la insignia «APEX de TopPlan».
 */
export default function TarjetaHerramienta({
  herramienta: h,
  compania,
  conCliente = false,
  hoy,
  aportaciones = [],
}: {
  herramienta: Herramienta;
  /** El nombre de la compañía, no el código */
  compania: string;
  conCliente?: boolean;
  /** Con él, «libre de extorno el … · faltan …» */
  hoy?: string;
  /** Sus APEX, de la más antigua a la más nueva */
  aportaciones?: Herramienta[];
}) {
  const anulada = h.estado === 'anulada';
  const pocoAPoco = cobraPocoAPoco(h.tipoComision) && h.unidades === 0;
  const falta = hoy && h.libreDeExtornoEl ? cuantoFalta(hoy, h.libreDeExtornoEl) : null;
  const prevista = h.estado === 'prevista';
  const enlace = `/consultoria/produccion/${h.id}`;
  const foco = 'focus-visible:outline-2 focus-visible:outline-acento';

  const contenido = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm font-medium ${anulada ? 'text-apagado line-through' : 'text-texto'}`}>
            {h.producto}
          </span>
          <span className="block truncate text-sm text-tenue">
            {compania}
            {conCliente && ` · ${h.cliente}`}
          </span>
          {esApex(h) && (
            <span className="mt-1.5 flex">
              <InsigniaApex de={h.de} />
            </span>
          )}
        </span>
        <EstadoHerramienta estado={h.estado} />
      </span>

      <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-sm">
        <span className="text-tenue">
          {aportacionDe(h)} · {h.pago === 'transferencia' ? 'Transferencia' : 'Domiciliación'}
        </span>
        <span className="cifras font-medium text-texto">
          {pocoAPoco ? `${unidades(h.unidadesNivel ?? 0)} para el nivel` : `${unidades(h.unidades)} · ${euros(h.bruto)}`}
        </span>
      </span>

      <span className="text-sm text-apagado">
        Producción {mesCorto(h.mesProduccion)} · efecto {fechaCorta(h.fechaEfecto)} · cobro {mesCorto(h.fechaCobro)}
        {h.fechasProvisionales && ' (sin confirmar)'}
      </span>

      {hoy && h.libreDeExtornoEl && (
        <span className="text-sm text-tenue">
          Libre de extorno el {fechaCorta(h.libreDeExtornoEl)}
          {falta ? ` · ${falta}` : ' · ya está libre'}
        </span>
      )}
      {h.extorno && (
        <span className="text-sm text-critico-texto">
          Extorno de {euros(h.extorno.importe)} el {fechaCorta(h.extorno.fecha)}
        </span>
      )}
    </>
  );

  if (aportaciones.length === 0) {
    return (
      <Link
        href={enlace}
        className={`flex flex-col gap-2 rounded-lg px-4 py-3.5 transition-colors ${foco} ${
          prevista ? PREVISTA : 'bg-superficie-2 hover:bg-borde'
        }`}
      >
        {contenido}
      </Link>
    );
  }

  // Con APEX: una sola tarjeta con dos zonas, la herramienta arriba y sus APEX debajo
  return (
    <div className={`flex flex-col rounded-lg ${prevista ? 'border border-dashed border-borde-control bg-superficie' : 'bg-superficie-2'}`}>
      <Link
        href={enlace}
        className={`flex flex-col gap-2 rounded-lg px-4 py-3.5 transition-colors ${foco} ${
          prevista ? 'hover:bg-superficie-2' : 'hover:bg-borde'
        }`}
      >
        {contenido}
      </Link>
      <div className="mx-4 border-t border-borde" />
      <ListaApex aportaciones={aportaciones} producto={h.producto} dentroDeUnaTarjeta className="px-1 py-1.5" />
    </div>
  );
}
