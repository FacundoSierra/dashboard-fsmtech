'use client';

import { useState, useTransition } from 'react';
import { guardarCliente } from '@/lib/consultoria/acciones';
import type { FichaCliente } from '@/lib/consultoria/tipos';
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO, CAMPO } from './estilos';

/**
 * Alta o cambio de un cliente de la consultoría: lo mínimo. Nada de DNI, cuentas, salud ni datos
 * de contacto, y el aviso lo dice al lado de las notas.
 */
export default function FormularioCliente({
  cliente,
  alGuardar,
  alCancelar,
}: {
  cliente?: FichaCliente['cliente'];
  alGuardar: (id: string) => void;
  alCancelar: () => void;
}) {
  const [nombre, setNombre] = useState(cliente?.nombre ?? '');
  const [referencia, setReferencia] = useState(cliente?.referencia ?? '');
  const [revision, setRevision] = useState(cliente?.proximaRevision ?? '');
  const [notas, setNotas] = useState(cliente?.notas ?? '');
  const [error, setError] = useState<string | null>(null);
  const [guardando, empezar] = useTransition();

  function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    if (!nombre.trim()) {
      setError('Escribe el nombre del cliente.');
      return;
    }
    empezar(async () => {
      const resultado = await guardarCliente({
        id: cliente?.id,
        nombre,
        referencia: referencia || null,
        proximaRevision: revision || null,
        notas: notas || null,
      });
      if (resultado.error) setError(resultado.error);
      else alGuardar(resultado.id ?? cliente?.id ?? '');
    });
  }

  return (
    <form onSubmit={guardar} className="mt-5 flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-tenue">
          Nombre
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={80}
            required
            autoComplete="off"
            className={`${CAMPO} mt-1`}
          />
        </label>
        <label className="text-sm font-medium text-tenue">
          Referencia <span className="font-normal text-apagado">· opcional</span>
          <input
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            maxLength={40}
            placeholder="Quién te lo presentó"
            autoComplete="off"
            className={`${CAMPO} mt-1`}
          />
        </label>
      </div>
      <label className="text-sm font-medium text-tenue sm:max-w-xs">
        Próxima revisión <span className="font-normal text-apagado">· opcional</span>
        <input type="date" value={revision} onChange={(e) => setRevision(e.target.value)} className={`${CAMPO} mt-1`} />
      </label>
      <label className="text-sm font-medium text-tenue">
        Notas <span className="font-normal text-apagado">· opcional</span>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          maxLength={500}
          rows={3}
          className={`${CAMPO} mt-1 resize-y`}
        />
        <span className="mt-1 block text-[13px] font-normal text-apagado">
          Sin datos personales: ni DNI, ni cuentas, ni salud, ni teléfono, correo o dirección.
        </span>
      </label>

      {error && (
        <p role="alert" className="text-sm font-medium text-critico-texto">
          {error}
        </p>
      )}

      <div className="mt-1 flex flex-wrap gap-2">
        <button type="submit" disabled={guardando} className={BOTON_PRINCIPAL}>
          {guardando ? 'Guardando…' : cliente ? 'Guardar cambios' : 'Crear cliente'}
        </button>
        <button type="button" onClick={alCancelar} className={BOTON_SECUNDARIO}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
