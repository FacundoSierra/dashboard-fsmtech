'use client';

import { useActionState, useId } from 'react';
import { BOTON_PRINCIPAL, CAMPO, ETIQUETA } from '@/components/estilos';
import { iniciarSesion } from './acciones';
import type { EstadoLogin } from './estado';

export function FormularioLogin({ desde }: { desde: string }) {
  const [estado, accion, enviando] = useActionState<EstadoLogin, FormData>(iniciarSesion, {});
  const idError = useId();

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="desde" value={desde} />
      {/* Hay un solo usuario, pero los gestores de contraseñas necesitan uno para guardar la
          contraseña (y Chrome lo avisa sin él). No se envía al servidor: no tiene `name` */}
      <input type="text" autoComplete="username" value="fsmtech" readOnly hidden />
      <label className="block">
        <span className={ETIQUETA}>Contraseña</span>
        <input
          type="password"
          name="password"
          required
          autoFocus
          autoComplete="current-password"
          aria-invalid={estado.error ? true : undefined}
          aria-describedby={estado.error ? idError : undefined}
          className={`${CAMPO} aria-[invalid=true]:border-critico-texto`}
        />
      </label>
      {estado.error && (
        <p id={idError} role="alert" className="text-sm text-critico-texto">
          {estado.error}
        </p>
      )}
      <button
        type="submit"
        disabled={enviando}
        className={`${BOTON_PRINCIPAL} w-full`}
      >
        {enviando ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
