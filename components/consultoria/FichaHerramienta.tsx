import Link from 'next/link';
import type { ReactNode } from 'react';
import { IconoEstado } from '@/components/ui';
import { esApex, primerDiaDelMes } from '@/lib/consultoria/reglas';
import type { HerramientaConAportaciones } from '@/lib/consultoria/tipos';
import { euros, fechaCorta } from '@/lib/consultoria/formato';
import { nombreDelMes } from '@/lib/consultoria/calendario';
import Aviso from './Aviso';
import EstadoHerramienta from './EstadoHerramienta';
import { TARJETA } from './estilos';
import { NOMBRE_TIPO_COMISION, aportacionDe, cobraPocoAPoco, cuantoFalta, enlaceAlMes, euroPorUnidad, pct, soloElMes, unidades } from './formato';
import ListaApex from './ListaApex';

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-apagado">{etiqueta}</dt>
      <dd className="cifras mt-0.5 text-sm font-medium break-words text-texto">{children}</dd>
    </div>
  );
}

/**
 * Todo lo de una herramienta, de solo lectura: lo que se apuntó, sus importes, sus fechas y su
 * extorno. Si es una APEX, «APEX de TopPlan» con el enlace a su herramienta; si tiene APEX, su lista
 */
export default function FichaHerramienta({
  herramienta: h,
  compania,
  hoy,
}: {
  herramienta: HerramientaConAportaciones;
  compania: string;
  hoy: string;
}) {
  const pocoAPoco = cobraPocoAPoco(h.tipoComision) && h.unidades === 0;
  const falta = h.libreDeExtornoEl ? cuantoFalta(hoy, h.libreDeExtornoEl) : null;
  const mesDeCobro = primerDiaDelMes(h.fechaCobro);

  return (
    <section className={TARJETA}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className={`text-xl leading-tight font-semibold tracking-tight break-words ${h.estado === 'anulada' ? 'text-apagado line-through' : 'text-texto'}`}>
            {h.producto}
          </h2>
          <p className="mt-1 text-sm text-tenue">
            {compania} ·{' '}
            <Link href={`/consultoria/clientes/${h.clienteId}`} className="font-medium text-acento underline-offset-4 hover:underline">
              {h.cliente}
            </Link>
          </p>
          {esApex(h) && (
            <p className="mt-1 text-sm text-tenue">
              APEX de{' '}
              {h.de ? (
                <Link href={`/consultoria/produccion/${h.de.id}`} className="font-medium text-acento underline-offset-4 hover:underline">
                  {h.de.producto}
                </Link>
              ) : (
                'una herramienta que ya no encuentro'
              )}
            </p>
          )}
        </div>
        <EstadoHerramienta estado={h.estado} />
      </header>

      {h.liquidada ? (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-borde bg-fondo/70 px-3 py-2.5 text-sm text-texto">
          <IconoEstado nivel="bien" className="mt-0.5 size-4" />
          <span>
            Cobrada en la liquidación de {nombreDelMes(mesDeCobro)}.{' '}
            <Link href={enlaceAlMes(mesDeCobro)} className="font-medium text-acento underline underline-offset-4">
              Ver la liquidación
            </Link>
          </span>
        </p>
      ) : h.estado === 'prevista' ? (
        <Aviso caja className="mt-4">
          Prevista: aún sin firmar. Cuenta en lo previsto de {soloElMes(mesDeCobro)}.
        </Aviso>
      ) : null}

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
        <Dato etiqueta="Aportación">{aportacionDe(h)}</Dato>
        <Dato etiqueta="Pago del primer recibo">{h.pago === 'transferencia' ? 'Transferencia' : 'Domiciliación'}</Dato>
        {h.duracionAnios !== null && <Dato etiqueta="Duración">{h.duracionAnios} años</Dato>}
        {h.propio && <Dato etiqueta="Contrato propio">Sí: reserva del 100 %</Dato>}
        <Dato etiqueta="Tipo de comisión">{NOMBRE_TIPO_COMISION[h.tipoComision]}</Dato>
        <Dato etiqueta={pocoAPoco ? 'Unidades para el nivel' : 'Unidades'}>
          {pocoAPoco ? unidades(h.unidadesNivel ?? 0) : unidades(h.unidades)}
          {!pocoAPoco && h.unidadesNivel !== null && h.unidadesNivel !== h.unidades && (
            <span className="block text-xs font-normal text-apagado">{unidades(h.unidadesNivel)} para el nivel</span>
          )}
        </Dato>
        <Dato etiqueta="€ por unidad">{euroPorUnidad(h.valorUnidad)}</Dato>
        <Dato etiqueta="Comisión">{euros(h.bruto)}</Dato>
        <Dato etiqueta={`RC (${pct(h.pctHucha)})`}>{euros(h.hucha)}</Dato>
        <Dato etiqueta={`IRPF aprox. (${pct(h.pctIrpf)})`}>{euros(h.irpf)}</Dato>
        <Dato etiqueta="Neto aprox.">{euros(h.neto)}</Dato>
        <Dato etiqueta="Confirmada el">{h.fechaConfirmacion ? fechaCorta(h.fechaConfirmacion) : 'Sin dato'}</Dato>
        <Dato etiqueta="Mes de producción">{nombreDelMes(h.mesProduccion)}</Dato>
        <Dato etiqueta="Efecto">{fechaCorta(h.fechaEfecto)}</Dato>
        <Dato etiqueta={h.liquidada ? 'Cobro' : 'Cobro estimado'}>
          {nombreDelMes(h.fechaCobro)}
          {h.fechasProvisionales && <span className="block text-xs font-normal text-apagado">Fechas sin confirmar</span>}
        </Dato>
        {h.libreDeExtornoEl && (
          <Dato etiqueta="Libre de extorno el">
            {fechaCorta(h.libreDeExtornoEl)}
            <span className="block text-xs font-normal text-apagado">{falta ?? 'Ya está libre'}</span>
          </Dato>
        )}
        {h.anuladaEl && <Dato etiqueta="Anulada el">{fechaCorta(h.anuladaEl)}</Dato>}
      </dl>

      {h.aportaciones.length > 0 && (
        <section className="mt-5" aria-labelledby="sus-apex">
          <h3 id="sus-apex" className="text-sm font-semibold text-texto">
            Sus aportaciones extraordinarias
          </h3>
          <ListaApex aportaciones={h.aportaciones} producto={h.producto} className="mt-2" />
        </section>
      )}

      {h.extorno && (
        <div className="mt-5 rounded-lg border border-critico/40 bg-critico/10 p-4 text-sm">
          <p className="font-semibold text-texto">
            Extorno de <span className="cifras">{euros(h.extorno.importe)}</span> el {fechaCorta(h.extorno.fecha)}
          </p>
          <p className="mt-1 text-tenue">
            La hucha cubre <span className="cifras">{euros(h.extorno.deHucha)}</span>
            {h.extorno.resto > 0
              ? `; el resto, ${euros(h.extorno.resto)}, es un cargo en la cuenta de comisiones${
                  h.extorno.aplicado ? ', ya aplicado' : h.extorno.restoCobro ? `, previsto para ${nombreDelMes(h.extorno.restoCobro)}` : ''
                }.`
              : '. No toca la cuenta de comisiones.'}
          </p>
          {(h.extorno.irpfHucha > 0 || h.extorno.irpfResto > 0) && (
            <p className="mt-1 text-sm text-apagado">
              Supuestos de IRPF: {euros(h.extorno.irpfHucha)} de la parte de la hucha y {euros(h.extorno.irpfResto)} del resto.
            </p>
          )}
        </div>
      )}

      {h.notas && (
        <div className="mt-5">
          <p className="text-sm text-apagado">Notas</p>
          <p className="mt-0.5 text-sm whitespace-pre-line text-texto">{h.notas}</p>
        </div>
      )}
      {h.procedencia && (
        <p className="mt-4 text-xs text-apagado">
          {h.procedencia === 'historico' ? 'Viene del histórico de liquidaciones de OVB.' : 'Viene de una nota de producción.'}
        </p>
      )}
    </section>
  );
}
