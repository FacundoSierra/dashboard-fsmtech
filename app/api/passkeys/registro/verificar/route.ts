import { NextResponse, type NextRequest } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { datosRP, leerPasskeys } from '@/lib/passkeys/config';
import { borrarReto, leerReto } from '@/lib/passkeys/reto';
import { comoVariable, MAXIMO_NOMBRE, type Passkey } from '@/lib/passkeys/tipos';
import { hoyMadrid } from '@/lib/fechas';
import { verificarSesion } from '@/lib/sesion';

/**
 * Paso 2 de registrar un dispositivo: comprueba lo que devuelve el navegador y responde con el
 * valor entero para la variable `PASSKEYS`, listo para pegar en Vercel.
 */
export async function POST(request: NextRequest) {
  await verificarSesion();

  const reto = await leerReto();
  if (!reto) return NextResponse.json({ error: 'El registro ha caducado. Vuelve a empezar.' }, { status: 400 });

  let cuerpo: { respuesta?: unknown; nombre?: unknown };
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: 'Petición mal formada.' }, { status: 400 });
  }

  const nombre = (typeof cuerpo.nombre === 'string' ? cuerpo.nombre : '').trim().slice(0, MAXIMO_NOMBRE) || 'Dispositivo';
  const { rpID, origen } = await datosRP();

  let verificacion;
  try {
    verificacion = await verifyRegistrationResponse({
      // El tipo exacto lo comprueba la propia librería
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      response: cuerpo.respuesta as any,
      expectedChallenge: reto,
      expectedOrigin: origen,
      expectedRPID: rpID,
    });
  } catch (error) {
    await borrarReto();
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo registrar.' }, { status: 400 });
  }

  await borrarReto();
  if (!verificacion.verified || !verificacion.registrationInfo) {
    return NextResponse.json({ error: 'El dispositivo no se ha podido verificar.' }, { status: 400 });
  }

  const { credential } = verificacion.registrationInfo;
  const nueva: Passkey = {
    id: credential.id,
    llave: isoBase64URL.fromBuffer(credential.publicKey),
    nombre,
    creado: hoyMadrid(),
    transportes: credential.transports,
  };

  // Las que ya había más esta: es lo que hay que dejar en PASSKEYS
  const todas = [...leerPasskeys().filter((passkey) => passkey.id !== nueva.id), nueva];
  return NextResponse.json({ passkey: nueva, variable: comoVariable(todas) });
}
