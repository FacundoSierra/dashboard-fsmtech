import { NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { datosRP, leerPasskeys } from '@/lib/passkeys/config';
import { guardarReto } from '@/lib/passkeys/reto';

/** Paso 1 de entrar con huella. Sin sesión: es lo que sustituye a escribir la contraseña */
export async function POST() {
  const passkeys = leerPasskeys();
  if (!passkeys.length) return new NextResponse('No encontrado', { status: 404 });

  const { rpID } = await datosRP();
  const opciones = await generateAuthenticationOptions({
    rpID,
    allowCredentials: passkeys.map((passkey) => ({ id: passkey.id, transports: passkey.transportes })),
    userVerification: 'preferred',
  });

  await guardarReto(opciones.challenge);
  return NextResponse.json(opciones);
}
