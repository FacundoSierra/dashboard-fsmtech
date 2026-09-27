'use client';

import { useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { apuntarCobroExtra, apuntarRenovacion } from '@/app/(panel)/economia/acciones';
import type { ResultadoEscritura } from '@/lib/boveda/escritura';

const CAMPO =
  'w-full min-w-0 rounded-lg border border-borde bg-fondo px-3 py-1.5 text-sm outline-none focus:border-acento focus:ring-2 focus:ring-acento/30';
const ETIQUETA = 'mb-1 block text-xs font-medium text-tenue';

/**
 * Un botón que se abre en un formulario corto y se vuelve a cerrar al guardar. Los campos son
 * controlados: si algo falla, lo escrito sigue ahí para corregirlo.
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

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    setError(undefined);
    empezar(async () => {
      const resultado = await guardar();
      if (resultado.error) return setError(resultado.error);
      listo();
      setAbierto(false);
    });
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs text-tenue hover:text-acento"
      >
        <Plus className="size-3.5" aria-hidden />
        {titulo}
      </button>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-3">
      <p className="text-sm font-medium">{titulo}</p>
      {children}
      {error && (
        <p role="alert" className="text-xs text-critico-texto">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={guardando}
          className="inline-flex items-center gap-1.5 rounded-lg bg-acento-fuerte px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {guardando && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          Apuntar
        </button>
        <button type="button" onClick={() => setAbierto(false)} className="text-sm text-tenue hover:text-texto">
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
      <div className="grid gap-3 sm:grid-cols-[1fr_7rem_10rem]">
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
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr_10rem]">
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
