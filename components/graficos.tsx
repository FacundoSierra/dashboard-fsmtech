import type { Cobro } from '@/lib/economia';
import type { Dia } from '@/lib/vigilancia/disponibilidad';
import { duracion } from '@/lib/vigilancia/disponibilidad';

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
 * finas, extremo redondeado y recto en la base, y el valor rotulado en la punta.
 */
export function BarrasHorizontales({ barras, titulo }: { barras: Barra[]; titulo: string }) {
  const maximo = Math.max(...barras.map((b) => b.valor), 0) || 1;

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
                <span className="block h-3 rounded-r-[4px] bg-serie" style={{ width: `max(${ancho * 0.8}%, 3px)` }} />
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
 * Un día por celda, como en las páginas de estado. Verde y rojo no se distinguen con
 * deuteranopía (ΔE 4,1), así que el color no va solo: los días con incidencia son además
 * más altos, y el resumen de al lado lo dice con palabras.
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
              className={`min-w-0 flex-1 rounded-[2px] ${
                dia.estado === 'incidencia' ? 'h-7 bg-critico' : dia.estado === 'bien' ? 'h-4 bg-bien' : 'h-4 bg-sin-datos'
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

// ── Franja de cobros del año ─────────────────────────────────────────────────


const INICIAL_MES = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MES_LARGO = new Intl.DateTimeFormat('es-ES', { month: 'long', timeZone: 'UTC' });

type EstadoMes = 'cobrado' | 'atrasado' | 'pendiente' | 'programado' | 'nada';

function estadoDelMes(cobros: Cobro[]): EstadoMes {
  if (cobros.length === 0) return 'nada';
  if (cobros.some((c) => c.estado === 'atrasado')) return 'atrasado';
  if (cobros.some((c) => c.estado === 'pendiente')) return 'pendiente';
  if (cobros.every((c) => c.estado === 'cobrado')) return 'cobrado';
  return 'programado';
}

/**
 * Los doce meses del año de un cliente. Como en la de disponibilidad, el estado no va
 * solo por color: lo atrasado es la celda más alta, lo pendiente de este mes la mediana, y
 * lo cobrado y lo programado las bajas (programado sin relleno de color).
 */
export function FranjaCobros({ anio, cobros, nombre }: { anio: number; cobros: Cobro[]; nombre: string }) {
  const meses = Array.from({ length: 12 }, (_, i) => {
    const mes = `${anio}-${String(i + 1).padStart(2, '0')}`;
    const delMes = cobros.filter((c) => c.mes === mes);
    const total = delMes.reduce((t, c) => t + c.importe, 0);
    return { mes, i, estado: estadoDelMes(delMes), total };
  });
  const atrasados = meses.filter((m) => m.estado === 'atrasado').length;

  const estilo: Record<EstadoMes, string> = {
    atrasado: 'h-7 bg-critico',
    pendiente: 'h-5 bg-aviso',
    cobrado: 'h-3.5 bg-bien',
    programado: 'h-3.5 bg-sin-datos',
    nada: 'h-3.5 border border-dashed border-borde-fuerte',
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
      <div className="flex h-7 items-end gap-[3px]" aria-hidden>
        {meses.map((m) => (
          <span
            key={m.mes}
            title={`${MES_LARGO.format(new Date(Date.UTC(anio, m.i, 1)))}: ${texto[m.estado]}${m.total ? ` (${m.total.toLocaleString('es-ES')} €)` : ''}`}
            className={`min-w-0 flex-1 rounded-[2px] ${estilo[m.estado]}`}
          />
        ))}
      </div>
      <div className="mt-1 flex gap-[3px] text-center text-[10px] text-apagado" aria-hidden>
        {INICIAL_MES.map((inicial, i) => (
          <span key={i} className="flex-1">
            {inicial}
          </span>
        ))}
      </div>
      <p className="sr-only">
        {nombre}, cobros de {anio}: {meses.filter((m) => m.estado === 'cobrado').length} meses cobrados
        {atrasados ? `, ${atrasados} con cobros atrasados` : ''}.
      </p>
    </div>
  );
}
