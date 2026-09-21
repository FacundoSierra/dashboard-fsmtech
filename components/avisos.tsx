import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { NIVEL_ESTADO, type Aviso } from '@/lib/avisos';
import { IconoEstado } from './ui';

const ETIQUETA: Record<Aviso['nivel'], string> = {
  critico: 'Crítico',
  grave: 'Importante',
  aviso: 'Aviso',
  info: 'Info',
};

export function ListaAvisos({ avisos, limite }: { avisos: Aviso[]; limite?: number }) {
  const visibles = limite ? avisos.slice(0, limite) : avisos;

  return (
    <ul className="divide-y divide-borde">
      {visibles.map((aviso) => {
        const externo = aviso.href?.startsWith('http');
        const contenido = (
          <>
            <IconoEstado nivel={NIVEL_ESTADO[aviso.nivel]} className="mt-0.5 size-4" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug">
                <span className="sr-only">{ETIQUETA[aviso.nivel]}: </span>
                {aviso.titulo}
              </p>
              {aviso.detalle && <p className="mt-0.5 text-xs leading-relaxed text-tenue">{aviso.detalle}</p>}
            </div>
            {externo && <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-apagado" aria-hidden />}
          </>
        );
        const clase = 'flex items-start gap-3 px-4 py-3';
        return (
          <li key={aviso.id}>
            {aviso.href ? (
              externo ? (
                <a href={aviso.href} target="_blank" rel="noreferrer" className={`${clase} hover:bg-superficie-2`}>
                  {contenido}
                </a>
              ) : (
                <Link href={aviso.href} className={`${clase} hover:bg-superficie-2`}>
                  {contenido}
                </Link>
              )
            ) : (
              <div className={clase}>{contenido}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
