import { ImageResponse } from 'next/og';
import { IconoApp } from '@/components/icono-app';

export const size = { width: 48, height: 48 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(<IconoApp tamano={size.width} />, size);
}
