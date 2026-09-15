/** Icono de la app para `ImageResponse`: solo estilos en línea y flexbox */
export function IconoApp({ tamano }: { tamano: number }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#2563eb',
        color: '#ffffff',
        fontSize: Math.round(tamano * 0.4),
        fontWeight: 700,
        letterSpacing: `-${Math.max(1, Math.round(tamano * 0.02))}px`,
      }}
    >
      FS
    </div>
  );
}
