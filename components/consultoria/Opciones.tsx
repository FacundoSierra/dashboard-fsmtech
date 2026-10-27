'use client';

/** Botones de opción: dos o tres, del mismo ancho, con la elegida como los filtros del panel */
export default function Opciones<T extends string>({
  nombre,
  valor,
  alCambiar,
  opciones,
}: {
  nombre: string;
  valor: T;
  alCambiar: (valor: T) => void;
  opciones: { valor: T; etiqueta: string }[];
}) {
  return (
    <div className="mt-1 grid grid-cols-2 gap-2">
      {opciones.map((opcion) => (
        <label
          key={opcion.valor}
          className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-3 text-center text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-acento ${
            valor === opcion.valor ? 'border-acento bg-acento-suave font-medium text-acento' : 'border-borde text-tenue hover:border-borde-fuerte hover:text-texto'
          }`}
        >
          <input type="radio" name={nombre} value={opcion.valor} checked={valor === opcion.valor} onChange={() => alCambiar(opcion.valor)} className="sr-only" />
          {opcion.etiqueta}
        </label>
      ))}
    </div>
  );
}
