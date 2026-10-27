'use client';

import { useState, useTransition } from 'react';
import { anularHerramienta, guardarExtorno } from '@/lib/consultoria/acciones';
import { extornoPropuesto, proponerExtorno, ultimoDiaDelMes, type Cuadro, type MovimientoHucha } from '@/lib/consultoria/reglas';
import type { ExtornoAGuardar, Herramienta } from '@/lib/consultoria/tipos';
import { fechaONula } from '@/lib/consultoria/validar';
import { nombreDelMes, sumarMeses } from '@/lib/consultoria/calendario';
import { euros } from '@/lib/consultoria/formato';
import Aviso from './Aviso';
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO, BOTON_TEXTO, CAMPO, ERROR, ETIQUETA, TARJETA } from './estilos';
import { aCampo, conDosDecimales, leerNumero, pct } from './formato';

/** Lo que se ha cambiado del reparto propuesto; null = lo propuesto */
interface Cambios {
  importe: string | null;
  deHucha: string | null;
  restoCobro: string | null; // AAAA-MM
  irpfHucha: string;
  irpfResto: string;
}

const SIN_CAMBIOS: Cambios = { importe: null, deHucha: null, restoCobro: null, irpfHucha: '0', irpfResto: '0' };

const centimos = (n: number) => Math.round(n * 100);

/**
 * Anular una herramienta (spec 5.7). Si no se cobró, solo la fecha: deja de contar en lo previsto.
 * Si se cobró y está dentro de su plazo, el extorno: su bruto por el % del mes de la cancelación
 * (`extornoPropuesto`), que sale primero de la hucha con el saldo de ese día (`proponerExtorno`); lo
 * que no cubre es un cargo en la cuenta de comisiones, en la liquidación del mes que se elija. Los
 * supuestos de IRPF, plegados y a 0. Se guarda lo que se ve, y solo al confirmar.
 *
 * Una que ya está anulada, se cobró y no tiene extorno (si al anularla el extorno no se pudo
 * guardar) usa lo mismo para apuntarlo, con su fecha de anulación fija.
 */
export default function AnularHerramienta({
  herramienta: h,
  hoy,
  movimientos,
  cuadro,
  alTerminar,
}: {
  herramienta: Herramienta;
  hoy: string;
  /** El libro de la hucha, para su saldo del día del extorno */
  movimientos: MovimientoHucha[];
  cuadro: Cuadro;
  alTerminar: () => void;
}) {
  // Ya anulada (cobrada y sin extorno): solo falta apuntar el extorno
  const soloElExtorno = h.estado === 'anulada' && h.liquidada && !h.extorno;
  const [anuladaEl, setAnuladaEl] = useState(soloElExtorno && h.anuladaEl ? h.anuladaEl : hoy);
  const [fechaExtorno, setFechaExtorno] = useState<string | null>(null);
  const [cambios, setCambios] = useState<Cambios>(SIN_CAMBIOS);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, empezar] = useTransition();

  const cambiar = (nuevos: Partial<Cambios>) => {
    setCambios((actual) => ({ ...actual, ...nuevos }));
    setConfirmando(false);
  };

  const fechaAnulacion = fechaONula(anuladaEl);
  // El día en que OVB lo aplica; de serie, el de la anulación
  const fecha = fechaONula(fechaExtorno ?? anuladaEl);

  const propuesto =
    h.liquidada && fechaAnulacion
      ? extornoPropuesto(
          { compania: h.compania, producto: h.producto, periodicidad: h.periodicidad, fechaEfecto: h.fechaEfecto, bruto: h.bruto, cobrada: h.liquidada },
          fechaAnulacion,
          cuadro,
        )
      : null;

  const numImporte = cambios.importe !== null ? leerNumero(cambios.importe) : null;
  const importe = cambios.importe !== null ? (numImporte !== null && numImporte >= 0 ? numImporte : 0) : (propuesto?.importe ?? 0);
  const hayExtorno = h.liquidada && importe > 0;
  const reparto = hayExtorno && fecha ? proponerExtorno(importe, fecha, movimientos) : null;

  const numDeHucha = cambios.deHucha !== null ? leerNumero(cambios.deHucha) : null;
  const deHucha = cambios.deHucha !== null ? (numDeHucha ?? 0) : (reparto?.deHucha ?? 0);
  const resto = (centimos(importe) - centimos(deHucha)) / 100;
  const restoCobro =
    resto > 0 ? (cambios.restoCobro ? ultimoDiaDelMes(`${cambios.restoCobro}-01`) : (reparto?.restoCobro ?? (fecha ? ultimoDiaDelMes(fecha) : null))) : null;
  const saldoAntes = reparto?.saldoAntes ?? 0;
  const saldoDespues = (centimos(saldoAntes) - centimos(deHucha)) / 100;
  const irpfHucha = leerNumero(cambios.irpfHucha) ?? 0;
  const irpfResto = leerNumero(cambios.irpfResto) ?? 0;

  // Para elegir la liquidación del resto: del mes del extorno a seis meses después
  const mesesDelResto: string[] = [];
  if (fecha) for (let i = 0; i <= 6; i++) mesesDelResto.push(sumarMeses(fecha, i));

  function validar(): string | null {
    if (!fechaAnulacion) return 'Pon la fecha de la anulación.';
    if (!hayExtorno) return null;
    if (!fecha) return 'Pon la fecha del extorno.';
    if (cambios.importe !== null && (numImporte === null || numImporte <= 0)) return 'El extorno tiene que ser mayor que cero.';
    if (!conDosDecimales(importe) || !conDosDecimales(deHucha)) return 'Los importes, con dos decimales como mucho.';
    if (deHucha < 0 || deHucha > importe) return 'Lo que cubre la hucha va de 0 al importe del extorno.';
    if (irpfHucha < 0) return 'El IRPF de la parte de la hucha no puede ser negativo.';
    if (irpfResto < 0 || irpfResto > resto) return 'El IRPF del resto va de 0 a lo que la hucha no cubre.';
    return null;
  }

  function anular() {
    const problema = validar();
    setError(problema);
    if (problema || !fechaAnulacion) return;
    if (!confirmando) {
      setConfirmando(true);
      return;
    }
    const extorno: ExtornoAGuardar | null =
      hayExtorno && fecha ? { fecha, importe, deHucha, restoCobro, irpfHucha, irpfResto } : null;
    empezar(async () => {
      const resultado = soloElExtorno
        ? extorno
          ? await guardarExtorno({ herramientaId: h.id, ...extorno })
          : { error: 'Con este importe no hay extorno que apuntar.' }
        : await anularHerramienta({ id: h.id, anuladaEl: fechaAnulacion, extorno });
      if (resultado.error) {
        setError(resultado.error);
        setConfirmando(false);
      } else alTerminar();
    });
  }

  return (
    <section className={TARJETA} aria-labelledby="anular-titulo">
      <h3 id="anular-titulo" className="text-base font-semibold tracking-tight text-texto">
        {soloElExtorno ? 'Apuntar el extorno' : 'Anular la herramienta'}
      </h3>

      <label className={`${ETIQUETA} mt-4 block sm:max-w-xs`}>
        Fecha de la anulación
        <input
          type="date"
          value={anuladaEl}
          onChange={(e) => {
            setAnuladaEl(e.target.value);
            cambiar({ deHucha: null, restoCobro: null });
          }}
          disabled={soloElExtorno}
          className={`${CAMPO} mt-1`}
        />
      </label>

      {!h.liquidada ? (
        <p className="mt-4 text-sm text-tenue">No se llegó a cobrar: no hay extorno. Deja de contar en lo previsto.</p>
      ) : !propuesto ? null : propuesto.importe === 0 && cambios.importe === null ? (
        <p className="mt-4 text-sm text-tenue">
          Mes {propuesto.mes} desde el efecto: ya está fuera de su plazo de extorno, así que no hay que devolver nada.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-sm text-tenue">
            Se cobró: hay extorno. Mes {propuesto.mes} desde el efecto, el {pct(propuesto.pct)} de su comisión ({euros(h.bruto)}).
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className={ETIQUETA}>
              Importe del extorno
              <span className="relative mt-1 block">
                <input
                  value={cambios.importe ?? aCampo(propuesto.importe)}
                  onChange={(e) => cambiar({ importe: e.target.value, deHucha: null })}
                  inputMode="decimal"
                  autoComplete="off"
                  className={`${CAMPO} pr-8`}
                />
                <span className="absolute top-1/2 right-3.5 -translate-y-1/2 text-apagado">€</span>
              </span>
            </label>
            <label className={ETIQUETA}>
              Día en que OVB lo aplica
              <input
                type="date"
                value={fechaExtorno ?? anuladaEl}
                onChange={(e) => {
                  setFechaExtorno(e.target.value);
                  cambiar({ deHucha: null, restoCobro: null });
                }}
                className={`${CAMPO} mt-1`}
              />
            </label>
          </div>
          {cambios.importe !== null && (
            <button type="button" onClick={() => cambiar({ importe: null, deHucha: null })} className={`${BOTON_TEXTO} self-start text-sm`}>
              Volver a lo propuesto ({euros(propuesto.importe)})
            </button>
          )}

          {hayExtorno && (
            <div className="rounded-lg bg-fondo/70 p-4 text-sm">
              <p className="text-texto">
                La hucha tenía <span className="cifras font-medium">{euros(saldoAntes)}</span> ese día: cubre{' '}
                <span className="cifras font-medium">{euros(deHucha)}</span> y quedará en{' '}
                <span className={`cifras font-medium ${saldoDespues < 0 ? 'text-critico-texto' : ''}`}>{euros(saldoDespues)}</span>.
              </p>
              {resto > 0 ? (
                <div className="mt-2">
                  <p className="text-texto">
                    El resto, <span className="cifras font-medium">{euros(resto)}</span>, se carga en la cuenta de comisiones en la
                    liquidación de:
                  </p>
                  <select
                    aria-label="Liquidación en que se carga el resto"
                    value={(restoCobro ?? '').slice(0, 7)}
                    onChange={(e) => cambiar({ restoCobro: e.target.value })}
                    className={`${CAMPO} mt-2 sm:max-w-xs`}
                  >
                    {mesesDelResto.map((mes) => (
                      <option key={mes} value={mes.slice(0, 7)}>
                        {nombreDelMes(mes)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="mt-2 text-tenue">No toca la cuenta de comisiones.</p>
              )}

              <label className={`${ETIQUETA} mt-3 block sm:max-w-xs`}>
                Lo que cubre la hucha
                <span className="relative mt-1 block">
                  <input
                    value={cambios.deHucha ?? aCampo(deHucha)}
                    onChange={(e) => cambiar({ deHucha: e.target.value })}
                    inputMode="decimal"
                    autoComplete="off"
                    className={`${CAMPO} pr-8`}
                  />
                  <span className="absolute top-1/2 right-3.5 -translate-y-1/2 text-apagado">€</span>
                </span>
              </label>

              {reparto && reparto.avisos.some((a) => a.codigo !== 'hucha_no_cubre') && (
                <ul className="mt-3 flex flex-col gap-2">
                  {/* «La hucha no cubre» ya lo dice el texto de arriba */}
                  {reparto.avisos
                    .filter((a) => a.codigo !== 'hucha_no_cubre')
                    .map((a) => (
                      <Aviso key={a.codigo} como="li" caja>
                        {a.texto}
                      </Aviso>
                    ))}
                </ul>
              )}
            </div>
          )}

          {propuesto.avisos.length > 0 && (
            <ul className="flex flex-col gap-2">
              {propuesto.avisos.map((a) => (
                <Aviso key={a.codigo + a.texto} como="li" caja>
                  {a.texto}
                </Aviso>
              ))}
            </ul>
          )}

          {hayExtorno && (
            <details className="rounded-lg border border-borde px-4 py-1">
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-texto focus-visible:outline-2 focus-visible:outline-acento">
                Supuestos de IRPF (0 y 0)
              </summary>
              <p className="text-sm text-apagado">
                Supuestos: lo que se devuelve de IRPF por la parte de la hucha y lo que se regulariza con el resto. Sin confirmar.
              </p>
              <div className="mt-2 mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className={ETIQUETA}>
                  IRPF de la parte de la hucha <span className="font-normal text-apagado">(supuesto)</span>
                  <input value={cambios.irpfHucha} onChange={(e) => cambiar({ irpfHucha: e.target.value })} inputMode="decimal" className={`${CAMPO} mt-1`} />
                </label>
                <label className={ETIQUETA}>
                  IRPF del resto <span className="font-normal text-apagado">(supuesto)</span>
                  <input
                    value={cambios.irpfResto}
                    onChange={(e) => cambiar({ irpfResto: e.target.value })}
                    inputMode="decimal"
                    disabled={resto <= 0}
                    className={`${CAMPO} mt-1`}
                  />
                </label>
              </div>
            </details>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className={`${ERROR} mt-4`}>
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={anular} disabled={guardando} className={confirmando ? BOTON_PRINCIPAL.replace('bg-acento-fuerte', 'bg-critico') : BOTON_PRINCIPAL}>
          {guardando
            ? 'Guardando…'
            : soloElExtorno
              ? confirmando
                ? `Sí, apuntar el extorno de ${euros(importe)}`
                : 'Apuntar el extorno'
              : confirmando
                ? hayExtorno
                  ? `Sí, anular con un extorno de ${euros(importe)}`
                  : 'Sí, anularla'
                : 'Anular'}
        </button>
        <button type="button" onClick={alTerminar} className={BOTON_SECUNDARIO}>
          {confirmando ? 'No' : 'Cancelar'}
        </button>
      </div>
    </section>
  );
}
