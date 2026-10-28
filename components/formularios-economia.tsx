'use client';

import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { apuntarCobroExtra, apuntarRenovacion } from '@/app/(panel)/economia/acciones';
import type { ResultadoEscritura } from '@/lib/boveda/escritura';
import { BOTON_PRINCIPAL, BOTON_TEXTO, CAMPO, ETIQUETA } from './estilos';

/**
 * Un botón que se abre en un formulario corto y se vuelve a cerrar al guardar. Los campos son
 * controlados: si algo falla, lo escrito sigue ahí para corregirlo.
 *
 * El botón desaparece al abrir, así que el foco va al primer campo; y al cerrar (Cancelar o
 * guardado), vuelve al botón, para no caer al principio de la página
 */
function Desplegable({
  titulo,
  guardar,
  listo,
  children,
}: {
  titulo: string;
  guardar: () => Promise<ResultadoEscritura>;
  /** Para vaciar los campos cuando se ha guardado */
  listo: () => void;
  children: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string>();
  const [guardando, empezar] = useTransition();
  const formulario = useRef<HTMLFormElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  // Solo después de que alguien lo haya abierto: al cargar la página, el foco no se mueve
  const tocado = useRef(false);

  useEffect(() => {
    if (!tocado.current) return;
    if (abierto) formulario.current?.querySelector<HTMLElement>('input, select, textarea')?.focus();
    else boton.current?.focus();
  }, [abierto]);

  function abrir(valor: boolean) {
    tocado.current = true;
    setAbierto(valor);
  }

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    setError(undefined);
    empezar(async () => {
      const resultado = await guardar();
      if (resultado.error) return setError(resultado.error);
      listo();
      abrir(false);
    });
  }

  if (!abierto) {
    return (
      <button
        ref={boton}
        type="button"
        onClick={() => abrir(true)}
        aria-expanded={false}
        className="-mx-2 -my-3 inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-xs text-tenue hover:text-acento"
      >
        <Plus className="size-3.5" aria-hidden />
        {titulo}
      </button>
    );
  }

  return (
    <form ref={formulario} onSubmit={enviar} aria-label={titulo} className="space-y-3 py-2">
      <p className="text-sm font-medium">{titulo}</p>
      {children}
      {error && (
        <p role="alert" className="text-xs text-critico-texto">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={guardando} className={BOTON_PRINCIPAL}>
          {guardando && <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden />}
          Apuntar
        </button>
        <button type="button" onClick={() => abrir(false)} className={BOTON_TEXTO}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Un cobro que no estaba en el plan, en la nota de cobros del cliente. Se apunta ya cobrado */
export function CobroExtra({ ruta, hoy }: { ruta: string; hoy: string }) {
  const [concepto, setConcepto] = useState('');
  const [importe, setImporte] = useState('');
  const [fecha, setFecha] = useState(hoy);

  return (
    <Desplegable
      titulo="Cobro extra"
      guardar={() => apuntarCobroExtra(ruta, concepto, importe, fecha)}
      listo={() => {
        setConcepto('');
        setImporte('');
        setFecha(hoy);
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_7rem_10rem]">
        <label>
          <span className={ETIQUETA}>Concepto</span>
          <input value={concepto} onChange={(e) => setConcepto(e.target.value)} required maxLength={120} placeholder="Landing de Navidad" className={CAMPO} />
        </label>
        <label>
          <span className={ETIQUETA}>Importe (€)</span>
          <input value={importe} onChange={(e) => setImporte(e.target.value)} required inputMode="decimal" placeholder="150" className={CAMPO} />
        </label>
        <label>
          <span className={ETIQUETA}>Cobrado el</span>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required max={hoy} className={CAMPO} />
        </label>
      </div>
    </Desplegable>
  );
}

/** Algo que caduca y no se averigua solo, en la sección «Renovaciones» de la ficha del cliente */
export function NuevaRenovacion({ clientes, hoy }: { clientes: { ruta: string; titulo: string }[]; hoy: string }) {
  const [ruta, setRuta] = useState(clientes[0]?.ruta ?? '');
  const [concepto, setConcepto] = useState('');
  const [fecha, setFecha] = useState(hoy);

  return (
    <Desplegable
      titulo="Apuntar una renovación"
      guardar={() => apuntarRenovacion(ruta, fecha, concepto)}
      listo={() => {
        setConcepto('');
        setFecha(hoy);
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr_10rem]">
        <label>
          <span className={ETIQUETA}>Cliente</span>
          <select value={ruta} onChange={(e) => setRuta(e.target.value)} className={CAMPO}>
            {clientes.map((cliente) => (
              <option key={cliente.ruta} value={cliente.ruta}>
                {cliente.titulo}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={ETIQUETA}>Qué se renueva</span>
          <input value={concepto} onChange={(e) => setConcepto(e.target.value)} required maxLength={120} placeholder="Certificado SSL de ejemplo.es" className={CAMPO} />
        </label>
        <label>
          <span className={ETIQUETA}>Fecha</span>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required className={CAMPO} />
        </label>
      </div>
    </Desplegable>
  );
}
