import { NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { datosRP, leerPasskeys } from '@/lib/passkeys/config';
import { guardarReto } from '@/lib/passkeys/reto';
import { verificarSesion } from '@/lib/sesion';

/** Paso 1 de registrar un dispositivo: solo con la sesión abierta */
export async function POST() {
  await verificarSesion();
  const { rpID } = await datosRP();

  const opciones = await generateRegistrationOptions({
    rpName: 'Dashboard FSMTECH',
    rpID,
    userName: 'facundo',
    userDisplayName: 'Facundo',
    attestationType: 'none',
    // Para no registrar dos veces el mismo dispositivo
    excludeCredentials: leerPasskeys().map((passkey) => ({ id: passkey.id, transports: passkey.transportes })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });

  await guardarReto(opciones.challenge);
  return NextResponse.json(opciones);
}
