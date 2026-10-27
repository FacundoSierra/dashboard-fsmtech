import Link from 'next/link';
import type { DetalleDelMes, MesLiquidacion } from '@/lib/consultoria/tipos';
import { euros, fechaCorta } from '@/lib/consultoria/formato';
import AccionesDelMes from './AccionesDelMes';
import Aviso from './Aviso';
import { conSigno } from './DesgloseLiquidacion';
import EstadoHerramienta from './EstadoHerramienta';
import { productoConApex, soloElMes, unidades } from './formato';

/**
 * Un mes por dentro: sus líneas (cada una lleva a su herramienta; la de una APEX, rotulada «TopPlan ·
 * APEX») y sus cargos y abonos, y «Ha llegado» o «Deshacer». En el móvil, filas de una columna.
 */
export default function DetalleLiquidacion({
  mes,
  detalle,
  minimoTransferencia,
  saldoHucha,
  hoy,
}: {
  mes: MesLiquidacion;
  detalle: DetalleDelMes;
  minimoTransferencia: number;
  saldoHucha: number;
  hoy: string;
}) {
  const llegado = mes.liquidacionId !== null;
  const { lineas, cargos } = detalle;

  return (
    <div className="mt-5 flex flex-col gap-5 border-t border-borde pt-5">
      <section aria-label={`Líneas de ${soloElMes(mes.mes)}`}>
        <h4 className="text-sm font-semibold text-texto">Líneas</h4>
        {lineas.length === 0 ? (
          <p className="mt-2 text-sm text-tenue">Sin comisiones este mes.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {lineas.map((l) => (
              <li key={l.herramientaId}>
                <Link
                  href={`/consultoria/produccion/${l.herramientaId}`}
                  className={`flex items-start justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors focus-visible:outline-2 focus-visible:outline-acento ${
                    l.prevista ? 'bg-aviso/10 hover:bg-aviso/20' : 'bg-fondo/60 hover:bg-fondo'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-texto">{l.cliente}</span>
                    <span className="block truncate text-sm text-tenue">
                      {l.compania} · {productoConApex(l)} · {unidades(l.unidades)}
                    </span>
                    {llegado && !l.cobrada && <Aviso como="span">Se quedó sin cobrar en este mes</Aviso>}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="cifras text-sm font-medium text-texto">{euros(l.bruto)}</span>
                    <span className="cifras text-xs text-apagado">RC {euros(l.hucha)}</span>
                    <EstadoHerramienta estado={l.estado} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {cargos.length > 0 && (
        <section aria-label={`Cargos y abonos de ${soloElMes(mes.mes)}`}>
          <h4 className="text-sm font-semibold text-texto">Cargos y abonos</h4>
          <ul className="mt-2 flex flex-col gap-1.5">
            {cargos.map((c) => (
              <li key={c.cargoId ?? c.extornoId ?? `${c.fecha}-${c.concepto}`} className="flex items-start justify-between gap-3 rounded-lg bg-fondo/60 px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-texto">{c.concepto}</span>
                  <span className="block text-sm text-tenue">
                    {fechaCorta(c.fecha)}
                    {c.cliente && ` · ${c.cliente}`}
                    {c.aplicado ? ' · aplicado' : c.extornoId ? ' · previsto para este mes' : ' · sin aplicar: entra en la siguiente que llegue'}
                  </span>
                </span>
                <span className={`cifras shrink-0 text-sm font-semibold ${c.importe < 0 ? 'text-critico-texto' : 'text-bien-texto'}`}>{conSigno(c.importe)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <AccionesDelMes mes={mes} lineas={lineas} cargos={cargos} minimoTransferencia={minimoTransferencia} saldoHucha={saldoHucha} hoy={hoy} />
    </div>
  );
}
