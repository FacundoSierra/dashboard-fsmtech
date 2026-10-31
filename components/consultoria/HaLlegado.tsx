'use client';

import { useRef, useState, useTransition } from 'react';
import { X } from 'lucide-react';
import { useDialogo } from '@/components/dialogo';
import { marcarLiquidacion } from '@/lib/consultoria/acciones';
import { calcularLiquidacion, cuentaDeComisiones } from '@/lib/consultoria/reglas';
import type { LineaLiquidacion, MesLiquidacion, MovimientoDeCuenta } from '@/lib/consultoria/tipos';
import { fechaONula } from '@/lib/consultoria/validar';
import { nombreDelMes, sumarMeses } from '@/lib/consultoria/calendario';
import { euros, fechaCorta } from '@/lib/consultoria/formato';
import Aviso from './Aviso';
import { Fila, conSigno, menos } from './DesgloseLiquidacion';
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO, CAMPO, ERROR, ETIQUETA } from './estilos';
import { aCampo, conDosDecimales, leerNumero, productoConApex, unidades } from './formato';

const MOTIVO_MAXIMO = 200;

/** Un cargo de la cuenta o el resto de un extorno, por su id */
const claveDe = (c: MovimientoDeCuenta) => c.cargoId ?? c.extornoId ?? `${c.fecha}|${c.concepto}`;

/**
 * La hoja de «Ha llegado» (spec 5.6): las líneas del mes con su casilla (marcadas las firmadas y
 * confirmadas; desmarcadas las previstas y las que tienen incidencia), los restos de extornos y los
 * cargos sin aplicar (marcados). Debajo, la liquidación como la hará OVB con lo marcado
 * (`calcularLiquidacion` y `cuentaDeComisiones`), la fecha, el n.º, lo recibido y, si queda algo
 * fuera, el motivo. Nada se guarda hasta «Confirmar»: lo desmarcado pasa al mes siguiente.
 */
export default function HaLlegado({
  mes,
  lineas,
  cargos,
  minimoTransferencia,
  hoy,
  alCerrar,
}: {
  mes: MesLiquidacion;
  lineas: LineaLiquidacion[];
  /** Los que se pueden aplicar en este mes: cargos sin aplicar y restos de extornos previstos */
  cargos: MovimientoDeCuenta[];
  minimoTransferencia: number;
  hoy: string;
  alCerrar: () => void;
}) {
  const hoja = useRef<HTMLDivElement>(null);
  const [marcadas, setMarcadas] = useState(() => new Set(lineas.filter((l) => l.estado === 'firmada' || l.estado === 'confirmada').map((l) => l.herramientaId)));
  const [cargosMarcados, setCargosMarcados] = useState(() => new Set(cargos.map(claveDe)));
  const [fecha, setFecha] = useState(hoy);
  const [numero, setNumero] = useState('');
  const [recibido, setRecibido] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, empezar] = useTransition();

  // Al abrirse, el foco va a la hoja; Esc la cierra, el Tab no se sale y, al cerrarse, el foco
  // vuelve al botón «Ha llegado»
  useDialogo({ abierto: true, caja: hoja, alCerrar });

  const conmutar = <T,>(conjunto: Set<T>, valor: T) => {
    const nuevo = new Set(conjunto);
    if (nuevo.has(valor)) nuevo.delete(valor);
    else nuevo.add(valor);
    return nuevo;
  };

  const entran = lineas.filter((l) => marcadas.has(l.herramientaId));
  const seAplican = cargos.filter((c) => cargosMarcados.has(claveDe(c)));
  const liquidacion = calcularLiquidacion(entran, seAplican.map((c) => c.importe));
  const [paso] = cuentaDeComisiones([{ mes: mes.mes, importe: liquidacion.importe }], mes.saldoAnterior, minimoTransferencia);
  const aPagar = paso?.aPagar ?? 0;

  const quedanFuera = lineas.length - entran.length;
  const extornosFuera = cargos.filter((c) => c.extornoId && !cargosMarcados.has(claveDe(c))).length;
  const pasanAlSiguiente = quedanFuera + extornosFuera;
  const mesSiguiente = nombreDelMes(sumarMeses(mes.mes, 1));

  const numRecibido = recibido !== null ? leerNumero(recibido) : aPagar;

  function confirmar() {
    const dia = fechaONula(fecha);
    const n = numero.trim() ? leerNumero(numero) : null;
    if (!dia) return setError('Pon la fecha de la liquidación, la del documento.');
    if (numero.trim() && (n === null || !Number.isInteger(n) || n < 1)) return setError('El n.º de la liquidación es un número mayor que 0.');
    if (recibido !== null && recibido.trim() && (numRecibido === null || numRecibido < 0 || !conDosDecimales(numRecibido)))
      return setError('Lo recibido es un importe de 0 en adelante, con dos decimales como mucho.');
    if ([...motivo.trim()].length > MOTIVO_MAXIMO) return setError('El motivo es demasiado largo: 200 caracteres como mucho.');
    setError(null);
    empezar(async () => {
      const resultado = await marcarLiquidacion({
        mes: mes.mes,
        fecha: dia,
        numero: n,
        entraron: entran.map((l) => l.herramientaId),
        extornos: seAplican.flatMap((c) => (c.extornoId ? [c.extornoId] : [])),
        cargos: seAplican.flatMap((c) => (c.cargoId ? [c.cargoId] : [])),
        importeRecibido: recibido !== null && !recibido.trim() ? null : numRecibido,
        motivo: pasanAlSiguiente > 0 && motivo.trim() ? motivo.trim() : null,
      });
      if (resultado.error) setError(resultado.error);
      else alCerrar();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ha-llegado-titulo"
      onClick={alCerrar}
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center sm:p-6"
    >
      <div
        ref={hoja}
        tabIndex={-1}
        onClick={(evento) => evento.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-superficie shadow-flotante outline-none sm:rounded-xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-borde px-5 py-4">
          <div className="min-w-0">
            <h2 id="ha-llegado-titulo" className="text-[17px] leading-snug font-semibold tracking-[-0.01em] text-texto">
              Ha llegado la liquidación de {nombreDelMes(mes.mes)}
            </h2>
            <p className="mt-0.5 text-sm text-tenue">Marca lo que trae el documento de OVB. No se guarda nada hasta confirmar.</p>
          </div>
          <button
            type="button"
            onClick={alCerrar}
            aria-label="Cerrar sin guardar"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-tenue transition-colors hover:bg-borde focus-visible:outline-2 focus-visible:outline-acento"
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div className="overflow-y-auto overscroll-contain px-5 pt-4" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}>
          <fieldset>
            <legend className="text-sm font-semibold text-texto">Líneas del mes</legend>
            {lineas.length === 0 ? (
              <p className="mt-2 text-sm text-tenue">Este mes no tiene comisiones: solo cargos o abonos.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5">
                {lineas.map((l) => (
                  <li key={l.herramientaId}>
                    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg bg-superficie-2 px-3 py-2.5 has-focus-visible:outline-2 has-focus-visible:outline-acento">
                      <input
                        type="checkbox"
                        checked={marcadas.has(l.herramientaId)}
                        onChange={() => setMarcadas((actual) => conmutar(actual, l.herramientaId))}
                        className="mt-1 h-4 w-4 shrink-0 accent-[var(--acento)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-texto">{l.cliente}</span>
                        <span className="block truncate text-sm text-tenue">
                          {l.compania} · {productoConApex(l)} · {unidades(l.unidades)}
                          {l.prevista && ' · prevista'}
                          {l.estado === 'incidencia' && ' · con incidencia'}
                        </span>
                      </span>
                      <span className="cifras shrink-0 text-sm font-medium text-texto">{euros(l.bruto)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          {cargos.length > 0 && (
            <fieldset className="mt-4">
              <legend className="text-sm font-semibold text-texto">Cargos, abonos y restos de extornos</legend>
              <ul className="mt-2 flex flex-col gap-1.5">
                {cargos.map((c) => (
                  <li key={claveDe(c)}>
                    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg bg-superficie-2 px-3 py-2.5 has-focus-visible:outline-2 has-focus-visible:outline-acento">
                      <input
                        type="checkbox"
                        checked={cargosMarcados.has(claveDe(c))}
                        onChange={() => setCargosMarcados((actual) => conmutar(actual, claveDe(c)))}
                        className="mt-1 h-4 w-4 shrink-0 accent-[var(--acento)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-texto">{c.concepto}</span>
                        <span className="block text-sm text-tenue">
                          {fechaCorta(c.fecha)}
                          {c.cliente && ` · ${c.cliente}`}
                        </span>
                      </span>
                      <span className="cifras shrink-0 text-sm font-medium text-texto">{conSigno(c.importe)}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[13px] text-apagado">Un cargo sin marcar se queda sin aplicar; un resto de extorno sin marcar pasa al mes siguiente.</p>
            </fieldset>
          )}

          <div className="mt-5 rounded-lg bg-superficie-2 p-4">
            <dl className="flex flex-col gap-1.5 text-sm">
              <Fila etiqueta="Comisión" valor={euros(liquidacion.comision)} />
              <Fila etiqueta="RC (a la hucha)" valor={menos(liquidacion.rc)} />
              <Fila etiqueta="Comisión neta" valor={euros(liquidacion.comisionNeta)} />
              <Fila etiqueta="IRPF (sobre la neta)" valor={menos(liquidacion.irpf)} />
              <Fila etiqueta="Cargos y abonos" valor={conSigno(liquidacion.cargos)} />
              <Fila etiqueta="Importe de la liquidación" valor={euros(liquidacion.importe)} fuerte />
              <Fila etiqueta="Saldo anterior de la cuenta" valor={conSigno(mes.saldoAnterior)} />
              <Fila etiqueta="Importe a pagar" valor={euros(aPagar)} fuerte />
            </dl>
            {aPagar === 0 && paso && (
              <Aviso className="mt-2">
                No llega a {euros(minimoTransferencia)}: no hay transferencia y pasan {conSigno(paso.saldoDespues)} a la siguiente.
              </Aviso>
            )}
            <p className="mt-2 text-sm text-tenue">
              Entran en la hucha <span className="cifras font-semibold text-texto">{euros(liquidacion.rc)}</span> con este mes.
            </p>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className={ETIQUETA}>
              Fecha de la liquidación
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={`${CAMPO} mt-1`} />
            </label>
            <label className={ETIQUETA}>
              N.º <span className="font-normal text-apagado">· opcional</span>
              <input value={numero} onChange={(e) => setNumero(e.target.value)} inputMode="numeric" autoComplete="off" className={`${CAMPO} mt-1`} />
            </label>
            <label className={ETIQUETA}>
              Lo recibido en el banco
              <span className="relative mt-1 block">
                <input
                  value={recibido ?? aCampo(aPagar)}
                  onChange={(e) => setRecibido(e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  className={`${CAMPO} pr-8`}
                />
                <span className="absolute top-1/2 right-3.5 -translate-y-1/2 text-apagado">€</span>
              </span>
            </label>
          </div>
          {recibido !== null && numRecibido !== null && Math.round(numRecibido * 100) !== Math.round(aPagar * 100) && (
            <Aviso className="mt-1">No cuadra con el importe a pagar ({euros(aPagar)}): quedará apuntada la diferencia.</Aviso>
          )}

          {pasanAlSiguiente > 0 && (
            <div className="mt-4 rounded-lg bg-superficie-2 p-4">
              <Aviso>
                <strong className="font-semibold">
                  Pasan a {mesSiguiente}: {pasanAlSiguiente}
                </strong>
              </Aviso>
              <label className={`${ETIQUETA} mt-2 block`}>
                Por qué no han entrado <span className="font-normal text-apagado">(se apunta en sus notas)</span>
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  maxLength={MOTIVO_MAXIMO}
                  rows={2}
                  placeholder="Aún sin firmar"
                  className={`${CAMPO} mt-1 resize-y`}
                />
                <span className="mt-1 block text-right text-[13px] font-normal text-apagado">
                  {[...motivo].length}/{MOTIVO_MAXIMO}
                </span>
              </label>
            </div>
          )}

          {error && (
            <p role="alert" className={`${ERROR} mt-3`}>
              {error}
            </p>
          )}

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={confirmar} disabled={guardando} className={`${BOTON_PRINCIPAL} sm:flex-1`}>
              {guardando
                ? 'Guardando…'
                : pasanAlSiguiente > 0
                  ? `Confirmar y pasar ${pasanAlSiguiente} a ${mesSiguiente.split(' ')[0]}`
                  : 'Confirmar que ha llegado'}
            </button>
            <button type="button" onClick={alCerrar} className={BOTON_SECUNDARIO}>
              Cerrar sin guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
