'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';
import { guardarFirma } from '@/lib/consultoria/acciones';
import {
  calcularImportes,
  datosDeCompania,
  primerDiaDelMes,
  productoDelCuadro,
  proponerFirma,
  ultimoDiaDelMes,
  unidadesPropuestas,
  valorUnidadDelMes,
  type Aviso,
  type ContextoReglas,
  type DatosCompania,
  type EntradaFirma,
  type EstadoHerramienta,
  type Pago,
  type Periodicidad,
  type Propuesta,
  type TipoComision,
} from '@/lib/consultoria/reglas';
import type { ClienteDeLaLista, FirmaAGuardar, Herramienta, HerramientaConAportaciones, ProductoUsado } from '@/lib/consultoria/tipos';
import { fechaONula } from '@/lib/consultoria/validar';
import { nombreDelMes, sumarMeses } from '@/lib/consultoria/calendario';
import { euros, fechaCorta, mesCorto } from '@/lib/consultoria/formato';
import AvisoConIcono from './Aviso';
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO, BOTON_TEXTO, CAMPO, ERROR, ETIQUETA, TARJETA } from './estilos';
import Opciones from './Opciones';
import {
  NOMBRE_ESTADO,
  NOMBRE_TIPO_COMISION,
  aCampo,
  aportacionDe,
  cobraPocoAPoco,
  conDosDecimales,
  euroPorUnidad,
  leerNumero,
  nombreDeCompania,
  pct,
  unidades as textoUnidades,
  type MadrePosible,
} from './formato';

/**
 * Lo que se ha puesto a mano y ya no pisa el cálculo; null = lo calculado. Los meses, `AAAA-MM`;
 * los números, como se han tecleado.
 */
interface AMano {
  unidades: string | null;
  unidadesNivel: string | null;
  efecto: string | null;
  mesProduccion: string | null;
  cobro: string | null;
  valorUnidad: string | null;
  pctHucha: string | null;
  tipoComision: TipoComision | null;
}

const CALCULADO: AMano = {
  unidades: null,
  unidadesNivel: null,
  efecto: null,
  mesProduccion: null,
  cobro: null,
  valorUnidad: null,
  pctHucha: null,
  tipoComision: null,
};

/** Al cambiar una que ya está, todo empieza como se guardó: nada cambia si no se toca */
function comoSeGuardo(h: Herramienta): AMano {
  return {
    unidades: aCampo(h.unidades),
    unidadesNivel: h.unidadesNivel === null ? null : aCampo(h.unidadesNivel),
    efecto: h.fechaEfecto,
    mesProduccion: h.mesProduccion.slice(0, 7),
    cobro: h.fechaCobro.slice(0, 7),
    valorUnidad: aCampo(h.valorUnidad),
    pctHucha: aCampo(h.pctHucha),
    tipoComision: h.tipoComision,
  };
}

const ESTADOS_DE_FIRMA: EstadoHerramienta[] = ['prevista', 'firmada', 'confirmada', 'incidencia'];
const TIPOS: TipoComision[] = ['anticipada', 'anualizada', 'unica', 'sobre_recibo', 'sobre_saldo'];

/** Un número que no es negativo (o null) */
const noNegativo = (n: number | null) => (n !== null && n >= 0 ? n : null);
/** `AAAA-MM` que existe, o null */
const mesONulo = (valor: string | null) => (valor && /^\d{4}-\d{2}$/.test(valor) && fechaONula(`${valor}-01`) ? `${valor}-01` : null);

/** Los meses de `desde` a `hasta`, y `incluir` si se sale (lo guardado puede caer lejos) */
function mesesEntre(desde: string, hasta: string, incluir: string): string[] {
  const lista: string[] = [];
  for (let mes = desde; mes <= hasta; mes = sumarMeses(mes, 1)) lista.push(mes);
  if (!lista.includes(incluir)) lista.push(incluir);
  return lista.sort();
}

interface Props {
  contexto: ContextoReglas;
  clientes: ClienteDeLaLista[];
  productosUsados: ProductoUsado[];
  /** `hoyEnMadrid()`, del servidor: la fecha por defecto y lo que es «futuro» */
  hoy: string;
  /** `?cliente=<id>`: lo trae elegido */
  clienteInicial?: string | null;
  /** Para cambiar una que ya está; sin ella, una firma nueva */
  herramienta?: HerramientaConAportaciones;
  /** Las herramientas de las que puede colgar una APEX (`madresPosibles`), de todos los clientes */
  madres?: MadrePosible[];
  /** Al cambiar una: cuando se guarda o se cancela */
  alTerminar?: () => void;
}

/**
 * Nueva firma y cambiar una herramienta (spec 5.5). Lo que sale (mes de producción, efecto, cobro,
 * nivel, reserva e importes) se recalcula al teclear con `proponerFirma`, en el navegador, con el
 * mismo contexto que usan las acciones y los scripts. Las fechas, el €/unidad, la reserva y el tipo
 * de comisión tienen «Cambiar»: al tocarlos se quedan a mano. Los importes no se cambian: son la
 * cuenta. Al guardar se manda lo que se ve.
 *
 * Si el cliente tiene herramientas de las que colgarla, «¿Es una aportación extraordinaria a una
 * herramienta que ya tiene?» (spec 11.3): con una elegida, la compañía y el producto son los suyos, el
 * pago empieza siendo el suyo y la aportación es única; lo demás se calcula igual.
 *
 * Una herramienta ya cobrada solo cambia sus notas (y, si está anulada, su estado) y el enlace con su
 * herramienta si es una APEX: lo demás lo protege la base de datos.
 */
export default function FormularioFirma(props: Props) {
  if (props.herramienta?.liquidada) {
    return (
      <CambiarCobrada
        herramienta={props.herramienta}
        madres={props.madres ?? []}
        companias={props.contexto.companias}
        alTerminar={props.alTerminar}
      />
    );
  }
  return <Formulario {...props} />;
}

function Formulario({ contexto, clientes, productosUsados, hoy, clienteInicial, herramienta: original, madres = [], alTerminar }: Props) {
  const router = useRouter();
  const [guardando, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [clienteId, setClienteId] = useState(original?.clienteId ?? (clientes.some((c) => c.id === clienteInicial) ? (clienteInicial ?? '') : ''));
  const [nuevo, setNuevo] = useState<{ nombre: string; referencia: string } | null>(
    !original && clientes.length === 0 ? { nombre: '', referencia: '' } : null,
  );
  const [companiaElegida, setCompania] = useState(original?.compania ?? contexto.companias[0]?.codigo ?? '');
  const [productoEscrito, setProducto] = useState(original?.producto ?? '');
  const [pago, setPago] = useState<Pago>(original?.pago ?? 'domiciliacion');
  const [periodicidadElegida, setPeriodicidad] = useState<Periodicidad>(original?.periodicidad ?? 'mensual');
  /** La herramienta de la que es APEX; vacío, ninguna */
  const [madreId, setMadreId] = useState(original?.aportacionDe ?? '');
  const [aportacion, setAportacion] = useState(aCampo(original?.aportacion));
  const [duracion, setDuracion] = useState(aCampo(original?.duracionAnios));
  const [propio, setPropio] = useState(original?.propio ?? false);
  const [fecha, setFecha] = useState(original ? (original.fechaConfirmacion ?? '') : hoy);
  const [estadoAMano, setEstadoAMano] = useState<EstadoHerramienta | null>(original?.estado ?? null);
  const [notas, setNotas] = useState(original?.notas ?? '');
  const [aMano, setAMano] = useState<AMano>(original ? comoSeGuardo(original) : CALCULADO);
  /** Tras «Recalcular», lo que había, para poder volver */
  const [antesDeRecalcular, setAntesDeRecalcular] = useState<AMano | null>(null);

  const cambiar = (cambios: Partial<AMano>) => setAMano((actual) => ({ ...actual, ...cambios }));

  // La APEX: las herramientas del cliente de las que puede colgar (ella misma no)
  const madresDelCliente = nuevo ? [] : madres.filter((m) => m.clienteId === clienteId && m.id !== original?.id);
  const madre = madresDelCliente.find((m) => m.id === madreId) ?? null;
  // Con madre, la compañía y el producto son los suyos y la aportación, única
  const compania = madre?.compania ?? companiaElegida;
  const producto = madre?.producto ?? productoEscrito;
  const periodicidad: Periodicidad = madre ? 'unica' : periodicidadElegida;
  // En una firma nueva se pregunta siempre que haya de qué colgarla; al cambiar una, si es única (o ya
  // es una APEX) y no tiene APEX propias, porque una herramienta con APEX no pasa a ser una
  const tieneApex = (original?.aportaciones.length ?? 0) > 0;
  const preguntarApex = madresDelCliente.length > 0 && !tieneApex && (!original || periodicidad === 'unica' || Boolean(original.aportacionDe));

  function elegirCliente(id: string) {
    setClienteId(id);
    setMadreId('');
  }

  function elegirMadre(id: string) {
    setMadreId(id);
    const elegida = madresDelCliente.find((m) => m.id === id);
    // En una firma nueva, el pago de su herramienta; al cambiar una, el guardado: enganchar no toca nada más
    if (elegida && !original) setPago(elegida.pago);
  }

  // Lo que dice la compañía y el cuadro del producto
  const datosCompania = datosDeCompania(compania, contexto.companias);
  const sinCalendario = datosCompania.regla === 'sin_calendario';
  const porPago = datosCompania.regla === 'por_pago';
  const delCuadro = compania ? productoDelCuadro(compania, producto, periodicidad, contexto.cuadro) : null;
  const regla = delCuadro?.unidades ?? null;
  const pideDuracion = Boolean(regla && ((regla.porDuracion?.length ?? 0) > 0 || (regla.base === 'primas_programadas' && regla.aniosFijos === undefined)));

  // Lo tecleado, como números
  const numAportacion = leerNumero(aportacion);
  const aportacionValida = numAportacion !== null && numAportacion > 0 ? numAportacion : null;
  const numDuracion = leerNumero(duracion);
  const duracionValida = pideDuracion && numDuracion !== null && Number.isInteger(numDuracion) && numDuracion >= 1 && numDuracion <= 99 ? numDuracion : null;
  const unidadesDadas = aMano.unidades !== null;
  const numUnidades = unidadesDadas ? noNegativo(leerNumero(aMano.unidades ?? '')) : null;
  const nivelDadas = aMano.unidadesNivel !== null;
  const numUnidadesNivel = nivelDadas ? noNegativo(leerNumero(aMano.unidadesNivel ?? '')) : null;
  const fechaValida = fechaONula(fecha);
  const efectoDado = aMano.efecto ? fechaONula(aMano.efecto) : null;

  const entrada: EntradaFirma = {
    compania,
    producto,
    periodicidad,
    pago,
    fecha: fechaValida ?? original?.mesProduccion ?? hoy,
    propio,
    ...(aportacionValida !== null ? { aportacion: aportacionValida } : {}),
    ...(duracionValida !== null ? { duracionAnios: duracionValida } : {}),
    ...(numUnidades !== null ? { unidades: numUnidades } : {}),
    ...(numUnidadesNivel !== null ? { unidadesNivel: numUnidadesNivel } : {}),
    ...(efectoDado ? { fechaEfecto: efectoDado } : {}),
  };
  const propuesta = compania ? proponer(entrada, contexto) : null;

  if (!propuesta) {
    return (
      <form className={TARJETA} onSubmit={(e) => e.preventDefault()}>
        <p className="text-sm text-tenue">
          {contexto.companias.length === 0 ? 'No hay compañías: añádelas en Ajustes.' : 'Revisa la fecha: no se puede calcular con ella.'}
        </p>
        <label className={`${ETIQUETA} mt-4 block max-w-xs`}>
          Fecha
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={`${CAMPO} mt-1`} />
        </label>
      </form>
    );
  }

  // Lo que se va a guardar: lo calculado, salvo lo puesto a mano
  const mesManual = mesONulo(aMano.mesProduccion);
  const mesProduccion = mesManual ?? propuesta.mesProduccion;
  const nivel = mesManual
    ? valorUnidadDelMes(mesManual, contexto)
    : { nivel: propuesta.nivel, valorUnidad: propuesta.valorUnidad, unidadesAntes: propuesta.unidadesAntes, avisos: [] as Aviso[] };
  const numValorUnidad = aMano.valorUnidad !== null ? noNegativo(leerNumero(aMano.valorUnidad)) : null;
  const valorUnidad = aMano.valorUnidad !== null ? (numValorUnidad ?? 0) : nivel.valorUnidad;
  const numPctHucha = aMano.pctHucha !== null ? noNegativo(leerNumero(aMano.pctHucha)) : null;
  const pctHucha = aMano.pctHucha !== null ? (numPctHucha ?? 0) : propuesta.pctHucha;
  const pctIrpf = original?.pctIrpf ?? propuesta.pctIrpf;
  const fechaEfecto = propuesta.fechaEfecto;
  const cobroManual = mesONulo(aMano.cobro);
  const fechaCobro = cobroManual ? ultimoDiaDelMes(cobroManual) : propuesta.fechaCobro;
  const tipoComision = aMano.tipoComision ?? propuesta.tipoComision;
  const pocoAPoco = cobraPocoAPoco(tipoComision);
  const unidades = unidadesDadas ? numUnidades : propuesta.unidades;
  const unidadesNivel = nivelDadas ? numUnidadesNivel : propuesta.unidadesNivel;
  const importes = calcularImportes(unidades ?? 0, Math.min(valorUnidad, 9999.99), Math.min(pctHucha, 100), pctIrpf);
  const estado = estadoAMano ?? (fechaValida && fechaValida > hoy ? 'prevista' : 'confirmada');
  const avisos = sinRepetir([...propuesta.avisos, ...nivel.avisos]);
  const provisionales = propuesta.fechasProvisionales;

  // Para los desplegables de los meses, alrededor de lo calculado
  const mesesProduccion = mesesEntre(sumarMeses(propuesta.mesProduccion, -2), sumarMeses(propuesta.mesProduccion, 3), mesProduccion);
  const mesesCobro = mesesEntre(primerDiaDelMes(fechaEfecto), sumarMeses(primerDiaDelMes(fechaEfecto), 6), primerDiaDelMes(fechaCobro));

  const productosSugeridos = [
    ...new Set(
      [
        ...contexto.cuadro.productos.filter((p) => p.compania === compania).flatMap((p) => p.nombres),
        ...productosUsados.filter((p) => p.compania === compania).map((p) => p.producto),
      ].map((nombre) => nombre.trim()),
    ),
  ].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

  function validar(): string | null {
    if (nuevo ? !nuevo.nombre.trim() : !clienteId) return 'Elige un cliente o escribe el nombre del nuevo.';
    if (!compania) return 'Elige la compañía.';
    if (!producto.trim()) return 'Escribe el producto.';
    if (aportacion.trim() && aportacionValida === null) return 'La aportación tiene que ser un número mayor que cero.';
    if (aportacionValida !== null && !conDosDecimales(aportacionValida)) return 'La aportación, con dos decimales como mucho.';
    if (pideDuracion && duracion.trim() && duracionValida === null) return 'La duración va de 1 a 99 años, sin decimales.';
    if (!fechaValida && !original) return 'Pon la fecha de confirmación.';
    if (sinCalendario && !efectoDado) return `Pon la fecha de efecto: ${datosCompania.nombre} no tiene calendario.`;
    if (unidades === null) return 'Pon las unidades: el cuadro no sabe proponerlas para este producto.';
    if (!(unidades > 0 || (unidadesNivel ?? 0) > 0)) return 'Las unidades tienen que ser mayores que cero.';
    if (!conDosDecimales(unidades) || (unidadesNivel !== null && !conDosDecimales(unidadesNivel))) return 'Las unidades, con dos decimales como mucho.';
    if (!(valorUnidad > 0)) return 'Pon el €/unidad: tiene que ser mayor que cero.';
    if (!conDosDecimales(valorUnidad)) return 'El €/unidad, con dos decimales como mucho.';
    if (pctHucha > 100 || !conDosDecimales(pctHucha)) return 'La reserva va del 0 al 100 %, con dos decimales como mucho.';
    if (fechaCobro < fechaEfecto) return 'El cobro no puede ser antes del efecto.';
    return null;
  }

  function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    const problema = validar();
    setError(problema);
    if (problema || unidades === null) return;

    const cambiaronFechas =
      !original || original.fechaEfecto !== fechaEfecto || original.fechaCobro !== fechaCobro || original.mesProduccion !== mesProduccion;
    const enlace = madreId || null;
    const firma: FirmaAGuardar = {
      id: original?.id,
      ...(nuevo ? { clienteNuevo: { nombre: nuevo.nombre, referencia: nuevo.referencia || null } } : { clienteId }),
      // Solo si cambia: sin decirlo, el enlace no se toca
      ...(enlace !== (original?.aportacionDe ?? null) ? { aportacionDe: enlace } : {}),
      compania,
      producto: producto.trim(),
      pago,
      periodicidad,
      tipoComision,
      aportacion: aportacionValida,
      duracionAnios: duracionValida,
      propio,
      unidades,
      unidadesNivel: pocoAPoco ? unidadesNivel : null,
      valorUnidad,
      pctHucha,
      pctIrpf,
      fechaConfirmacion: fechaValida,
      mesProduccion,
      fechaEfecto,
      fechaCobro,
      estado,
      fechasProvisionales: cambiaronFechas ? provisionales : (original?.fechasProvisionales ?? false),
      notas: notas.trim() || null,
    };
    empezar(async () => {
      const resultado = await guardarFirma(firma);
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      if (original) alTerminar?.();
      else if (resultado.id) router.push(`/consultoria/produccion/${resultado.id}`);
    });
  }

  // «Recalcular»: lo que saldría hoy, con lo que cambiaría frente a lo guardado
  const cambios = original && antesDeRecalcular ? diferencias(original, { mesProduccion, fechaEfecto, fechaCobro, unidades, valorUnidad, pctHucha, tipoComision, bruto: importes.bruto }) : [];

  const etiquetaFecha = porPago && pago === 'transferencia' ? 'Fecha de la transferencia' : 'Fecha de confirmación de la solicitud';

  return (
    // En el móvil, el campo al que se salta se queda por encima de la tira de «lo que sale» y de la barra de abajo
    <form
      onSubmit={guardar}
      noValidate
      className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:items-start [&_:is(input,select,textarea)]:scroll-mb-40 lg:[&_:is(input,select,textarea)]:scroll-mb-0"
    >
      <div className="flex min-w-0 flex-col gap-5">
        {/* 1. Cliente */}
        <fieldset className={TARJETA}>
          <legend className="sr-only">Cliente</legend>
          <h3 className="text-base font-semibold tracking-tight text-texto">Cliente</h3>
          {nuevo ? (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className={ETIQUETA}>
                Nombre del cliente nuevo
                <input
                  value={nuevo.nombre}
                  onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
                  maxLength={80}
                  autoComplete="off"
                  className={`${CAMPO} mt-1`}
                />
              </label>
              <label className={ETIQUETA}>
                Referencia <span className="font-normal text-apagado">(opcional)</span>
                <input
                  value={nuevo.referencia}
                  onChange={(e) => setNuevo({ ...nuevo, referencia: e.target.value })}
                  maxLength={40}
                  placeholder="Quién te lo presentó"
                  autoComplete="off"
                  className={`${CAMPO} mt-1`}
                />
              </label>
            </div>
          ) : (
            <label className={`${ETIQUETA} mt-4 block`}>
              Cliente
              <select value={clienteId} onChange={(e) => elegirCliente(e.target.value)} className={`${CAMPO} mt-1`}>
                <option value="">Elige uno</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                    {c.referencia ? ` · ${c.referencia}` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          {clientes.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setNuevo(nuevo ? null : { nombre: '', referencia: '' });
                setMadreId('');
              }}
              className={`${BOTON_TEXTO} mt-1`}
            >
              {nuevo ? 'Elegir uno que ya está' : 'Es un cliente nuevo'}
            </button>
          )}
          {preguntarApex && (
            <label className={`${ETIQUETA} mt-3 block`}>
              ¿Es una aportación extraordinaria a una herramienta que ya tiene?
              <select value={madreId} onChange={(e) => elegirMadre(e.target.value)} className={`${CAMPO} mt-1`}>
                <option value="">{original ? 'No, no va con ninguna' : 'No, es una herramienta nueva'}</option>
                {madresDelCliente.map((m) => (
                  <option key={m.id} value={m.id}>
                    {textoDeMadre(m, contexto.companias)}
                  </option>
                ))}
              </select>
              {madre && (
                <span className="mt-1 block text-xs font-normal text-apagado">
                  Una APEX va con su herramienta: cuentan como una sola, y su comisión va aparte.
                </span>
              )}
            </label>
          )}
        </fieldset>

        {/* 2 a 4. La herramienta */}
        <fieldset className={TARJETA}>
          <legend className="sr-only">{madre ? 'Aportación extraordinaria' : 'Herramienta'}</legend>
          <h3 className="text-base font-semibold tracking-tight text-texto">{madre ? 'Aportación extraordinaria' : 'Herramienta'}</h3>

          {madre ? (
            <div className="mt-4 rounded-lg bg-fondo/70 px-3.5 py-3">
              <p className="text-sm font-medium break-words text-texto">
                {datosCompania.nombre} · {madre.producto}
              </p>
              <p className="mt-0.5 text-sm text-tenue">La compañía y el producto son los de su herramienta.</p>
              {!delCuadro && (
                <p className="mt-0.5 text-sm text-tenue">
                  Su aportación extraordinaria no está en el cuadro {contexto.cuadro.version}: las unidades, a mano.
                </p>
              )}
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={ETIQUETA}>
                  Compañía
                  <select value={compania} onChange={(e) => setCompania(e.target.value)} className={`${CAMPO} mt-1`}>
                    {contexto.companias.map((c) => (
                      <option key={c.codigo} value={c.codigo}>
                        {c.nombre}
                        {c.nombre !== c.codigo ? ` (${c.codigo})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <Link href="/consultoria/ajustes#companias" className={`${BOTON_TEXTO} text-sm`}>
                  ¿Otra compañía? Añádela en Ajustes
                </Link>
              </div>
              <label className={ETIQUETA}>
                Producto
                <input
                  value={producto}
                  onChange={(e) => setProducto(e.target.value)}
                  list="productos-de-la-compania"
                  maxLength={60}
                  placeholder={productosSugeridos[0] ?? 'Como sale en la liquidación'}
                  autoComplete="off"
                  className={`${CAMPO} mt-1`}
                />
                <datalist id="productos-de-la-compania">
                  {productosSugeridos.map((nombre) => (
                    <option key={nombre} value={nombre} />
                  ))}
                </datalist>
                {producto.trim() && !delCuadro && (
                  <span className="mt-1 block text-xs font-normal text-apagado">
                    No está en el cuadro {contexto.cuadro.version}: las unidades, a mano.
                  </span>
                )}
              </label>
            </div>
          )}

          <fieldset className="mt-4">
            <legend className={ETIQUETA}>Pago del primer recibo</legend>
            <Opciones
              nombre="pago"
              valor={pago}
              alCambiar={setPago}
              opciones={[
                { valor: 'domiciliacion', etiqueta: 'Domiciliación' },
                { valor: 'transferencia', etiqueta: 'Transferencia' },
              ]}
            />
            {!porPago && <p className="mt-1 text-xs text-apagado">En {datosCompania.nombre}, el pago no cambia nada.</p>}
            {porPago && madre && !original && (
              <p className="mt-1 text-xs text-apagado">El de su herramienta: cámbialo si esta aportación se paga de otra forma.</p>
            )}
          </fieldset>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className={ETIQUETA}>
              Aportación
              <span className="relative mt-1 block">
                <input
                  value={aportacion}
                  onChange={(e) => setAportacion(e.target.value)}
                  inputMode="decimal"
                  placeholder={original?.aportacion === null ? 'Sin dato' : '100'}
                  autoComplete="off"
                  className={`${CAMPO} pr-8`}
                />
                <span className="absolute top-1/2 right-3.5 -translate-y-1/2 text-apagado">€</span>
              </span>
            </label>
            {madre ? (
              <div>
                <p className={ETIQUETA}>Cada cuánto</p>
                <p className="mt-1 flex min-h-11 items-center text-sm font-medium text-texto">Única</p>
              </div>
            ) : (
              <fieldset>
                <legend className={ETIQUETA}>Cada cuánto</legend>
                <Opciones
                  nombre="periodicidad"
                  valor={periodicidad}
                  alCambiar={setPeriodicidad}
                  opciones={[
                    { valor: 'mensual', etiqueta: 'Mensual' },
                    { valor: 'unica', etiqueta: 'Única' },
                  ]}
                />
              </fieldset>
            )}
          </div>

          {pideDuracion && (
            <label className={`${ETIQUETA} mt-4 block sm:max-w-xs`}>
              Duración del contrato
              <span className="relative mt-1 block">
                <input
                  value={duracion}
                  onChange={(e) => setDuracion(e.target.value)}
                  inputMode="numeric"
                  placeholder="25"
                  autoComplete="off"
                  className={`${CAMPO} pr-14`}
                />
                <span className="absolute top-1/2 right-3.5 -translate-y-1/2 text-apagado">años</span>
              </span>
            </label>
          )}

          <label className="mt-4 flex min-h-11 items-start gap-2.5 text-sm text-texto">
            <input type="checkbox" checked={propio} onChange={(e) => setPropio(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--acento)]" />
            <span>
              Contrato propio <span className="text-tenue">(tú eres el tomador: la reserva es del 100 %)</span>
            </span>
          </label>

          {/* Las unidades: propuestas con el cuadro y editables. Manda lo que se ponga */}
          {pocoAPoco ? (
            <div className="mt-4">
              <p className="text-sm text-tenue">
                Esta comisión es {NOMBRE_TIPO_COMISION[tipoComision].toLowerCase()}: no se cobra de una vez, llega recibo a recibo en
                su liquidación. La firma lleva 0 u para cobrar y las de producción, que cuentan para el nivel.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <CampoUnidades
                  etiqueta="Unidades para cobrar"
                  valor={aMano.unidades ?? aCampo(propuesta.unidades)}
                  alCambiar={(valor) => cambiar({ unidades: valor, unidadesNivel: aMano.unidadesNivel ?? aCampo(propuesta.unidadesNivel) })}
                />
                <CampoUnidades
                  etiqueta="Unidades para el nivel"
                  valor={aMano.unidadesNivel ?? aCampo(propuesta.unidadesNivel)}
                  alCambiar={(valor) => cambiar({ unidadesNivel: valor, unidades: aMano.unidades ?? aCampo(propuesta.unidades) })}
                />
              </div>
            </div>
          ) : (
            <div className="mt-4 sm:max-w-xs">
              <CampoUnidades etiqueta="Unidades" valor={aMano.unidades ?? aCampo(propuesta.unidades)} alCambiar={(valor) => cambiar({ unidades: valor })} />
            </div>
          )}
          <PieDeUnidades
            unidadesDadas={unidadesDadas || nivelDadas}
            propuestaCuadro={unidadesDelCuadro(compania, producto, periodicidad, aportacionValida, duracionValida, contexto)}
            alVolver={() => cambiar({ unidades: null, unidadesNivel: null })}
          />
        </fieldset>

        {/* 4. Fechas y estado */}
        <fieldset className={TARJETA}>
          <legend className="sr-only">Fecha y estado</legend>
          <h3 className="text-base font-semibold tracking-tight text-texto">Fecha y estado</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className={ETIQUETA}>
              {etiquetaFecha}
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={`${CAMPO} mt-1`} />
            </label>
            <label className={ETIQUETA}>
              Estado
              <select value={estado} onChange={(e) => setEstadoAMano(e.target.value as EstadoHerramienta)} className={`${CAMPO} mt-1`}>
                {original?.estado === 'anulada' && <option value="anulada">{NOMBRE_ESTADO.anulada}</option>}
                {ESTADOS_DE_FIRMA.map((e) => (
                  <option key={e} value={e}>
                    {NOMBRE_ESTADO[e]}
                  </option>
                ))}
              </select>
              {!estadoAMano && estado === 'prevista' && (
                <span className="mt-1 block text-xs font-normal text-apagado">Prevista porque la fecha es posterior a hoy.</span>
              )}
              {original?.estado === 'anulada' && estado !== 'anulada' && (
                <AvisoConIcono como="span" className="mt-1 font-normal">Deja de estar anulada y vuelve a contar.</AvisoConIcono>
              )}
            </label>
          </div>
          {sinCalendario && (
            <label className={`${ETIQUETA} mt-4 block sm:max-w-xs`}>
              Fecha de efecto <span className="font-normal text-apagado">({datosCompania.nombre} no tiene calendario)</span>
              <input
                type="date"
                value={aMano.efecto ?? ''}
                onChange={(e) => cambiar({ efecto: e.target.value || null })}
                required
                aria-invalid={!efectoDado}
                className={`${CAMPO} mt-1 ${efectoDado ? '' : 'ring-2 ring-aviso/60'}`}
              />
              {!efectoDado && (
                <AvisoConIcono como="span" className="mt-1 font-normal">
                  Obligatoria: se ha propuesto el día 1 del mes siguiente.
                </AvisoConIcono>
              )}
            </label>
          )}

        </fieldset>

        {/* En el móvil, lo esencial de lo que sale se queda a la vista mientras se rellenan los tres bloques */}
        <div
          className="sticky z-10 rounded-lg bg-texto px-4 py-3 text-sm text-fondo shadow-lg lg:hidden"
          style={{ bottom: 'calc(80px + env(safe-area-inset-bottom))' }}
          aria-hidden
        >
          <span className="cifras">
            Efecto {fechaCorta(fechaEfecto)} · cobro {mesCorto(fechaCobro)} · {euros(importes.bruto)}
          </span>
        </div>
      </div>

      {/* 5 y 6. Lo que sale, las notas y Guardar */}
      {/* Por debajo de la cabecera del panel, que también es fija */}
      <div className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-20">
        <section className={TARJETA} aria-labelledby="lo-que-sale" aria-live="polite">
          <h3 id="lo-que-sale" className="text-base font-semibold tracking-tight text-texto">
            Lo que sale
          </h3>
          <p className="mt-0.5 text-sm text-apagado">Con el cuadro {propuesta.versionCuadro} y tus cierres. Cambia lo que no cuadre.</p>

          {original && (
            <div className="mt-3">
              {antesDeRecalcular ? (
                <div className="rounded-lg bg-fondo/70 px-3.5 py-3 text-sm">
                  {cambios.length > 0 ? (
                    <>
                      <p className="font-medium text-texto">Recalculado hoy, cambiaría:</p>
                      <ul className="mt-1 flex flex-col gap-0.5 text-tenue">
                        {cambios.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="text-tenue">Recalculado hoy, sale lo mismo que lo guardado.</p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setAMano(antesDeRecalcular);
                      setAntesDeRecalcular(null);
                    }}
                    className={BOTON_TEXTO}
                  >
                    Dejar lo guardado
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setAntesDeRecalcular(aMano);
                    setAMano(CALCULADO);
                  }}
                  className={BOTON_SECUNDARIO}
                >
                  Recalcular
                </button>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-col divide-y divide-borde">
            <Calculado
              etiqueta="Mes de producción"
              valor={nombreDelMes(mesProduccion)}
              aMano={aMano.mesProduccion !== null}
              alCambiar={() => cambiar({ mesProduccion: mesProduccion.slice(0, 7) })}
              alVolver={() => cambiar({ mesProduccion: null })}
            >
              <select aria-label="Mes de producción" value={mesProduccion.slice(0, 7)} onChange={(e) => cambiar({ mesProduccion: e.target.value })} className={CAMPO}>
                {mesesProduccion.map((mes) => (
                  <option key={mes} value={mes.slice(0, 7)}>
                    {nombreDelMes(mes)}
                  </option>
                ))}
              </select>
            </Calculado>

            {sinCalendario ? (
              <Calculado etiqueta="Efecto" valor={efectoDado ? fechaCorta(fechaEfecto) : `${fechaCorta(fechaEfecto)} (propuesto)`} />
            ) : (
              <Calculado
                etiqueta="Efecto"
                valor={fechaCorta(fechaEfecto)}
                aMano={aMano.efecto !== null}
                alCambiar={() => cambiar({ efecto: fechaEfecto })}
                alVolver={() => cambiar({ efecto: null })}
              >
                <input aria-label="Fecha de efecto" type="date" value={aMano.efecto ?? ''} onChange={(e) => cambiar({ efecto: e.target.value })} className={CAMPO} />
              </Calculado>
            )}

            <Calculado
              etiqueta="Cobro estimado"
              valor={`${nombreDelMes(fechaCobro)}`}
              detalle={propuesta.fechasProvisionales ? 'Sin confirmar' : undefined}
              aMano={aMano.cobro !== null}
              alCambiar={() => cambiar({ cobro: fechaCobro.slice(0, 7) })}
              alVolver={() => cambiar({ cobro: null })}
            >
              <select aria-label="Mes de cobro" value={fechaCobro.slice(0, 7)} onChange={(e) => cambiar({ cobro: e.target.value })} className={CAMPO}>
                {mesesCobro.map((mes) => (
                  <option key={mes} value={mes.slice(0, 7)}>
                    {nombreDelMes(mes)}
                  </option>
                ))}
              </select>
            </Calculado>

            <Calculado
              etiqueta="Nivel y €/unidad"
              valor={nivel.nivel ? `${nivel.nivel} · ${euroPorUnidad(valorUnidad)}` : valorUnidad > 0 ? euroPorUnidad(valorUnidad) : 'Sin nivel: ponlo a mano'}
              detalle={`${textoUnidades(nivel.unidadesAntes)} antes de ese mes`}
              aMano={aMano.valorUnidad !== null}
              alCambiar={() => cambiar({ valorUnidad: aCampo(valorUnidad) })}
              alVolver={() => cambiar({ valorUnidad: null })}
            >
              <CampoConSufijo etiqueta="€ por unidad" sufijo="€/u" valor={aMano.valorUnidad ?? ''} alCambiar={(valor) => cambiar({ valorUnidad: valor })} />
            </Calculado>

            <Calculado
              etiqueta="Reserva de cancelación"
              valor={pct(pctHucha)}
              detalle={pctHucha === 0 ? 'Este producto no lleva RC' : undefined}
              aMano={aMano.pctHucha !== null}
              alCambiar={() => cambiar({ pctHucha: aCampo(pctHucha) })}
              alVolver={() => cambiar({ pctHucha: null })}
            >
              <CampoConSufijo etiqueta="Reserva" sufijo="%" valor={aMano.pctHucha ?? ''} alCambiar={(valor) => cambiar({ pctHucha: valor })} />
            </Calculado>

            <Calculado
              etiqueta="Tipo de comisión"
              valor={NOMBRE_TIPO_COMISION[tipoComision]}
              aMano={aMano.tipoComision !== null}
              alCambiar={() => cambiar({ tipoComision })}
              alVolver={() => cambiar({ tipoComision: null })}
            >
              <select aria-label="Tipo de comisión" value={tipoComision} onChange={(e) => cambiar({ tipoComision: e.target.value as TipoComision })} className={CAMPO}>
                {TIPOS.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {NOMBRE_TIPO_COMISION[tipo]}
                  </option>
                ))}
              </select>
            </Calculado>
          </div>

          <div className="mt-4 rounded-lg bg-fondo/70 p-4">
            <div className="flex flex-col gap-1.5 text-sm">
              <Importe etiqueta="Comisión" valor={euros(importes.bruto)} fuerte />
              <Importe etiqueta={`RC (${pct(pctHucha)}, a la hucha)`} valor={importes.hucha === 0 ? euros(0) : `−${euros(importes.hucha)}`} />
              <Importe etiqueta={`IRPF aprox. (${pct(pctIrpf)})`} valor={importes.irpf === 0 ? euros(0) : `−${euros(importes.irpf)}`} />
              <Importe etiqueta="Neto aprox." valor={euros(importes.neto)} />
            </div>
            <p className="mt-2 text-xs text-apagado">El IRPF de verdad va sobre el total de la liquidación: puede bailar un céntimo.</p>
          </div>

          {avisos.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2">
              {avisos.map((aviso) => (
                <AvisoConIcono key={aviso.codigo + aviso.texto} como="li" caja>
                  {aviso.texto}
                </AvisoConIcono>
              ))}
            </ul>
          )}
        </section>

        <section className={TARJETA}>
          <label className={`${ETIQUETA} block`}>
            Notas <span className="font-normal text-apagado">(opcional)</span>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Efecto el día 8 por excepción"
              className={`${CAMPO} mt-1 resize-y`}
            />
            <span className="mt-1 block text-xs font-normal text-apagado">Sin datos personales del cliente.</span>
          </label>

          {error && (
            <p role="alert" className={`${ERROR} mt-3`}>
              {error}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="submit" disabled={guardando} className={`${BOTON_PRINCIPAL} flex-1`}>
              {guardando ? 'Guardando…' : original ? 'Guardar cambios' : 'Guardar la firma'}
            </button>
            {original && (
              <button type="button" onClick={alTerminar} className={BOTON_SECUNDARIO}>
                Cancelar
              </button>
            )}
          </div>
        </section>
      </div>
    </form>
  );
}

/** Una herramienta en el desplegable de la APEX: «TopPlan · INTESA · 300,00 €/mes · producción oct '26 · prevista» */
function textoDeMadre(m: MadrePosible, companias: DatosCompania[]): string {
  return [
    m.producto,
    nombreDeCompania(m.compania, companias),
    m.aportacion !== null ? aportacionDe(m) : null,
    `producción ${mesCorto(m.mesProduccion)}`,
    m.estado === 'prevista' ? 'prevista' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** `proponerFirma`, salvo con una fecha a medio escribir: hasta que esté entera, no hay cálculo */
function proponer(entrada: EntradaFirma, contexto: ContextoReglas): Propuesta | null {
  try {
    return proponerFirma(entrada, contexto);
  } catch {
    return null;
  }
}

/** Lo que el cuadro propondría sin nada a mano, para enseñarlo junto a lo que se ha puesto */
function unidadesDelCuadro(
  compania: string,
  producto: string,
  periodicidad: Periodicidad,
  aportacion: number | null,
  duracion: number | null,
  contexto: ContextoReglas,
): string | null {
  if (aportacion === null) return null;
  const { unidades, unidadesNivel } = unidadesPropuestas(
    compania,
    producto,
    periodicidad,
    { aportacion, ...(duracion !== null ? { duracionAnios: duracion } : {}) },
    contexto.cuadro,
  );
  if (unidadesNivel !== null) return `${textoUnidades(unidadesNivel)} para el nivel`;
  return unidades === null ? null : textoUnidades(unidades);
}

function PieDeUnidades({ unidadesDadas, propuestaCuadro, alVolver }: { unidadesDadas: boolean; propuestaCuadro: string | null; alVolver: () => void }) {
  if (!unidadesDadas) {
    return (
      <p className="mt-1 text-xs text-apagado">
        {propuestaCuadro ? 'Las propone el cuadro: cámbialas si no cuadran.' : 'El cuadro no las propone sin la aportación (y la duración, si la pide): ponlas a mano.'}
      </p>
    );
  }
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-apagado">
      <span>Puestas a mano{propuestaCuadro ? `; el cuadro propone ${propuestaCuadro}` : ''}.</span>
      <button
        type="button"
        onClick={alVolver}
        className="inline-flex min-h-11 items-center text-xs font-medium text-acento underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-acento"
      >
        Volver a lo calculado
      </button>
    </p>
  );
}

function CampoUnidades({ etiqueta, valor, alCambiar }: { etiqueta: string; valor: string; alCambiar: (valor: string) => void }) {
  return (
    <label className={ETIQUETA}>
      {etiqueta}
      <span className="relative mt-1 block">
        <input value={valor} onChange={(e) => alCambiar(e.target.value)} inputMode="decimal" placeholder="A mano" autoComplete="off" className={`${CAMPO} pr-8`} />
        <span className="absolute top-1/2 right-3.5 -translate-y-1/2 text-apagado">u</span>
      </span>
    </label>
  );
}

function CampoConSufijo({ etiqueta, sufijo, valor, alCambiar }: { etiqueta: string; sufijo: string; valor: string; alCambiar: (valor: string) => void }) {
  return (
    <span className="relative block">
      <input aria-label={etiqueta} value={valor} onChange={(e) => alCambiar(e.target.value)} inputMode="decimal" autoComplete="off" className={`${CAMPO} pr-12`} />
      <span className="absolute top-1/2 right-3.5 -translate-y-1/2 text-apagado">{sufijo}</span>
    </span>
  );
}

/** Un dato calculado, con «Cambiar» para ponerlo a mano y «Volver a lo calculado» */
function Calculado({
  etiqueta,
  valor,
  detalle,
  aMano = false,
  alCambiar,
  alVolver,
  children,
}: {
  etiqueta: string;
  valor: string;
  detalle?: string;
  aMano?: boolean;
  alCambiar?: () => void;
  alVolver?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0">
          <span className="block text-sm text-tenue">
            {etiqueta}
            {aMano && <span className="text-apagado"> · a mano</span>}
          </span>
          <span className="cifras block text-sm font-medium text-texto">{valor}</span>
          {detalle && <span className="block text-xs text-apagado">{detalle}</span>}
        </p>
        {alCambiar && !aMano && (
          <button
            type="button"
            onClick={alCambiar}
            aria-label={`Cambiar: ${etiqueta.toLowerCase()}`}
            className="min-h-11 shrink-0 px-2 text-sm font-medium text-acento underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-acento"
          >
            Cambiar
          </button>
        )}
      </div>
      {aMano && children && (
        <div className="mt-1 flex flex-col gap-1">
          {children}
          <button type="button" onClick={alVolver} aria-label={`${etiqueta}: volver a lo calculado`} className={`${BOTON_TEXTO} self-start text-sm`}>
            Volver a lo calculado
          </button>
        </div>
      )}
    </div>
  );
}

function Importe({ etiqueta, valor, fuerte = false }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <p className="flex items-baseline justify-between gap-3">
      <span className={`min-w-0 ${fuerte ? 'font-semibold text-texto' : 'text-tenue'}`}>{etiqueta}</span>
      <span className={`cifras shrink-0 ${fuerte ? 'text-lg font-semibold text-texto' : 'font-medium text-texto'}`}>{valor}</span>
    </p>
  );
}

function sinRepetir(avisos: Aviso[]): Aviso[] {
  const vistos = new Set<string>();
  return avisos.filter((a) => {
    const clave = `${a.codigo}|${a.texto}`;
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

/** Lo que cambiaría frente a lo guardado, en frases cortas */
function diferencias(
  h: Herramienta,
  ahora: { mesProduccion: string; fechaEfecto: string; fechaCobro: string; unidades: number | null; valorUnidad: number; pctHucha: number; tipoComision: TipoComision; bruto: number },
): string[] {
  const lista: string[] = [];
  if (h.mesProduccion !== ahora.mesProduccion) lista.push(`Producción: de ${nombreDelMes(h.mesProduccion)} a ${nombreDelMes(ahora.mesProduccion)}`);
  if (h.fechaEfecto !== ahora.fechaEfecto) lista.push(`Efecto: de ${fechaCorta(h.fechaEfecto)} a ${fechaCorta(ahora.fechaEfecto)}`);
  if (h.fechaCobro !== ahora.fechaCobro) lista.push(`Cobro: de ${nombreDelMes(h.fechaCobro)} a ${nombreDelMes(ahora.fechaCobro)}`);
  if (ahora.unidades !== null && h.unidades !== ahora.unidades) lista.push(`Unidades: de ${textoUnidades(h.unidades)} a ${textoUnidades(ahora.unidades)}`);
  if (h.valorUnidad !== ahora.valorUnidad) lista.push(`€/unidad: de ${euroPorUnidad(h.valorUnidad)} a ${euroPorUnidad(ahora.valorUnidad)}`);
  if (h.pctHucha !== ahora.pctHucha) lista.push(`Reserva: de ${pct(h.pctHucha)} a ${pct(ahora.pctHucha)}`);
  if (h.tipoComision !== ahora.tipoComision) lista.push(`Tipo: de ${NOMBRE_TIPO_COMISION[h.tipoComision]} a ${NOMBRE_TIPO_COMISION[ahora.tipoComision]}`);
  if (h.bruto !== ahora.bruto) lista.push(`Comisión: de ${euros(h.bruto)} a ${euros(ahora.bruto)}`);
  return lista;
}

/**
 * Una herramienta que ya se cobró: sus unidades, €/unidad, porcentajes y mes de cobro no se
 * cambian (lo para la base de datos). Aquí, las notas, si está anulada sin extorno, volver a
 * cobrada, y si es única, engancharla a su herramienta o desengancharla (es solo el enlace). Se
 * mandan los datos tal como están guardados.
 */
function CambiarCobrada({
  herramienta: h,
  madres,
  companias,
  alTerminar,
}: {
  herramienta: HerramientaConAportaciones;
  madres: MadrePosible[];
  companias: DatosCompania[];
  alTerminar?: () => void;
}) {
  const [notas, setNotas] = useState(h.notas ?? '');
  const [estado, setEstado] = useState<EstadoHerramienta>(h.estado === 'anulada' ? 'anulada' : 'cobrada');
  const [madreId, setMadreId] = useState(h.aportacionDe ?? '');
  const [error, setError] = useState<string | null>(null);
  const [guardando, empezar] = useTransition();

  // Solo de la misma compañía: la de una cobrada no se cambia, y la APEX tiene que ser de la de su herramienta
  const madresDelCliente = madres.filter(
    (m) => m.clienteId === h.clienteId && m.id !== h.id && (m.compania === h.compania || m.id === h.aportacionDe),
  );
  const preguntarApex = h.periodicidad === 'unica' && h.aportaciones.length === 0 && madresDelCliente.length > 0;
  const enlace = madreId || null;

  function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    empezar(async () => {
      const resultado = await guardarFirma({
        id: h.id,
        clienteId: h.clienteId,
        compania: h.compania,
        producto: h.producto,
        pago: h.pago,
        periodicidad: h.periodicidad,
        tipoComision: h.tipoComision,
        aportacion: h.aportacion,
        duracionAnios: h.duracionAnios,
        propio: h.propio,
        unidades: h.unidades,
        unidadesNivel: h.unidadesNivel,
        valorUnidad: h.valorUnidad,
        pctHucha: h.pctHucha,
        pctIrpf: h.pctIrpf,
        fechaConfirmacion: h.fechaConfirmacion,
        mesProduccion: h.mesProduccion,
        fechaEfecto: h.fechaEfecto,
        fechaCobro: h.fechaCobro,
        estado,
        fechasProvisionales: h.fechasProvisionales,
        notas: notas.trim() || null,
        ...(enlace !== (h.aportacionDe ?? null) ? { aportacionDe: enlace } : {}),
      });
      if (resultado.error) setError(resultado.error);
      else alTerminar?.();
    });
  }

  return (
    <form onSubmit={guardar} className={TARJETA}>
      <h3 className="text-base font-semibold tracking-tight text-texto">Cambiar la herramienta</h3>
      <p className="mt-1 max-w-prose text-sm text-tenue">
        Ya se cobró en una liquidación: sus unidades, su €/unidad, sus porcentajes y su mes de cobro no se cambian. Para eso,
        deshaz antes la liquidación.
      </p>
      {preguntarApex && (
        <label className={`${ETIQUETA} mt-4 block`}>
          ¿Es una aportación extraordinaria a una herramienta que ya tiene?
          <select value={madreId} onChange={(e) => setMadreId(e.target.value)} className={`${CAMPO} mt-1`}>
            <option value="">No, no va con ninguna</option>
            {madresDelCliente.map((m) => (
              <option key={m.id} value={m.id}>
                {textoDeMadre(m, companias)}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs font-normal text-apagado">Es solo el enlace: no cambia ningún importe.</span>
        </label>
      )}
      {h.estado === 'anulada' && !h.extorno && (
        <label className={`${ETIQUETA} mt-4 block sm:max-w-xs`}>
          Estado
          <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoHerramienta)} className={`${CAMPO} mt-1`}>
            <option value="anulada">{NOMBRE_ESTADO.anulada}</option>
            <option value="cobrada">Cobrada: quitar la anulación</option>
          </select>
        </label>
      )}
      <label className={`${ETIQUETA} mt-4 block`}>
        Notas
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={500} rows={4} className={`${CAMPO} mt-1 resize-y`} />
        <span className="mt-1 block text-xs font-normal text-apagado">Sin datos personales del cliente.</span>
      </label>
      {error && (
        <p role="alert" className={`${ERROR} mt-3`}>
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" disabled={guardando} className={BOTON_PRINCIPAL}>
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button type="button" onClick={alTerminar} className={BOTON_SECUNDARIO}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
