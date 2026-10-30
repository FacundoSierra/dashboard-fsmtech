/**
 * Una tarea de «⏳ A la espera» partida en lo que se espera, quién lo tiene y desde cuándo, con el
 * formato de la plantilla de la diaria: `qué — **quién** — desde AAAA-MM-DD`. Lo que va entre
 * quién y la fecha («, que lo ve con Facundo en persona»), y lo que sigue a la fecha, se queda en
 * el texto entero, que es el que se enseña al desplegar.
 *
 * Solo sirve para pintar: lo que se escribe en la nota se busca siempre por `Tarea.linea`. Una
 * línea escrita a mano sin ese formato vuelve entera como `que`, sin `quien`.
 *
 * Sin importaciones: la cargan Next y las pruebas de Node.
 */
export interface PartesEspera {
  que: string;
  /** Tal cual está en la nota: puede ser un `[[enlace|alias]]` */
  quien?: string;
  /** `AAAA-MM-DD` */
  desde?: string;
}

// Quién es la negrita que va justo antes de «— desde», sin otra raya entre las dos (puede llevar
// detrás «, que lo ve en persona»); lo de antes, aunque lleve sus propias rayas, es lo que se espera
const RE_ESPERA = /^(.+)\s+[—–]\s+\*\*([^*]+)\*\*[^—–]*\s[—–]\s+desde\s+(\d{4}-\d{2}-\d{2})/;
const RE_DESDE = /\bdesde\s+(\d{4}-\d{2}-\d{2})/;

export function partesEspera(texto: string): PartesEspera {
  const partes = texto.match(RE_ESPERA);
  if (partes) return { que: partes[1].trim(), quien: partes[2].trim(), desde: partes[3] };
  return { que: texto, desde: texto.match(RE_DESDE)?.[1] };
}
