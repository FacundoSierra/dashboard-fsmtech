/**
 * Entrar con huella o cara (passkeys, el estándar WebAuthn): Touch ID en el Mac, Windows Hello
 * en el PC y Face ID en el móvil.
 *
 * De cada dispositivo registrado se guarda solo su parte pública, que no es un secreto: la llave
 * privada nunca sale del dispositivo. Como el panel no tiene base de datos, la lista vive en la
 * variable `PASSKEYS` de Vercel, y la contraseña se queda como respaldo.
 */

export interface Passkey {
  /** Identificador de la credencial, en base64url */
  id: string;
  /** Llave pública en base64url */
  llave: string;
  /** Nombre para reconocerlo: «MacBook», «PC de casa», «iPhone» */
  nombre: string;
  /** AAAA-MM-DD en que se registró */
  creado: string;
  transportes?: string[];
}

export const MAXIMO_NOMBRE = 40;

/** Lo que se pega en la variable `PASSKEYS` */
export function comoVariable(passkeys: Passkey[]): string {
  return JSON.stringify(passkeys);
}
