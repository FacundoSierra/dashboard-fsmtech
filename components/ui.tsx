import type { ReactNode } from 'react';

export type Tono = 'neutro' | 'acento' | 'ok' | 'aviso';

const TONOS: Record<Tono, string> = {
  neutro: 'border-borde bg-fondo text-tenue',
  acento: 'border-transparent bg-acento-suave text-acento',
  ok: 'border-transparent bg-ok/15 text-ok',
  aviso: 'border-transparent bg-aviso/15 text-aviso',
};

export function tonoEstado(estado: string): Tono {
  if (estado === 'activo') return 'ok';
  if (estado === 'pausado') return 'aviso';
  return 'neutro';
}

export function Tarjeta({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-borde bg-superficie p-4 sm:p-5 ${className}`}>{children}</section>;
}

export function Encabezado({ titulo, subtitulo }: { titulo: string; subtitulo?: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{titulo}</h1>
      {subtitulo && <p className="mt-1 text-tenue first-letter:uppercase">{subtitulo}</p>}
    </header>
  );
}

export function TituloBloque({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-tenue">{children}</h2>
      {extra}
    </div>
  );
}

export function Chip({ children, tono = 'neutro' }: { children: ReactNode; tono?: Tono }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${TONOS[tono]}`}>
      {children}
    </span>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="text-sm text-tenue">{children}</p>;
}

export function Fila({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-2">
      <span className="text-tenue">{etiqueta}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">{children}</div>
    </div>
  );
}
