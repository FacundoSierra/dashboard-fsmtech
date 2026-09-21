'use client';

import { useActionState } from 'react';
import { iniciarSesion } from './acciones';
import type { EstadoLogin } from './estado';

export function FormularioLogin({ desde }: { desde: string }) {
  const [estado, accion, enviando] = useActionState<EstadoLogin, FormData>(iniciarSesion, {});

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="desde" value={desde} />
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Contraseña</span>
        <input
          type="password"
          name="password"
          required
          autoFocus
          autoComplete="current-password"
          className="w-full rounded-lg border border-borde bg-fondo px-3 py-2 outline-none focus:border-acento focus:ring-2 focus:ring-acento/30"
        />
      </label>
      {estado.error && (
        <p role="alert" className="text-sm text-critico-texto">
          {estado.error}
        </p>
      )}
      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded-lg bg-acento-fuerte px-3 py-2 font-medium text-white disabled:opacity-60"
      >
        {enviando ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
