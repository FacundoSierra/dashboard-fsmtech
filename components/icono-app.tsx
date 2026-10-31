/**
 * Icono de la app para `ImageResponse`: solo estilos en línea y flexbox. Es la marca del menú
 * (`Marca` de `components/navegacion.tsx`): las iniciales en blanco y en negrita sobre el azul
 * oscuro de la marca (`--acento-fuerte`), un tercio del ancho, como allí.
 *
 * - `circulo`: el círculo sobre fondo transparente, igual que en el menú. Para la pestaña del
 *   navegador y para el icono `any` del manifest (el escritorio de Windows lo pinta tal cual)
 * - `lleno`: el azul hasta los bordes, para lo que el sistema recorta a su forma: el de iOS (que
 *   rellena de negro lo transparente) y el `maskable` de Android, que lo recorta en círculo y deja
 *   la misma marca. Las iniciales caben en la zona segura (el círculo del 80 % del centro)
 *
 * `ImageResponse` solo trae la Geist normal (no la Plus Jakarta del panel ni su negrita): las
 * iniciales salían finas al lado de las del menú. Un trazo blanco alrededor de cada letra les da el
 * grueso de la negrita sin cargar otra fuente
 */
export function IconoApp({ tamano, forma = 'lleno' }: { tamano: number; forma?: 'circulo' | 'lleno' }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: forma === 'lleno' ? '#164480' : 'transparent',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: forma === 'circulo' ? '50%' : 0,
          background: '#164480',
          color: '#ffffff',
          fontSize: Math.round(tamano * 0.34),
          fontWeight: 700,
          WebkitTextStroke: `${Math.max(1, Math.round(tamano * 0.016))}px #ffffff`,
          letterSpacing: `${Math.max(1, Math.round(tamano * 0.01))}px`,
        }}
      >
        FS
      </div>
    </div>
  );
}
