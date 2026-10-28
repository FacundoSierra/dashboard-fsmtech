'use client';

import { useId, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CAMPO, ETIQUETA } from './estilos';

/**
 * Un filtro de muchas opciones (los clientes de Documentos) como desplegable: como etiquetas,
 * ocupaban cinco filas del móvil antes de la lista. Al elegir, va a la misma página con el filtro
 * cambiado; cada opción trae su enlace hecho en el servidor
 */
export function FiltroDesplegable({
  etiqueta,
  opciones,
  actual,
}: {
  etiqueta: string;
  opciones: { valor: string; texto: string; href: string }[];
  actual: string;
}) {
  const router = useRouter();
  const id = useId();
  const [cambiando, empezar] = useTransition();

  return (
    <div className="min-w-0 sm:max-w-xs">
      <label htmlFor={id} className={ETIQUETA}>
        {etiqueta}
      </label>
      <select
        // Con `key`, vuelve a lo que diga la página cuando llega; sin `value`, no salta atrás mientras navega
        key={actual}
        id={id}
        defaultValue={actual}
        aria-busy={cambiando}
        onChange={(evento) => {
          const opcion = opciones.find((o) => o.valor === evento.target.value);
          if (opcion) empezar(() => router.push(opcion.href, { scroll: false }));
        }}
        className={CAMPO}
      >
        {opciones.map((opcion) => (
          <option key={opcion.valor} value={opcion.valor}>
            {opcion.texto}
          </option>
        ))}
      </select>
    </div>
  );
}
