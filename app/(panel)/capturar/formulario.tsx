'use client';

import { useActionState } from 'react';
import { BOTON_PRINCIPAL, CAMPO, ETIQUETA } from '@/components/estilos';
import type { Opcion } from '@/lib/boveda/inbox';
import { guardarCaptura } from './acciones';
import type { EstadoCaptura } from './estado';

const TIPOS = [
  { valor: 'idea', texto: 'Idea' },
  { valor: 'tarea', texto: 'Tarea' },
  { valor: 'nota', texto: 'Nota' },
];

export function FormularioCaptura({
  textoInicial,
  tipoInicial,
  proyectos,
  clientes,
}: {
  textoInicial: string;
  /** `idea`, `tarea` o `nota`, desde la barra de órdenes; otro valor no cuenta y se queda en idea */
  tipoInicial?: string;
  proyectos: Opcion[];
  clientes: Opcion[];
}) {
  const [estado, accion, guardando] = useActionState<EstadoCaptura, FormData>(guardarCaptura, {});
  const tipoMarcado = estado.tipo || TIPOS.find((t) => t.valor === tipoInicial)?.valor || 'idea';

  return (
    <form action={accion} className="space-y-5">
      <fieldset>
        <legend className={ETIQUETA}>Tipo</legend>
        {/* Las pestañas en píldora del panel, sobre el gris de dentro de la tarjeta: la elegida, rellena del azul */}
        <div className="inline-flex max-w-full gap-1 rounded-full bg-superficie-2 p-1">
          {TIPOS.map(({ valor, texto }) => (
            <label
              key={valor}
              className="inline-flex min-h-11 cursor-pointer items-center rounded-full px-5 text-sm font-medium text-tenue transition-colors hover:text-texto has-[:checked]:bg-acento-fuerte has-[:checked]:font-semibold has-[:checked]:text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-acento"
            >
              <input type="radio" name="tipo" value={valor} defaultChecked={valor === tipoMarcado} className="sr-only" />
              {texto}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className={ETIQUETA}>Qué quieres apuntar</span>
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
        <span className={ETIQUETA}>
          Relacionar con <span className="font-normal text-apagado">· opcional</span>
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
        <p role="alert" className="text-sm text-critico-texto">
          {estado.error}
        </p>
      )}

      <button
        type="submit"
        disabled={guardando}
        className={`${BOTON_PRINCIPAL} w-full sm:w-auto`}
      >
        {guardando ? 'Guardando…' : 'Guardar en el inbox'}
      </button>
    </form>
  );
}
