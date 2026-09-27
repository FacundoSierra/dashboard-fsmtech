'use client';

import { useOptimistic, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { CornerUpLeft, Hourglass, Loader2, Plus } from 'lucide-react';
import { apuntarObjetivo, cambiarTarea, devolverAObjetivos, pasarAEspera } from '@/app/(panel)/acciones';

const CAMPO =
  'w-full min-w-0 rounded-lg border border-borde bg-fondo px-3 py-1.5 text-sm outline-none focus:border-acento focus:ring-2 focus:ring-acento/30';

/**
 * Una tarea de la diaria que se marca, se pasa a «A la espera» o vuelve a «Objetivos» desde el
 * panel. La casilla cambia al instante y la nota se guarda por detrás; si no se puede (porque
 * esa línea ha cambiado en Obsidian), vuelve como estaba y lo dice.
 */
export function TareaEditable({
  ruta,
  linea,
  hecha,
  nivel,
  mover,
  children,
}: {
  ruta: string;
  linea: string;
  hecha: boolean;
  nivel: number;
  /** A qué lista se puede mandar; solo en las de primer nivel */
  mover?: 'espera' | 'objetivos';
  children: ReactNode;
}) {
  const [marcada, marcarAlMomento] = useOptimistic(hecha);
  const [movida, moverAlMomento] = useOptimistic(false);
  const [guardando, empezar] = useTransition();
  const [error, setError] = useState<string>();
  const [preguntando, setPreguntando] = useState(false);
  const [quien, setQuien] = useState('');

  function alternar() {
    setError(undefined);
    empezar(async () => {
      marcarAlMomento(!marcada);
      const resultado = await cambiarTarea(ruta, linea, !marcada);
      if (resultado.error) setError(resultado.error);
    });
  }

  function mandar(evento?: FormEvent) {
    evento?.preventDefault();
    setError(undefined);
    empezar(async () => {
      moverAlMomento(true);
      const resultado = mover === 'espera' ? await pasarAEspera(ruta, linea, quien) : await devolverAObjetivos(ruta, linea);
      if (resultado.error) setError(resultado.error);
      else setPreguntando(false);
    });
  }

  // Mientras se guarda ya no está en esta lista: aparece en la otra con la página nueva
  if (movida) return null;

  const textoMover = mover === 'espera' ? 'Pasar a «A la espera»' : 'Ya ha contestado: devolver a objetivos';

  return (
    <li className={`text-[15px] leading-snug ${guardando ? 'opacity-70' : ''}`} style={{ marginLeft: `${nivel * 1.25}rem` }}>
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          role="checkbox"
          aria-checked={marcada}
          disabled={guardando}
          onClick={alternar}
          className="group -m-1.5 shrink-0 rounded-md p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-acento/40 disabled:cursor-wait"
        >
          <span
            className={`mt-0.5 flex size-4 items-center justify-center rounded border text-[10px] ${
              marcada ? 'border-bien bg-bien text-white' : 'border-borde-fuerte group-hover:border-acento'
            }`}
          >
            {marcada ? '✓' : null}
          </span>
          <span className="sr-only">{marcada ? 'Hecha. Desmarcar' : 'Marcar como hecha'}</span>
        </button>
        <span className={`min-w-0 flex-1 break-words ${marcada ? 'text-tenue line-through' : ''}`}>{children}</span>
        {mover && !marcada && (
          <button
            type="button"
            disabled={guardando}
            onClick={() => (mover === 'espera' ? setPreguntando((antes) => !antes) : mandar())}
            title={textoMover}
            className="-my-1 shrink-0 rounded-md p-1.5 text-apagado hover:bg-superficie-2 hover:text-texto disabled:opacity-60"
          >
            {mover === 'espera' ? <Hourglass className="size-4" aria-hidden /> : <CornerUpLeft className="size-4" aria-hidden />}
            <span className="sr-only">{textoMover}</span>
          </button>
        )}
      </div>

      {preguntando && (
        <form onSubmit={mandar} className="mt-2 flex flex-wrap items-center gap-2 pl-[1.625rem]">
          <input
            autoFocus
            value={quien}
            onChange={(evento) => setQuien(evento.target.value)}
            maxLength={60}
            placeholder="¿Quién lo tiene?"
            aria-label="Quién lo tiene"
            className={`${CAMPO} flex-1 basis-40`}
          />
          <button
            type="submit"
            disabled={guardando || !quien.trim()}
            className="rounded-lg bg-acento-fuerte px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            A la espera
          </button>
          <button type="button" onClick={() => setPreguntando(false)} className="px-1 text-sm text-tenue hover:text-texto">
            Cancelar
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-1 pl-[1.625rem] text-xs text-critico-texto">
          {error}
        </p>
      )}
    </li>
  );
}

/** Apunta un objetivo en la diaria de hoy. `creaDiaria`: todavía no existe y se va a crear */
export function NuevoObjetivo({ creaDiaria }: { creaDiaria: boolean }) {
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string>();
  const [guardando, empezar] = useTransition();
  const [enCamino, ponerEnCamino] = useOptimistic<string | null>(null);

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    const objetivo = texto.trim();
    if (!objetivo) return;
    // Fuera de la transición, para que el campo se vacíe ya y no al terminar de guardar
    setTexto('');
    setError(undefined);
    empezar(async () => {
      ponerEnCamino(objetivo);
      const resultado = await apuntarObjetivo(objetivo);
      if (resultado.error) {
        setError(resultado.error);
        setTexto(objetivo);
      }
    });
  }

  return (
    <div>
      {enCamino && (
        <p className="mb-2 flex items-start gap-2.5 text-[15px] leading-snug text-tenue">
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden />
          <span className="min-w-0 break-words">{enCamino}</span>
        </p>
      )}
      <form onSubmit={enviar} className="flex items-center gap-2">
        <input
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          maxLength={300}
          placeholder="Añadir un objetivo…"
          aria-label="Objetivo nuevo"
          className={`${CAMPO} flex-1`}
        />
        <button
          type="submit"
          disabled={guardando || !texto.trim()}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-acento-fuerte px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          <Plus className="size-4" aria-hidden />
          Añadir
        </button>
      </form>
      {creaDiaria && !error && (
        <p className="mt-1.5 text-xs text-apagado">
          Se crea la diaria de hoy con lo que quedó pendiente en la última, como la crea el PC.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-critico-texto">
          {error}
        </p>
      )}
    </div>
  );
}
