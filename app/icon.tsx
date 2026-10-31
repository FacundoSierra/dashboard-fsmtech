import { ImageResponse } from 'next/og';
import { IconoApp } from '@/components/icono-app';

export const size = { width: 48, height: 48 };
export const contentType = 'image/png';

/** En la pestaña del navegador, la marca del menú tal cual: el círculo sobre transparente */
export default function Icon() {
  return new ImageResponse(<IconoApp tamano={size.width} forma="circulo" />, size);
}
