'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { Check, Copy, Fingerprint, Plus } from 'lucide-react';

/**
 * Entrar y registrar dispositivos con huella o cara. Todo lo que se comprueba está en el
 * servidor: aquí solo se habla con el navegador y se enseña el resultado.
 */

const BOTON =
  'inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-borde bg-fondo px-3 font-medium hover:border-borde-fuerte disabled:opacity-60';

/** Mensaje de error del panel, o el del navegador si el usuario cancela */
function comoError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'NotAllowedError') return 'Se ha cancelado.';
    if (error.name === 'InvalidStateError') return 'Este dispositivo ya está registrado.';
    return error.message;
  }
  return 'No ha funcionado. Inténtalo otra vez.';
}

async function pedir(ruta: string, cuerpo?: unknown): Promise<Record<string, unknown>> {
  const respuesta = await fetch(ruta, {
    method: 'POST',
    headers: cuerpo ? { 'content-type': 'application/json' } : undefined,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = (await respuesta.json().catch(() => ({}))) as Record<string, unknown>;
  if (!respuesta.ok) throw new Error(typeof datos.error === 'string' ? datos.error : `El panel respondió ${respuesta.status}`);
  return datos;
}

// ── Entrar ───────────────────────────────────────────────────────────────────

export function BotonEntrarConHuella({ desde }: { desde: string }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [entrando, setEntrando] = useState(false);

  async function entrar() {
    setError(undefined);
    setEntrando(true);
    try {
      const opciones = await pedir('/api/passkeys/entrar/opciones');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const respuesta = await startAuthentication({ optionsJSON: opciones as any });
      await pedir('/api/passkeys/entrar/verificar', respuesta);
      router.replace(desde);
      router.refresh();
    } catch (fallo) {
      setError(comoError(fallo));
      setEntrando(false);
    }
  }

  return (
    <div className="space-y-3">
      <button type="button" onClick={entrar} disabled={entrando} className={BOTON}>
        <Fingerprint className="size-5" aria-hidden />
        {entrando ? 'Comprobando…' : 'Entrar con huella'}
      </button>
      {error && (
        <p role="alert" className="text-sm text-critico-texto">
          {error}
        </p>
      )}
    </div>
  );
}

// ── Registrar un dispositivo ─────────────────────────────────────────────────

export function RegistrarDispositivo() {
  const [nombre, setNombre] = useState('');
  const [variable, setVariable] = useState<string>();
  const [error, setError] = useState<string>();
  const [registrando, setRegistrando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  async function registrar() {
    setError(undefined);
    setVariable(undefined);
    setRegistrando(true);
    try {
      const opciones = await pedir('/api/passkeys/registro/opciones');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const respuesta = await startRegistration({ optionsJSON: opciones as any });
      const datos = await pedir('/api/passkeys/registro/verificar', { respuesta, nombre });
      setVariable(String(datos.variable));
    } catch (fallo) {
      setError(comoError(fallo));
    } finally {
      setRegistrando(false);
    }
  }

  async function copiar() {
    if (!variable) return;
    try {
      await navigator.clipboard.writeText(variable);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setError('No se ha podido copiar: selecciona el texto y cópialo a mano.');
    }
  }

  return (
    <div className="space-y-4">
      <label className="block max-w-xs text-sm font-medium">
        Nombre del dispositivo
        <input
          value={nombre}
          onChange={(evento) => setNombre(evento.target.value)}
          maxLength={40}
          placeholder="PC de casa"
          className="mt-1 h-9 w-full rounded-lg border border-borde bg-superficie px-3 text-sm outline-none focus:border-acento focus:ring-2 focus:ring-acento/25"
        />
      </label>

      <button
        type="button"
        onClick={registrar}
        disabled={registrando}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-acento-fuerte px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        <Plus className="size-4" aria-hidden />
        {registrando ? 'Esperando al dispositivo…' : 'Registrar este dispositivo'}
      </button>

      {error && (
        <p role="alert" className="text-sm text-critico-texto">
          {error}
        </p>
      )}

      {variable && (
        <div className="rounded-lg border border-borde bg-superficie-2 p-4">
          <p className="text-sm font-medium">Dispositivo registrado. Falta un paso:</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-tenue">
            <li>Copia esto y pégalo en Vercel, en la variable <code>PASSKEYS</code> del panel.</li>
            <li>Vuelve a desplegar. Hasta entonces, se entra con la contraseña.</li>
          </ol>
          <textarea
            readOnly
            value={variable}
            rows={3}
            onFocus={(evento) => evento.currentTarget.select()}
            className="mt-3 w-full rounded-lg border border-borde bg-superficie p-2 font-mono text-xs"
          />
          <button
            type="button"
            onClick={copiar}
            className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg border border-borde bg-superficie px-2.5 text-sm font-medium hover:border-borde-fuerte"
          >
            {copiado ? <Check className="size-4 text-bien" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copiado ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      )}
    </div>
  );
}
