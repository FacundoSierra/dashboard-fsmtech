'use client';

import { useActionState } from 'react';
import type { Opcion } from '@/lib/boveda/inbox';
import { guardarCaptura } from './acciones';
import type { EstadoCaptura } from './estado';

const TIPOS = [
  { valor: 'idea', texto: 'Idea' },
  { valor: 'tarea', texto: 'Tarea' },
  { valor: 'nota', texto: 'Nota' },
];

const CAMPO =
  'w-full rounded-lg border border-borde bg-fondo px-3 py-2 outline-none focus:border-acento focus:ring-2 focus:ring-acento/30';

export function FormularioCaptura({
  textoInicial,
  proyectos,
  clientes,
}: {
  textoInicial: string;
  proyectos: Opcion[];
  clientes: Opcion[];
}) {
  const [estado, accion, guardando] = useActionState<EstadoCaptura, FormData>(guardarCaptura, {});
  const tipoMarcado = estado.tipo || 'idea';

  return (
    <form action={accion} className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Tipo</legend>
        <div className="inline-flex rounded-xl border border-borde bg-fondo p-1">
          {TIPOS.map(({ valor, texto }) => (
            <label
              key={valor}
              className="cursor-pointer rounded-lg px-4 py-1.5 text-sm font-medium text-tenue has-[:checked]:bg-superficie has-[:checked]:text-texto has-[:checked]:shadow-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-acento/40"
            >
              <input type="radio" name="tipo" value={valor} defaultChecked={valor === tipoMarcado} className="sr-only" />
              {texto}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Qué quieres apuntar</span>
        <textarea
          name="texto"
          required
          rows={6}
          maxLength={5000}
          autoFocus
          defaultValue={estado.texto ?? textoInicial}
          placeholder="La primera línea será el título"
          className={CAMPO}
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">
          Relacionar con <span className="font-normal text-tenue">(opcional)</span>
        </span>
        <select name="relacionada" defaultValue={estado.relacionada ?? ''} className={CAMPO}>
          <option value="">Nada</option>
          {proyectos.length > 0 && (
            <optgroup label="Proyectos">
              {proyectos.map((opcion) => (
                <option key={opcion.nombre} value={opcion.nombre}>
                  {opcion.titulo}
                </option>
              ))}
            </optgroup>
          )}
          {clientes.length > 0 && (
            <optgroup label="Clientes">
              {clientes.map((opcion) => (
                <option key={opcion.nombre} value={opcion.nombre}>
                  {opcion.titulo}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>

      {estado.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {estado.error}
        </p>
      )}

      <button
        type="submit"
        disabled={guardando}
        className="w-full rounded-lg bg-acento px-4 py-2.5 font-medium text-white disabled:opacity-60 sm:w-auto"
      >
        {guardando ? 'Guardando…' : 'Guardar en el inbox'}
      </button>
    </form>
  );
}
