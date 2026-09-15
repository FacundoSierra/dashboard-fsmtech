import { ImageResponse } from 'next/og';
import { IconoApp } from '@/components/icono-app';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(<IconoApp tamano={size.width} />, size);
}
