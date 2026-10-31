import { ImageResponse } from 'next/og';
import { IconoApp } from '@/components/icono-app';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** En iOS, el azul hasta los bordes: el sistema le pone sus esquinas y rellena de negro lo transparente */
export default function AppleIcon() {
  return new ImageResponse(<IconoApp tamano={size.width} forma="lleno" />, size);
}
