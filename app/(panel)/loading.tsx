/**
 * Lo que se ve mientras llega una página del panel.
 *
 * Sin esto, al pulsar un enlace la pantalla no cambiaba hasta que el servidor terminaba, y
 * el clic parecía muerto. Además, Next solo puede adelantar la carga de una página dinámica
 * hasta su pantalla de carga: sin ella, tampoco precargaba nada.
 *
 * Neutra a propósito: sirve igual para Hoy que para una nota o un formulario, y no promete
 * cuatro cifras donde va a llegar un texto. El pulso, solo si no se ha pedido menos movimiento
 */
export default function Cargando() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>

      <div className="mb-6">
        <div className="h-7 w-56 max-w-full rounded-lg bg-superficie-2 motion-safe:animate-pulse" />
        <div className="mt-2 h-4 w-40 max-w-full rounded bg-superficie-2 motion-safe:animate-pulse" />
      </div>

      <div className="h-72 rounded-xl border border-borde bg-superficie motion-safe:animate-pulse" />
    </div>
  );
}
