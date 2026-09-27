import 'server-only';

/**
 * Qué es de verdad un archivo subido, mirando sus primeros bytes y no solo el nombre. Un HTML o
 * un SVG renombrados a `.pdf` y servidos desde el dominio del panel podrían ejecutar código con
 * la sesión abierta: por eso solo se aceptan estos tipos, y solo si el contenido cuadra.
 */

export interface TipoArchivo {
  extension: string;
  contentType: string;
  /** PDF e imágenes se abren en el navegador; el resto se descarga */
  enLinea: boolean;
}

type Firma = (bytes: Uint8Array) => boolean;

const empiezaPor =
  (...firma: number[]): Firma =>
  (bytes) =>
    firma.every((byte, i) => bytes[i] === byte);

const esPdf = empiezaPor(0x25, 0x50, 0x44, 0x46); // %PDF
const esPng = empiezaPor(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const esJpeg = empiezaPor(0xff, 0xd8, 0xff);
const esWebp: Firma = (bytes) =>
  empiezaPor(0x52, 0x49, 0x46, 0x46)(bytes) && [0x57, 0x45, 0x42, 0x50].every((byte, i) => bytes[8 + i] === byte);
const esZip = empiezaPor(0x50, 0x4b, 0x03, 0x04); // docx y xlsx también son zip
const esOfficeAntiguo = empiezaPor(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
/** Texto plano: sin bytes nulos ni nada que un navegador pueda tomar por HTML */
const esTexto: Firma = (bytes) => !bytes.includes(0) && !/^\s*</.test(new TextDecoder().decode(bytes.slice(0, 64)));

const TIPOS: Record<string, { contentType: string; enLinea: boolean; firma: Firma }> = {
  pdf: { contentType: 'application/pdf', enLinea: true, firma: esPdf },
  png: { contentType: 'image/png', enLinea: true, firma: esPng },
  jpg: { contentType: 'image/jpeg', enLinea: true, firma: esJpeg },
  jpeg: { contentType: 'image/jpeg', enLinea: true, firma: esJpeg },
  webp: { contentType: 'image/webp', enLinea: true, firma: esWebp },
  docx: {
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    enLinea: false,
    firma: esZip,
  },
  xlsx: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', enLinea: false, firma: esZip },
  doc: { contentType: 'application/msword', enLinea: false, firma: esOfficeAntiguo },
  xls: { contentType: 'application/vnd.ms-excel', enLinea: false, firma: esOfficeAntiguo },
  txt: { contentType: 'text/plain; charset=utf-8', enLinea: false, firma: esTexto },
  csv: { contentType: 'text/csv; charset=utf-8', enLinea: false, firma: esTexto },
  zip: { contentType: 'application/zip', enLinea: false, firma: esZip },
};

export function extensionDe(nombre: string): string {
  return nombre.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
}

/** El tipo del archivo si su nombre y su contenido cuadran; `null` si no se acepta */
export function tipoDeArchivo(nombre: string, primerosBytes: Uint8Array): TipoArchivo | null {
  const extension = extensionDe(nombre);
  const tipo = Object.hasOwn(TIPOS, extension) ? TIPOS[extension] : undefined;
  if (!tipo || !tipo.firma(primerosBytes)) return null;
  return { extension: extension === 'jpeg' ? 'jpg' : extension, contentType: tipo.contentType, enLinea: tipo.enLinea };
}

/** El tipo con el que se sirve un archivo ya guardado, por su extensión */
export function tipoParaServir(pathname: string): Omit<TipoArchivo, 'extension'> {
  const extension = extensionDe(pathname);
  const tipo = Object.hasOwn(TIPOS, extension) ? TIPOS[extension] : undefined;
  // Lo desconocido, como descarga opaca: nunca se interpreta en el navegador
  return tipo ? { contentType: tipo.contentType, enLinea: tipo.enLinea } : { contentType: 'application/octet-stream', enLinea: false };
}
