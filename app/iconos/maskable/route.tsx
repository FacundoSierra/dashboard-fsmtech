import { ImageResponse } from 'next/og';
import { IconoApp } from '@/components/icono-app';

/**
 * El icono `maskable` del manifest (512 px): el azul de la marca hasta los bordes, para que Android
 * lo recorte a la forma de cada móvil (en círculo queda la misma marca que el menú). Público, como
 * el manifest
 */
// Siempre el mismo dibujo: se genera al compilar, como los de 192 y 512, y no en cada petición
export const dynamic = 'force-static';

export function GET() {
  return new ImageResponse(<IconoApp tamano={512} forma="lleno" />, { width: 512, height: 512 });
}
