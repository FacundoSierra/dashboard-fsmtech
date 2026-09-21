import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, CircleMinus, OctagonAlert, XCircle } from 'lucide-react';

export type Icono = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

// ── Página ───────────────────────────────────────────────────────────────────

export function Encabezado({
  titulo,
  subtitulo,
  acciones,
}: {
  titulo: string;
  subtitulo?: ReactNode;
  acciones?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-sm text-tenue first-letter:uppercase">{subtitulo}</p>}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </header>
  );
}

export function Seccion({ titulo, extra, children }: { titulo: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-tenue">{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

// ── Tarjetas ─────────────────────────────────────────────────────────────────

export function Tarjeta({
  children,
  titulo,
  icono: IconoTitulo,
  accion,
  className = '',
  sinRelleno = false,
}: {
  children: ReactNode;
  titulo?: ReactNode;
  icono?: Icono;
  accion?: ReactNode;
  className?: string;
  /** Para tablas y listas que llegan hasta el borde */
  sinRelleno?: boolean;
}) {
  return (
    <section className={`imprimir-plano rounded-xl border border-borde bg-superficie shadow-tarjeta ${className}`}>
      {titulo && (
        <div className={`flex items-center justify-between gap-3 ${sinRelleno ? 'border-b border-borde px-4 py-3' : 'px-4 pt-4'}`}>
          <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
            {IconoTitulo && <IconoTitulo className="size-4 shrink-0 text-apagado" aria-hidden />}
            <span className="truncate">{titulo}</span>
          </h2>
          {accion && <div className="shrink-0 text-sm">{accion}</div>}
        </div>
      )}
      <div className={sinRelleno ? '' : titulo ? 'p-4 pt-3' : 'p-4'}>{children}</div>
    </section>
  );
}

export function EnlaceAccion({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-acento hover:underline">
      {children}
    </Link>
  );
}

// ── Cifras ───────────────────────────────────────────────────────────────────

/**
 * Indicador: etiqueta, valor y un detalle opcional. El valor va en cifras proporcionales
 * (las tabulares dejan los números grandes con huecos).
 */
export function Kpi({
  etiqueta,
  valor,
  detalle,
  icono: IconoKpi,
  href,
  estado,
  children,
}: {
  etiqueta: string;
  valor: ReactNode;
  detalle?: ReactNode;
  icono?: Icono;
  href?: string;
  /** Un indicador que tiene estado lo enseña con icono, no coloreando la cifra */
  estado?: NivelEstado;
  children?: ReactNode;
}) {
  const contenido = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-tenue">{etiqueta}</span>
        {estado ? <IconoEstado nivel={estado} /> : IconoKpi && <IconoKpi className="size-4 text-apagado" aria-hidden />}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{valor}</div>
      {detalle && <div className="mt-1 text-xs text-tenue">{detalle}</div>}
      {children && <div className="mt-3">{children}</div>}
    </>
  );

  const clase = 'imprimir-plano block rounded-xl border border-borde bg-superficie p-4 shadow-tarjeta';
  return href ? (
    <Link href={href} className={`${clase} transition-colors hover:border-borde-fuerte`}>
      {contenido}
    </Link>
  ) : (
    <div className={clase}>{contenido}</div>
  );
}

/** Barra de progreso: el resto de la pista es un paso más claro del mismo color */
export function Medidor({ valor, max = 100, etiqueta }: { valor: number; max?: number; etiqueta: string }) {
  const porcentaje = max > 0 ? Math.min(100, Math.max(0, (valor / max) * 100)) : 0;
  return (
    <div
      role="meter"
      aria-label={etiqueta}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={valor}
      className="h-1.5 overflow-hidden rounded-full bg-serie-suave"
    >
      <div className="h-full rounded-full bg-serie" style={{ width: `${porcentaje}%` }} />
    </div>
  );
}

// ── Estados ──────────────────────────────────────────────────────────────────

export type NivelEstado = 'bien' | 'aviso' | 'grave' | 'critico' | 'neutro' | 'sin-datos';

const ESTADOS: Record<NivelEstado, { icono: Icono; color: string }> = {
  bien: { icono: CheckCircle2, color: 'text-bien' },
  aviso: { icono: AlertTriangle, color: 'text-aviso' },
  grave: { icono: OctagonAlert, color: 'text-grave' },
  critico: { icono: XCircle, color: 'text-critico' },
  neutro: { icono: CircleMinus, color: 'text-apagado' },
  'sin-datos': { icono: CircleDashed, color: 'text-apagado' },
};

export function IconoEstado({ nivel, className = 'size-4' }: { nivel: NivelEstado; className?: string }) {
  const { icono: IconoNivel, color } = ESTADOS[nivel];
  return <IconoNivel className={`shrink-0 ${color} ${className}`} aria-hidden />;
}

/**
 * Un estado siempre lleva icono y texto. El color va en el icono; el texto, en tinta
 * normal: el verde y el rojo de estado no se distinguen con deuteranopía.
 */
export function Estado({ nivel, children }: { nivel: NivelEstado; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm">
      <IconoEstado nivel={nivel} />
      <span>{children}</span>
    </span>
  );
}

// ── Etiquetas ────────────────────────────────────────────────────────────────

export type Tono = 'neutro' | 'acento';

export function Chip({ children, tono = 'neutro' }: { children: ReactNode; tono?: Tono }) {
  const clase =
    tono === 'acento' ? 'border-transparent bg-acento-suave text-acento' : 'border-borde bg-superficie-2 text-tenue';
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-medium ${clase}`}>
      {children}
    </span>
  );
}

/** Estado de un proyecto de la bóveda (`activo`, `pausado`, `completado`) */
export function nivelEstadoProyecto(estado: string): NivelEstado {
  if (estado === 'activo') return 'bien';
  if (estado === 'pausado') return 'neutro';
  return 'sin-datos';
}

// ── Vacíos ───────────────────────────────────────────────────────────────────

export function Vacio({ children, icono: IconoVacio }: { children: ReactNode; icono?: Icono }) {
  return (
    <div className="flex items-center gap-2 text-sm text-tenue">
      {IconoVacio && <IconoVacio className="size-4 shrink-0 text-apagado" aria-hidden />}
      <span>{children}</span>
    </div>
  );
}

/** Aviso de algo que falta configurar: dice qué y dónde, sin romper la página */
export function Pendiente({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-borde-fuerte bg-superficie-2 p-4 text-sm">
      <p className="font-medium">{titulo}</p>
      <div className="mt-1 text-tenue">{children}</div>
    </div>
  );
}

// ── Tablas ───────────────────────────────────────────────────────────────────

export const TABLA = 'w-full text-sm';
export const TH = 'px-4 py-2 text-left text-xs font-medium text-apagado whitespace-nowrap';
export const TD = 'px-4 py-2.5 align-middle';
export const FILA = 'border-t border-borde';

export function Fila({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-2">
      <span className="text-tenue">{etiqueta}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">{children}</div>
    </div>
  );
}

// ── Formato ──────────────────────────────────────────────────────────────────

const EUROS = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const EUROS_EXACTOS = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });

/** Con `exactos`, céntimos solo si los hay: `58 €`, pero `9,25 €` */
export function euros(valor: number, exactos = false): string {
  return (exactos && !Number.isInteger(valor) ? EUROS_EXACTOS : EUROS).format(valor);
}

export function porcentaje(valor: number, decimales = 0): string {
  return `${valor.toLocaleString('es-ES', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })} %`;
}
