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

      {/* El título de 36 px y su subtítulo, en el gris de la isla; debajo, una tarjeta blanca sin borde */}
      <div className="mb-6 sm:mb-7">
        <div className="h-8 w-56 max-w-full rounded-full bg-borde-fuerte motion-safe:animate-pulse sm:h-10" />
        <div className="mt-2.5 h-4 w-40 max-w-full rounded-full bg-borde-fuerte motion-safe:animate-pulse" />
      </div>

      <div className="h-72 rounded-xl bg-superficie motion-safe:animate-pulse" />
    </div>
  );
}
