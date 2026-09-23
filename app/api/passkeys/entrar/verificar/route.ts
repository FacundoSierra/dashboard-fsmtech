import { NextResponse, type NextRequest } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { COOKIE_SESION, DURACION_SESION_S, crearToken } from '@/lib/firma';
import { datosRP, leerPasskeys } from '@/lib/passkeys/config';
import { borrarReto, leerReto } from '@/lib/passkeys/reto';

/**
 * Paso 2 de entrar con huella: si la firma del dispositivo cuadra, abre la sesión. Falla cerrado:
 * sin dispositivos registrados, sin reto o sin `DASHBOARD_SECRET` no entra nadie.
 */
export async function POST(request: NextRequest) {
  const passkeys = leerPasskeys();
  if (!passkeys.length) return new NextResponse('No encontrado', { status: 404 });

  const reto = await leerReto();
  if (!reto) return NextResponse.json({ error: 'Ha caducado. Vuelve a intentarlo.' }, { status: 400 });

  let respuesta: { id?: string };
  try {
    respuesta = await request.json();
  } catch {
    return NextResponse.json({ error: 'Petición mal formada.' }, { status: 400 });
  }

  const passkey = passkeys.find((registrada) => registrada.id === respuesta.id);
  if (!passkey) {
    await borrarReto();
    return NextResponse.json({ error: 'Ese dispositivo no está registrado.' }, { status: 400 });
  }

  const { rpID, origen } = await datosRP();
  let verificacion;
  try {
    verificacion = await verifyAuthenticationResponse({
      // El tipo exacto lo comprueba la propia librería
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      response: respuesta as any,
      expectedChallenge: reto,
      expectedOrigin: origen,
      expectedRPID: rpID,
      credential: {
        id: passkey.id,
        publicKey: isoBase64URL.toBuffer(passkey.llave),
        // Las passkeys que se sincronizan entre dispositivos no llevan contador
        counter: 0,
        transports: passkey.transportes as never,
      },
    });
  } catch (error) {
    await borrarReto();
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo comprobar.' }, { status: 400 });
  }

  await borrarReto();
  if (!verificacion.verified) return NextResponse.json({ error: 'La firma no cuadra.' }, { status: 401 });

  const token = await crearToken();
  if (!token) return NextResponse.json({ error: 'Falta DASHBOARD_SECRET en el panel.' }, { status: 500 });

  const salida = NextResponse.json({ ok: true });
  salida.cookies.set(COOKIE_SESION, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DURACION_SESION_S,
  });
  return salida;
}
