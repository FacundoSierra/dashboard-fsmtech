/**
 * Los tipos de las pantallas de la consultoría (REQ-001, spec 4.1 y 4.2): lo que devuelven las
 * consultas de `consultas.ts` y lo que reciben las acciones de `acciones.ts`. Solo tipos: los de las
 * reglas vienen de `reglas.ts` con `import type`, así que este archivo no carga nada en el navegador.
 *
 * Euros como `number` con dos decimales, unidades con dos decimales, porcentajes como 10 o 15, fechas
 * `AAAA-MM-DD` y meses como su día 1 (`2026-11-01`). **Un porcentaje 0 es un valor, no un vacío.**
 */
import type {
  Ajustes,
  Aviso,
  Calendario,
  Cierre,
  ContextoReglas,
  Cuadro,
  DatosCompania,
  EstadoHerramienta,
  Liquidacion,
  Nivel,
  Pago,
  Periodicidad,
  ReglaCompania,
  TipoComision,
} from "./reglas";

/** Lo que devuelve cada acción: el error para el usuario (en español, sin detalles internos) o el aviso de que ha ido bien */
export interface Resultado {
  error?: string;
  ok?: string;
}

/** El `Resultado` de siempre y, al crear algo, su `id` */
export type ResultadoConId = Resultado & { id?: string };

/** La migración que falta: la 0001 (las tablas, vistas y funciones de la consultoría en la base del panel) */
export type MigracionQueFalta = "0001";

/**
 * Lo que le falta a la sección para enseñar algo (`exigirConsultoria()` de `sesion.ts`): las variables
 * de la base en el servidor (`configuracion`), la migración (`0001`) o la copia de los datos de
 * FSM-Finance (`copia`: la base no tiene consultor). Las consultas solo dicen la migración (`falta`)
 */
export type LoQueFalta = "configuracion" | MigracionQueFalta | "copia";

/**
 * Todas las consultas lo llevan: `true` si falta una migración (una tabla, vista o columna que no
 * existe). Entonces el resto viene vacío y la página dice qué migración ejecutar: `falta`, que con
 * `pendiente: false` no viene
 */
export interface ConPendiente {
  pendiente: boolean;
  falta?: MigracionQueFalta;
}

/** Qué sale de los valores de serie porque el consultor aún no tiene filas propias */
export interface DeSerie {
  companias: boolean;
  niveles: boolean;
  ajustes: boolean;
}

// ---------------------------------------------------------------------------------------------
// Liquidaciones y cuenta de comisiones
// ---------------------------------------------------------------------------------------------

/** Un mes de cobro, como el documento de OVB */
export interface MesLiquidacion {
  mes: string;
  /** Si ha llegado: su liquidación, con su n.º y su fecha */
  liquidacionId: string | null;
  numero: number | null;
  fecha: string | null;
  /**
   * El recuento de las líneas del mes (las cobradas y las que no), como `recuentoDelMes()` de
   * `reglas.ts`: «4 herramientas y 1 APEX · 2 previstas» (`textoDelRecuento`). `herramientas` no
   * cuenta las APEX enlazadas, que van en `apex`; `previstas` las cuenta todas,
   * también las APEX. `unidades`, las de todas las líneas
   */
  herramientas: number;
  apex: number;
  previstas: number;
  unidades: number;
  /** Lo que ha llegado (si ha llegado) o lo que se espera, con el IRPF sobre el total */
  liquidacion: Liquidacion;
  /** La cuenta de comisiones: el saldo que viene de antes, lo que se transfiere y lo que pasa a la siguiente */
  saldoAnterior: number;
  aPagar: number;
  saldoDespues: number;
  /** Lo que entró de verdad en el banco (null si no se ha apuntado); la pantalla enseña `aPagar − importeRecibido` si no es 0 */
  importeRecibido: number | null;
  /** En un mes que ha llegado, lo que se quedó en él sin cobrar (no cuenta en `aPagar`); si no, null */
  pendiente: Liquidacion | null;
  /** De lo que aún no ha llegado, lo previsto (sin firmar), fila a fila: orientativo */
  netoPrevisto: number;
}

export interface TotalesDelAnio {
  /** Comisión, RC, IRPF y cargos de las liquidaciones que **han llegado** ese año */
  comision: number;
  rc: number;
  irpf: number;
  cargos: number;
  /** Lo transferido en esas liquidaciones: lo recibido si se apuntó; si no, el importe a pagar */
  pagado: number;
  /** El importe a pagar de los meses de ese año que aún no han llegado */
  previsto: number;
  /** IRPF que se devuelve por los extornos de ese año (`irpf_hucha` + `irpf_resto`): supuesto, 0 de serie */
  irpfDeExtornos: number;
  /** Lo reclamado de la hucha ese año, en positivo, con el IRPF retenido y lo que queda */
  huchaReclamada: { importe: number; irpf: number; neto: number };
}

/** Un cargo o abono de la cuenta de comisiones (de `consultoria_cuenta`) o el resto de un extorno */
export interface MovimientoDeCuenta {
  fecha: string;
  concepto: string;
  /** Con signo: cargo negativo, abono positivo */
  importe: number;
  aplicado: boolean;
  /** El mes de la liquidación en que se aplicó; null si aún no */
  mes: string | null;
  /** Solo en los restos de extornos: el mes en que se espera aplicar */
  mesPrevisto: string | null;
  liquidacionId: string | null;
  /** Uno de los dos: `cargoId` (de `consultoria_cuenta`, se cambia y se borra) o `extornoId` */
  cargoId: string | null;
  extornoId: string | null;
  /** Solo en los restos de extornos */
  cliente: string | null;
}

/** Una línea de un mes, para el detalle y para «Ha llegado» */
export interface LineaLiquidacion {
  herramientaId: string;
  clienteId: string;
  cliente: string;
  compania: string;
  producto: string;
  estado: EstadoHerramienta;
  /** El día 1 del mes de su cobro */
  mes: string;
  fechaCobro: string;
  liquidacionId: string | null;
  cobrada: boolean;
  prevista: boolean;
  unidades: number;
  bruto: number;
  hucha: number;
  /** Para `calcularLiquidacion` al marcar y desmarcar en el navegador */
  pctIrpf: number;
  /** Si es una APEX, la herramienta de la que cuelga (se rotula «TopPlan · APEX»); si no, null */
  aportacionDe: string | null;
}

// ---------------------------------------------------------------------------------------------
// La hucha
// ---------------------------------------------------------------------------------------------

export interface MovimientoDeHucha {
  fecha: string;
  tipo: "inicial" | "liquidacion" | "extorno" | "reclamacion" | "ajuste";
  /** Con signo: lo que entra, positivo; lo que sale, negativo */
  importe: number;
  irpf: number;
  /** El saldo después de este movimiento */
  saldo: number;
  /** El origen: uno de los tres; `movimientoId` es el de `consultoria_hucha` (los únicos que se cambian o se borran) */
  liquidacionId: string | null;
  extornoId: string | null;
  movimientoId: string | null;
  /** Solo en los extornos */
  cliente: string | null;
  notas: string | null;
}

// ---------------------------------------------------------------------------------------------
// El Resumen
// ---------------------------------------------------------------------------------------------

/** Una barra del Resumen: `valor` es lo pagado; `previsto`, el importe a pagar de lo que aún no ha llegado (spec 5.4) */
export interface BarraDelResumen {
  mes: string;
  valor: number;
  previsto?: number;
  detalle?: string;
}

export interface ResumenConsultoria {
  /** El mes de hoy, si tiene algo */
  esteMes: MesLiquidacion | null;
  /** El primer mes después del de hoy que tiene algo */
  siguiente: MesLiquidacion | null;
  hucha: {
    saldo: number;
    /** La reserva de todo lo que aún no ha llegado, previstas incluidas */
    porEntrar: number;
    /** La reserva que ha entrado con las liquidaciones de este año */
    retenidaEsteAnio: number;
  };
  cuenta: {
    /** Lo que pasa de la última liquidación que ha llegado a la siguiente (0 si se pagó) */
    saldo: number;
    /** Cargos y abonos aún sin aplicar, también los restos de extornos */
    cargosSinAplicar: number;
  };
  nivel: {
    /** El nivel alcanzado con las unidades hasta este mes: el que vale para la producción del mes que viene */
    nombre: string;
    valorUnidad: number;
    /** Las unidades hasta este mes (incluido), sin las previstas */
    unidades: number;
    /** Las de las previstas, de cualquier mes */
    unidadesPrevistas: number;
    /** El que vale para la producción de este mes (si `cambiaEl` no es null, es distinto) */
    esteMes: { nombre: string; valorUnidad: number };
    /** El nivel que viene: cuánto falta (null si no va por unidades, como Gestor de Equipo) */
    siguiente: { nombre: string; valorUnidad: number; faltan: number | null } | null;
    /** Si el mes que viene ya cambia de €/unidad */
    cambiaEl: { mes: string; nombre: string; valorUnidad: number } | null;
    /** Los de `valorUnidadDelMes`: «el nivel sale de contar las previstas», «no hay ningún nivel» */
    avisos: Aviso[];
  };
  proximosCierres: Cierre[];
  /** Año del que faltan cierres, si el mes que viene no tiene: «carga los de 2027» */
  faltanCierresDe: number | null;
  /** Del primer mes con algo al último con algo previsto, como mucho 12 */
  barras: BarraDelResumen[];
}

// ---------------------------------------------------------------------------------------------
// Clientes y herramientas
// ---------------------------------------------------------------------------------------------

export interface ClienteDeLaLista {
  id: string;
  nombre: string;
  referencia: string | null;
  proximaRevision: string | null;
  /** No anuladas (sin los recibos de una comisión sobre recibo o sobre saldo) */
  herramientas: number;
  previstas: number;
  /** De las que la tienen: lo importado del histórico no la trae («sin dato» si hay herramientas y las dos son 0) */
  aportacionMensual: number;
  aportacionUnica: number;
  /** La comisión bruta de sus herramientas que cuentan, menos sus extornos */
  generadoBruto: number;
}

export interface FichaCliente {
  cliente: ClienteDeLaLista & { notas: string | null };
  /**
   * Las herramientas madre (de la más nueva a la más antigua), cada una con sus APEX dentro, de la
   * más antigua a la más nueva. Una APEX sin enlace (las de antes) sale aquí como una herramienta más
   */
  herramientas: HerramientaConAportaciones[];
}

export interface Extorno {
  id: string;
  herramientaId: string;
  fecha: string;
  importe: number;
  deHucha: number;
  resto: number;
  /** Último día del mes en que se espera aplicar el resto; null si la hucha lo cubre entero */
  restoCobro: string | null;
  /** Su resto ya se aplicó en una liquidación: ya no se cambia ni se borra */
  aplicado: boolean;
  liquidacionId: string | null;
  /** Supuestos, 0 de serie */
  irpfHucha: number;
  irpfResto: number;
  notas: string | null;
}

export interface Herramienta {
  id: string;
  clienteId: string;
  cliente: string;
  compania: string;
  producto: string;
  pago: Pago;
  periodicidad: Periodicidad;
  tipoComision: TipoComision;
  /** Null en lo importado del histórico */
  aportacion: number | null;
  duracionAnios: number | null;
  propio: boolean;
  unidades: number;
  /** Las que cuentan para el nivel; null = las de `unidades` */
  unidadesNivel: number | null;
  valorUnidad: number;
  pctHucha: number;
  pctIrpf: number;
  fechaConfirmacion: string | null;
  mesProduccion: string;
  fechaEfecto: string;
  fechaCobro: string;
  estado: EstadoHerramienta;
  fechasProvisionales: boolean;
  /** Está en una liquidación: sus unidades, €/unidad, porcentajes y cobro ya no se cambian */
  liquidada: boolean;
  liquidacionId: string | null;
  anuladaEl: string | null;
  extorno: Extorno | null;
  /** `bruto` y `hucha`, como en la liquidación; `irpf` y `neto`, orientativos */
  bruto: number;
  hucha: number;
  irpf: number;
  neto: number;
  notas: string | null;
  /** De dónde vino si no se apuntó a mano: de una nota de producción o del histórico de OVB */
  procedencia: "nota" | "historico" | null;
  /** Efecto + el plazo de extorno de su producto (48 meses de serie); null si está anulada sin haberse cobrado */
  libreDeExtornoEl: string | null;
  /** Si es una aportación extraordinaria (APEX), la herramienta de la que cuelga; si no, null (`aportacion_de`) */
  aportacionDe: string | null;
  /** La herramienta de la que es APEX, para «APEX de TopPlan» con su enlace; null si no lo es */
  de: { id: string; producto: string } | null;
}

/** Una herramienta con sus aportaciones extraordinarias (las que la tienen en `aportacionDe`) */
export interface HerramientaConAportaciones extends Herramienta {
  /** De la más antigua a la más nueva; vacío si no tiene. Una APEX no tiene aportaciones (un solo nivel) */
  aportaciones: Herramienta[];
}

/** Los filtros de Producción, de la URL: `?mes=2026-11&compania=AXA&estado=prevista` */
export interface FiltrosProduccion {
  /** Mes de producción: `AAAA-MM` o `AAAA-MM-DD` */
  mes?: string;
  compania?: string;
  estado?: EstadoHerramienta;
}

export interface Produccion {
  filas: Herramienta[];
  /**
   * De las filas que cuentan (no anuladas). `herramientas`, `apex` y `unidades` son las de
   * producción (`unidadesNivel ?? unidades`, sin los recibos de una sobre recibo): `herramientas` no
   * cuenta las APEX enlazadas, que van en `apex`, y las unidades las suman todas (cuentan para el
   * nivel). `comision` y `rc`, de todas: «2 herramientas y 1 APEX · 448,80 u»
   */
  totales: { herramientas: number; apex: number; unidades: number; comision: number; rc: number; anuladas: number };
  /** Meses de producción con algo, del más nuevo al más antiguo, para el filtro */
  meses: string[];
}

export interface ProductoUsado {
  compania: string;
  producto: string;
  periodicidad: Periodicidad;
}

// ---------------------------------------------------------------------------------------------
// Lo que devuelve cada consulta
// ---------------------------------------------------------------------------------------------

export interface ContextoConsultoria extends ConPendiente {
  contexto: ContextoReglas;
  deSerie: DeSerie;
}

export interface HuchaConsultoria extends ConPendiente {
  movimientos: MovimientoDeHucha[];
  /** La suma de todos (el saldo del último). Puede ser negativo: se avisa, no se impide */
  saldo: number;
  /** La reserva de todo lo que aún no ha llegado */
  porEntrar: number;
}

export interface CuentaConsultoria extends ConPendiente {
  movimientos: MovimientoDeCuenta[];
  /** Lo que pasa de la última liquidación que ha llegado a la siguiente */
  saldo: number;
  cargosSinAplicar: number;
}

export interface LiquidacionesDelAnio extends ConPendiente {
  /** Los meses de ese año, en orden; el saldo de cada uno viene de todos los anteriores */
  meses: MesLiquidacion[];
  anio: TotalesDelAnio;
  /** Los años con algún mes, para cambiar de año */
  anios: number[];
}

export interface DetalleDelMes extends ConPendiente {
  /** El mes con sus cifras; null si no tiene nada */
  mes: MesLiquidacion | null;
  lineas: LineaLiquidacion[];
  /** Los aplicados en ese mes y, si no ha llegado, los que se pueden marcar en él: los cargos sin aplicar y los restos previstos para él */
  cargos: MovimientoDeCuenta[];
}

export interface AjustesConsultoria extends ConPendiente {
  ajustes: Ajustes;
  niveles: Nivel[];
  companias: DatosCompania[];
  cierres: Cierre[];
  /** El cuadro vigente, de solo lectura */
  cuadro: Pick<Cuadro, "version" | "productos" | "minimoTransferencia" | "reserva">;
  deSerie: DeSerie;
}

// ---------------------------------------------------------------------------------------------
// Lo que reciben las acciones
// ---------------------------------------------------------------------------------------------

/** Lo que se ha visto en la pantalla de la firma: la acción no recalcula las fechas */
export interface FirmaAGuardar {
  /** Para cambiar una que ya está */
  id?: string;
  /** Uno de los dos. Con `aportacionDe`, el de la madre (si no viene, se toma de ella; un cliente nuevo no vale) */
  clienteId?: string;
  clienteNuevo?: { nombre: string; referencia?: string | null };
  /**
   * La herramienta de la que es aportación extraordinaria (APEX), del mismo cliente y que no sea a su
   * vez una APEX. **Sin decir (`undefined`), no se toca**: al crear, sin enlace; al cambiar, el que
   * tenga. `null` la desengancha. Se puede cambiar también en una cobrada: es solo el enlace
   */
  aportacionDe?: string | null;
  /** Obligatorios salvo con `aportacionDe`: entonces, si no vienen, los de la madre (y la compañía, la misma) */
  compania?: string;
  producto?: string;
  pago?: Pago;
  /** Con `aportacionDe`, `unica` (si no viene, se pone) */
  periodicidad?: Periodicidad;
  tipoComision: TipoComision;
  aportacion?: number | null;
  duracionAnios?: number | null;
  propio: boolean;
  /** 0 vale en la firma de una sobre recibo o sobre saldo, con `unidadesNivel` mayor que 0 */
  unidades: number;
  unidadesNivel?: number | null;
  valorUnidad: number;
  /** Sin decir: los del cuadro, la compañía o Ajustes. 0 vale */
  pctHucha?: number | null;
  pctIrpf?: number | null;
  /** Null solo en lo importado */
  fechaConfirmacion: string | null;
  /** Se lleva al día 1 */
  mesProduccion: string;
  fechaEfecto: string;
  /** Se lleva al último día de su mes */
  fechaCobro: string;
  /**
   * Nueva o sin liquidar: `prevista`, `firmada`, `confirmada` o `incidencia` (si estaba anulada, vuelve
   * a contar). Liquidada: `cobrada` (si estaba anulada, deja de estarlo) o `anulada` si ya lo estaba.
   * Para anular, `anularHerramienta`
   */
  estado: EstadoHerramienta;
  fechasProvisionales: boolean;
  notas?: string | null;
}

export interface ExtornoAGuardar {
  fecha: string;
  importe: number;
  deHucha: number;
  /** Obligatorio si la hucha no lo cubre entero (`importe > deHucha`); se lleva al último día de su mes */
  restoCobro?: string | null;
  irpfHucha?: number | null;
  irpfResto?: number | null;
  notas?: string | null;
}

export interface AnulacionAGuardar {
  id: string;
  anuladaEl: string;
  /** Solo si se cobró: el reparto que se ha visto (`proponerExtorno`) */
  extorno?: ExtornoAGuardar | null;
}

/** Con `id`, cambia ese extorno; sin él, crea el de `herramientaId` (anulada y cobrada) */
export interface ExtornoACambiar extends ExtornoAGuardar {
  id?: string;
  herramientaId?: string;
}

export interface ClienteAGuardar {
  id?: string;
  nombre: string;
  referencia?: string | null;
  proximaRevision?: string | null;
  notas?: string | null;
}

/** «Ha llegado» */
export interface LiquidacionAMarcar {
  /** `AAAA-MM` o cualquier día del mes */
  mes: string;
  fecha: string;
  numero?: number | null;
  /** Herramientas que entran (las demás del mes pasan al siguiente), restos de extornos y cargos que se aplican */
  entraron: string[];
  extornos: string[];
  cargos: string[];
  importeRecibido?: number | null;
  /** Por qué no entraron las demás: 200 caracteres como mucho */
  motivo?: string | null;
}

/** Lo que se cambia de una liquidación que ya llegó. Su mes no se cambia nunca: para eso, se deshace */
export interface LiquidacionAGuardar {
  id: string;
  fecha: string;
  numero?: number | null;
  importeRecibido?: number | null;
  notas?: string | null;
}

export interface CargoAGuardar {
  id?: string;
  fecha: string;
  concepto: string;
  /** Con signo: cargo negativo, abono positivo. Nunca 0 */
  importe: number;
}

export interface MovimientoDeHuchaAGuardar {
  id?: string;
  tipo: "inicial" | "reclamacion" | "ajuste";
  fecha: string;
  /** En positivo: el signo lo pone el tipo (en un ajuste, `sentido`) */
  importe: number;
  /** Solo en un ajuste */
  sentido?: "entra" | "sale";
  /** Solo en una reclamación; sin decir, `irpfDeReclamacion` con el IRPF de Ajustes */
  irpf?: number | null;
  notas?: string | null;
}

export interface CompaniaAGuardar {
  codigo: string;
  nombre: string;
  regla: ReglaCompania;
  /** Obligatorio salvo en `sin_calendario`, que no lleva */
  calendario?: Exclude<Calendario, "RANKING"> | null;
  pctHucha?: number | null;
  mesesHastaCobro?: number | null;
}

export type AjustesAGuardar = Ajustes;
