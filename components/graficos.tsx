import type { Cobro } from '@/lib/economia';
import type { Dia } from '@/lib/vigilancia/disponibilidad';
import { duracion } from '@/lib/vigilancia/disponibilidad';
import { Muestra, Rayado } from './piezas';

// ── Barras horizontales ──────────────────────────────────────────────────────

export interface Barra {
  clave: string;
  etiqueta: string;
  valor: number;
  texto: string;
  detalle?: string;
}

/**
 * Comparación de magnitudes entre clientes. Una sola serie, así que todas las barras van
 * del mismo color (colorearlas por tamaño repetiría lo que ya dice la longitud). Barras
 * finas en píldora, como las de Hoy tumbadas, y el valor rotulado en la punta.
 *
 * `reparto`: cada barra es su parte del total (`reparto`, o la suma de las barras), sobre una pista
 * que es el total entero, con el nombre y la cifra encima y el porcentaje al lado. Para una tarjeta
 * estrecha («Reparto por cliente»): el ancho de la barra es el mismo porcentaje que se lee
 */
export function BarrasHorizontales({ barras, titulo, reparto }: { barras: Barra[]; titulo: string; reparto?: true | number }) {
  const maximo = Math.max(...barras.map((b) => b.valor), 0) || 1;
  const total = (typeof reparto === 'number' && reparto > 0 ? reparto : barras.reduce((suma, b) => suma + Math.max(0, b.valor), 0)) || 1;

  if (reparto !== undefined) {
    return (
      <ul aria-label={titulo} className="space-y-4">
        {barras.map((barra) => (
          <li key={barra.clave} title={`${barra.etiqueta}: ${barra.texto}${barra.detalle ? ` · ${barra.detalle}` : ''}`}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{barra.etiqueta}</span>
              <span className="cifras shrink-0">
                <span className="font-semibold">{barra.texto}</span>
                {barra.detalle && <span className="text-tenue"> · {barra.detalle}</span>}
              </span>
            </div>
            <div aria-hidden className="mt-2 h-3 overflow-hidden rounded-full bg-superficie-2">
              <div className="h-full rounded-full bg-serie" style={{ width: `max(${Math.min(100, (Math.max(0, barra.valor) / total) * 100)}%, 0.75rem)` }} />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul aria-label={titulo} className="space-y-3">
      {barras.map((barra) => {
        const ancho = (barra.valor / maximo) * 100;
        return (
          <li key={barra.clave} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 sm:grid-cols-[minmax(0,12rem)_1fr]">
            <span className="truncate text-sm" title={barra.etiqueta}>
              {barra.etiqueta}
            </span>
            <div className="flex min-w-0 items-center gap-2" title={`${barra.etiqueta}: ${barra.texto}${barra.detalle ? ` · ${barra.detalle}` : ''}`}>
              {barra.valor > 0 ? (
                <span className="block h-3 rounded-full bg-serie" style={{ width: `max(${ancho * 0.8}%, 0.75rem)` }} />
              ) : (
                <span className="block h-3 w-px bg-eje" />
              )}
              <span className="cifras shrink-0 text-sm font-medium">{barra.texto}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ── Franja de disponibilidad ─────────────────────────────────────────────────

const FECHA_CORTA = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * Un día por píldora, como en las páginas de estado, en el lenguaje de las barras de Hoy: los días
 * sin caídas, en el azul de los datos; los que no tienen datos, en gris y más bajos, y los que
 * tuvieron una caída, en el rojo de crítico y los más altos. El verde y el rojo no se distinguían
 * con deuteranopía (ΔE 4,1): ahora es azul contra rojo, la altura lo repite y el resumen de al
 * lado lo dice con palabras.
 */
export function FranjaDisponibilidad({ dias, nombre }: { dias: Dia[]; nombre: string }) {
  const conIncidencia = dias.filter((d) => d.estado === 'incidencia').length;
  const sinDatos = dias.every((d) => d.estado === 'sin-datos');

  return (
    // `relative`: el texto para lectores de pantalla va en posición absoluta; sin esto se
    // colocaría respecto a la página y, dentro de una tabla con scroll, la ensancharía
    <div className="relative">
      <div className="flex h-7 items-end gap-[2px]" aria-hidden>
        {dias.map((dia) => {
          const fecha = FECHA_CORTA.format(new Date(`${dia.fecha}T00:00:00Z`));
          const titulo =
            dia.estado === 'sin-datos'
              ? `${fecha}: sin datos`
              : dia.estado === 'incidencia'
                ? `${fecha}: caída de ${duracion(dia.minutosCaida)}`
                : `${fecha}: sin incidencias`;
          return (
            <span
              key={dia.fecha}
              title={titulo}
              className={`min-w-0 flex-1 rounded-full ${
                dia.estado === 'incidencia' ? 'h-7 bg-critico' : dia.estado === 'bien' ? 'h-5 bg-serie' : 'h-3.5 bg-sin-datos'
              }`}
            />
          );
        })}
      </div>
      <p className="sr-only">
        {nombre}:{' '}
        {sinDatos
          ? 'sin datos de disponibilidad todavía'
          : conIncidencia
            ? `${conIncidencia} días con incidencias en los últimos ${dias.length}`
            : `sin incidencias en los últimos ${dias.length} días`}
      </p>
    </div>
  );
}

// ── Franja de cobros de un plan ──────────────────────────────────────────────

const INICIAL_MES = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MES_LARGO = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });

type EstadoMes = 'cobrado' | 'atrasado' | 'pendiente' | 'programado' | 'nada';

function estadoDelMes(cobros: Cobro[]): EstadoMes {
  if (cobros.length === 0) return 'nada';
  if (cobros.some((c) => c.estado === 'atrasado')) return 'atrasado';
  if (cobros.some((c) => c.estado === 'pendiente')) return 'pendiente';
  if (cobros.every((c) => c.estado === 'cobrado')) return 'cobrado';
  return 'programado';
}

/**
 * Los meses de un plan (normalmente doce, de septiembre a agosto, por ejemplo), una píldora por
 * mes, como las barras de Hoy: lo cobrado, relleno del azul de los datos; lo que falta por cobrar,
 * rayado, y lo atrasado, del tono de «grave». La altura repite el estado (el color no va solo):
 * lo atrasado es la más alta, lo de este mes la siguiente, y lo cobrado y lo que está por llegar,
 * las bajas. Un mes sin cobros es un punto. El mes de hoy lleva su inicial en negrita.
 *
 * El rayado es un patrón SVG que la página pinta una vez (`PatronRayado`) y aquí llega por su `id`.
 */
export function FranjaCobros({
  meses,
  cobros,
  nombre,
  rayado,
  mesActual,
}: {
  meses: string[];
  cobros: Cobro[];
  nombre: string;
  rayado: string;
  /** `AAAA-MM`: el mes de hoy */
  mesActual: string;
}) {
  const celdas = meses.map((mes) => {
    const delMes = cobros.filter((c) => c.mes === mes);
    const [anio, m] = mes.split('-').map(Number);
    return {
      mes,
      inicial: INICIAL_MES[m - 1],
      // Enero lleva el año debajo, para ver dónde cambia
      anio: m === 1 && mes !== meses[0] ? String(anio).slice(2) : undefined,
      nombreLargo: MES_LARGO.format(new Date(Date.UTC(anio, m - 1, 1))),
      estado: estadoDelMes(delMes),
      total: delMes.reduce((suma, c) => suma + c.importe, 0),
    };
  });
  const atrasados = celdas.filter((c) => c.estado === 'atrasado').length;

  // De 24 px de ancho y 40 de alto como mínimo: más estrechas o más bajas, el rayado se leía como
  // tres rayas sueltas y no como una píldora
  const alto: Record<Exclude<EstadoMes, 'nada'>, string> = {
    atrasado: 'h-[4.5rem] bg-grave-icono',
    pendiente: 'h-14',
    cobrado: 'h-10 bg-serie',
    programado: 'h-10',
  };
  const texto: Record<EstadoMes, string> = {
    atrasado: 'sin cobrar, atrasado',
    pendiente: 'pendiente de cobrar este mes',
    cobrado: 'cobrado',
    programado: 'por cobrar',
    nada: 'sin cobros',
  };

  return (
    <div className="relative">
      {/* Del alto de su píldora más alta: un plan sin cobros (solo puntos) no deja un hueco encima */}
      <div className="flex items-end gap-1" aria-hidden>
        {celdas.map((c) => (
          <span
            key={c.mes}
            title={`${c.nombreLargo}: ${texto[c.estado]}${c.total ? ` (${c.total.toLocaleString('es-ES')} €)` : ''}`}
            className="flex min-w-0 flex-1 justify-center"
          >
            {c.estado === 'nada' ? (
              <span className="mb-0.5 size-2 rounded-full bg-sin-datos" />
            ) : (
              <span className={`block w-full max-w-6 overflow-hidden rounded-full ${alto[c.estado]}`}>
                {(c.estado === 'pendiente' || c.estado === 'programado') && <Rayado id={rayado} />}
              </span>
            )}
          </span>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1 text-center text-[13px] leading-tight" aria-hidden>
        {celdas.map((c) => (
          <span key={c.mes} className={`min-w-0 flex-1 ${c.mes === mesActual ? 'font-bold text-texto' : 'text-apagado'}`}>
            {c.inicial}
            {c.anio && <span className="block font-normal text-apagado">{c.anio}</span>}
          </span>
        ))}
      </div>
      <p className="sr-only">
        {nombre}: {(() => {
          const cobrados = celdas.filter((c) => c.estado === 'cobrado').length;
          return `${cobrados} ${cobrados === 1 ? 'mes cobrado' : 'meses cobrados'} de ${celdas.length}`;
        })()}
        {atrasados ? `, ${atrasados} con cobros atrasados` : ''}.
      </p>
    </div>
  );
}

/** La leyenda de las franjas de cobros, una vez para todas: las mismas muestras que dibujan */
export function LeyendaCobros({ rayado }: { rayado: string }) {
  return (
    <p aria-hidden className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-tenue">
      <span className="inline-flex items-center gap-1.5">
        <Muestra clase="bg-serie" />
        Cobrado
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Muestra rayado={rayado} />
        Por cobrar
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Muestra clase="bg-grave-icono" />
        Atrasado, la más alta
      </span>
    </p>
  );
}
