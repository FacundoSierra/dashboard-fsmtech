'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useOptimistic, useRef, useState, useTransition, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import { Check, ChevronDown, CornerUpLeft, Hourglass, Loader2, Plus, RotateCw } from 'lucide-react';
import { apuntarObjetivo, cambiarTarea, devolverAObjetivos, pasarAEspera } from '@/app/(panel)/acciones';
import { BOTON_PRINCIPAL, BOTON_TEXTO, CAMPO } from './estilos';
import { IconoEstado } from './ui';

/** «Pasar a la espera», «Ya ha contestado», «Recibido»: un botón en píldora con borde, con su icono y 44 px */
const BOTON_MOVER =
  'inline-flex min-h-11 items-center gap-2 rounded-full border border-borde-fuerte bg-superficie px-4 text-sm font-semibold text-texto transition-colors hover:border-acento hover:bg-acento-suave disabled:opacity-60';

/** La casilla: un círculo de 20 px con el borde a 3:1; hecha, rellena del azul de los datos */
function Casilla({ marcada }: { marcada: boolean }) {
  return (
    <span
      className={`flex size-5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors ${
        marcada ? 'border-serie bg-serie text-white' : 'border-borde-control group-hover:border-acento group-hover:bg-acento-suave'
      }`}
    >
      {marcada && <Check className="size-3" strokeWidth={3.5} aria-hidden />}
    </span>
  );
}

/**
 * Una tarea de la diaria que se marca, se pasa a «A la espera» o vuelve a «Objetivos» desde el
 * panel. La casilla cambia al instante y la nota se guarda por detrás; si no se puede (porque
 * esa línea ha cambiado en Obsidian), vuelve como estaba y lo dice.
 *
 * `linea` es la línea tal cual está en la nota, y es lo único que viaja a la escritura: el texto
 * que se ve (`children`) va limpio de emojis y etiquetas y no sirve para encontrarla.
 *
 * Las de primer nivel se ven plegadas, a dos líneas (a una si ya están hechas), porque en las
 * diarias cada objetivo es un párrafo. Se despliegan tocando el texto (no sus enlaces) o el
 * chevrón, y al desplegar sale el texto entero (`entera`, si es distinto del plegado) y el botón
 * de moverla, con su nombre escrito.
 *
 * Con `avatar` (en «A la espera», quién lo tiene), la fila es la de una persona, como la lista de
 * la referencia: el círculo con su inicial en lugar de la casilla, el nombre, lo que se espera a
 * una línea y, a la derecha, `insignia` (los días esperando). La casilla pasa al desplegar, como
 * un botón «Recibido» con su nombre escrito, junto a «Ya ha contestado».
 *
 * La casilla (un círculo de 20 px) y el chevrón se tocan en 48 × 48 px con padding y margen
 * negativo, sin agrandar la fila. Cada fila mide 44 px como mínimo (24 de contenido y 10 arriba y
 * abajo), así que entre una casilla y la siguiente siempre hay 44 px.
 */
export function TareaEditable({
  ruta,
  linea,
  hecha,
  nivel,
  mover,
  cabecera,
  entera,
  avatar,
  insignia,
  children,
}: {
  ruta: string;
  linea: string;
  hecha: boolean;
  nivel: number;
  /** A qué lista se puede mandar; solo en las de primer nivel */
  mover?: 'espera' | 'objetivos';
  /** Una línea encima del texto: en «A la espera», quién lo tiene */
  cabecera?: ReactNode;
  /** El texto entero, si al desplegar se enseña algo distinto de lo plegado */
  entera?: ReactNode;
  /** En lugar de la casilla, quién la tiene: la casilla pasa a los botones de al desplegar */
  avatar?: ReactNode;
  /** A la derecha de la fila, antes del chevrón: los días esperando */
  insignia?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const [marcada, marcarAlMomento] = useOptimistic(hecha);
  const [movida, moverAlMomento] = useOptimistic(false);
  const [guardando, empezar] = useTransition();
  const [error, setError] = useState<string>();
  const [preguntando, setPreguntando] = useState(false);
  const [quien, setQuien] = useState('');
  const [abierta, setAbierta] = useState(false);
  const [desborda, setDesborda] = useState(false);
  const texto = useRef<HTMLDivElement>(null);
  const idTexto = useId();

  const plegable = nivel === 0;
  const conAvatar = avatar !== undefined;
  const puedeMover = Boolean(mover) && !marcada;
  // Lo que va debajo del texto, alineado con él: la casilla (20 px) o el avatar (40) y 12 de hueco
  const sangria = conAvatar ? 'pl-[3.25rem]' : 'pl-8';

  // Si el texto plegado no cabe en sus líneas. El observador avisa al empezar y cada vez que
  // cambia el ancho (girar el móvil) o el número de líneas (al marcarla)
  useEffect(() => {
    const caja = texto.current;
    if (!plegable || abierta || !caja) return;
    const observador = new ResizeObserver(() => setDesborda(caja.scrollHeight > caja.clientHeight + 1));
    observador.observe(caja);
    return () => observador.disconnect();
  }, [plegable, abierta]);

  // Con avatar, la casilla está dentro: siempre se puede desplegar
  const puedeAbrir = plegable && (conAvatar || abierta || desborda || puedeMover || entera !== undefined);

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

  /** Tocar el texto lo despliega, salvo si se toca un enlace o se está seleccionando */
  function alPulsarTexto(evento: MouseEvent<HTMLDivElement>) {
    if (!puedeAbrir || (evento.target as Element).closest('a, button, [data-anidada]')) return;
    if (window.getSelection()?.toString()) return;
    setAbierta((antes) => !antes);
  }

  // Mientras se guarda ya no está en esta lista: aparece en la otra con la página nueva
  if (movida) return null;

  const recorte = plegable && !abierta ? (marcada || conAvatar ? 'line-clamp-1' : 'line-clamp-2') : '';
  const tachada = marcada ? 'text-apagado line-through decoration-apagado/60' : '';

  return (
    <li
      className={`text-[15px] leading-snug ${conAvatar ? 'py-2' : 'py-2.5'} ${guardando ? 'opacity-70' : ''}`}
      style={{ marginLeft: `${nivel * 1.25}rem` }}
    >
      <div className={`flex min-h-6 gap-3 ${conAvatar ? 'items-center' : 'items-start'}`}>
        {conAvatar ? (
          <span className={`shrink-0 transition-opacity ${marcada ? 'opacity-50' : ''}`}>{avatar}</span>
        ) : (
          <button
            type="button"
            role="checkbox"
            aria-checked={marcada}
            aria-describedby={idTexto}
            disabled={guardando}
            onClick={alternar}
            className="group -my-3.5 -ml-3.5 -mr-3.5 shrink-0 rounded-full p-3.5 outline-none focus-visible:ring-2 focus-visible:ring-acento disabled:cursor-wait"
          >
            {/* Hecha, en el azul de los datos: lo hecho es el avance del día, no un estado de salud */}
            <Casilla marcada={marcada} />
            <span className="sr-only">{marcada ? 'Hecha. Desmarcar' : 'Marcar como hecha'}</span>
          </button>
        )}

        <div onClick={alPulsarTexto} className={`min-w-0 flex-1 ${puedeAbrir ? 'cursor-pointer' : ''}`}>
          {cabecera && <div className="flex flex-wrap items-center gap-x-2 text-[15px]">{cabecera}</div>}
          <div
            id={idTexto}
            ref={texto}
            className={`break-words ${recorte} ${tachada} ${conAvatar ? 'mt-0.5 text-[13px] text-tenue' : ''}`}
          >
            {abierta && entera !== undefined ? entera : children}
          </div>
        </div>

        {insignia && <span className="shrink-0">{insignia}</span>}

        {plegable && (
          // Siempre ocupa su sitio: si apareciera al medir, el texto cambiaría de ancho y saltaría
          <button
            type="button"
            onClick={() => setAbierta((antes) => !antes)}
            disabled={!puedeAbrir}
            aria-expanded={puedeAbrir ? abierta : undefined}
            aria-controls={idTexto}
            aria-label={abierta ? 'Plegar la tarea' : 'Ver la tarea entera'}
            title={abierta ? 'Plegar' : 'Ver entera'}
            className={`-my-3.5 -mr-3.5 shrink-0 rounded-full p-3.5 text-apagado hover:bg-superficie-2 hover:text-texto ${puedeAbrir ? '' : 'invisible'}`}
          >
            <ChevronDown className={`size-4 motion-safe:transition-transform ${abierta ? 'rotate-180' : ''}`} aria-hidden />
          </button>
        )}
      </div>

      {abierta && !preguntando && (conAvatar || puedeMover) && (
        <div className={`mt-2 flex flex-wrap gap-2 ${sangria}`}>
          {conAvatar && (
            <button
              type="button"
              role="checkbox"
              aria-checked={marcada}
              disabled={guardando}
              onClick={alternar}
              className={`group ${BOTON_MOVER} disabled:cursor-wait`}
            >
              <Casilla marcada={marcada} />
              {marcada ? 'Recibido' : 'Marcar como recibido'}
            </button>
          )}
          {puedeMover &&
            (mover === 'espera' ? (
              <button type="button" disabled={guardando} onClick={() => setPreguntando(true)} className={BOTON_MOVER}>
                <Hourglass className="size-4" aria-hidden />
                Pasar a «A la espera»
              </button>
            ) : (
              <button type="button" disabled={guardando} onClick={() => mandar()} className={BOTON_MOVER}>
                <CornerUpLeft className="size-4" aria-hidden />
                Ya ha contestado: a objetivos
              </button>
            ))}
        </div>
      )}

      {preguntando && (
        <form onSubmit={mandar} className={`mt-2 flex flex-wrap items-center gap-2 ${sangria}`}>
          <input
            autoFocus
            value={quien}
            onChange={(evento) => setQuien(evento.target.value)}
            maxLength={60}
            placeholder="¿Quién lo tiene?"
            aria-label="Quién lo tiene"
            className={`${CAMPO} basis-full sm:flex-1 sm:basis-40`}
          />
          <button type="submit" disabled={guardando || !quien.trim()} className={BOTON_PRINCIPAL}>
            A la espera
          </button>
          <button type="button" onClick={() => setPreguntando(false)} className={BOTON_TEXTO}>
            Cancelar
          </button>
        </form>
      )}

      {error && (
        <div role="alert" className={`mt-1 flex flex-wrap items-center gap-x-3 text-[13px] text-critico-texto ${sangria}`}>
          <span>{error}</span>
          {/* En la app instalada no hay botón de recargar: este trae la nota como está ahora */}
          <button
            type="button"
            onClick={() => {
              setError(undefined);
              router.refresh();
            }}
            className="inline-flex min-h-11 items-center gap-1 font-medium text-acento hover:underline"
          >
            <RotateCw className="size-3.5" aria-hidden />
            Recargar
          </button>
        </div>
      )}
    </li>
  );
}

/** `[[nota|alias]]` → `alias`, `[[nota]]` → `nota`: para repetir lo escrito sin cargar aquí el Markdown */
function sinCorchetes(texto: string): string {
  return texto.replace(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (_, nombre: string, alias?: string) => alias ?? nombre);
}

/**
 * Apunta un objetivo en la diaria de hoy. `creaDiaria`: todavía no existe y se va a crear.
 *
 * Va encima de la lista, para tenerlo a mano en el móvil, pero el objetivo se escribe al final
 * de su sección: por eso, al guardarse, dice dónde ha ido a parar
 */
export function NuevoObjetivo({ creaDiaria }: { creaDiaria: boolean }) {
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string>();
  const [apuntado, setApuntado] = useState<string>();
  const [guardando, empezar] = useTransition();
  const [enCamino, ponerEnCamino] = useOptimistic<string | null>(null);

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    const objetivo = texto.trim();
    if (!objetivo) return;
    // Fuera de la transición, para que el campo se vacíe ya y no al terminar de guardar
    setTexto('');
    setError(undefined);
    setApuntado(undefined);
    empezar(async () => {
      ponerEnCamino(objetivo);
      const resultado = await apuntarObjetivo(objetivo);
      if (resultado.error) {
        setError(resultado.error);
        setTexto(objetivo);
      } else {
        setApuntado(objetivo);
      }
    });
  }

  return (
    <div>
      <form onSubmit={enviar} className="flex items-center gap-2">
        <input
          value={texto}
          onChange={(evento) => {
            setTexto(evento.target.value);
            setApuntado(undefined);
          }}
          id="nuevo-objetivo"
          maxLength={300}
          placeholder="Añadir un objetivo…"
          aria-label="Objetivo nuevo"
          enterKeyHint="done"
          className={`${CAMPO} flex-1`}
        />
        {/* En el móvil, solo el «+» redondo: el campo se queda con el ancho */}
        <button type="submit" disabled={guardando || !texto.trim()} className={`${BOTON_PRINCIPAL} max-sm:w-11 max-sm:px-0`}>
          <Plus className="size-4" aria-hidden />
          <span className="max-sm:sr-only">Añadir</span>
        </button>
      </form>

      <div aria-live="polite">
        {enCamino ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-tenue">
            <Loader2 className="size-3.5 shrink-0 motion-safe:animate-spin" aria-hidden />
            <span className="min-w-0 truncate">Apuntando «{enCamino}»</span>
          </p>
        ) : error ? (
          <p role="alert" className="mt-1.5 text-[13px] text-critico-texto">
            {error}
          </p>
        ) : apuntado ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-tenue">
            <IconoEstado nivel="bien" className="size-3.5" />
            <span className="min-w-0 truncate">Apuntado al final de la lista: «{sinCorchetes(apuntado)}»</span>
          </p>
        ) : creaDiaria ? (
          <p className="mt-1.5 text-[13px] text-apagado">Se crea la diaria de hoy con lo que quedó pendiente en la última, como la crea el PC.</p>
        ) : null}
      </div>
    </div>
  );
}
