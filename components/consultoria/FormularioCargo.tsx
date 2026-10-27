'use client';

import { useState, useTransition } from 'react';
import { guardarCargo } from '@/lib/consultoria/acciones';
import { fechaONula } from '@/lib/consultoria/validar';
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO, CAMPO, ERROR, ETIQUETA } from './estilos';
import { conDosDecimales, leerNumero } from './formato';
import Opciones from './Opciones';

/** Un cargo (un curso, −30 €) o un abono (una participación en gastos, +15 €) de la cuenta de comisiones */
export default function FormularioCargo({ hoy, alTerminar }: { hoy: string; alTerminar: () => void }) {
  const [fecha, setFecha] = useState(hoy);
  const [concepto, setConcepto] = useState('');
  const [importe, setImporte] = useState('');
  const [tipo, setTipo] = useState<'cargo' | 'abono'>('cargo');
  const [error, setError] = useState<string | null>(null);
  const [guardando, empezar] = useTransition();

  function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    const dia = fechaONula(fecha);
    const cantidad = leerNumero(importe);
    if (!dia) return setError('Pon la fecha del apunte.');
    if (!concepto.trim()) return setError('Escribe el concepto: «Curso de formación».');
    if (cantidad === null || cantidad <= 0 || !conDosDecimales(cantidad)) return setError('El importe, mayor que cero y con dos decimales como mucho.');
    setError(null);
    empezar(async () => {
      const resultado = await guardarCargo({ fecha: dia, concepto, importe: tipo === 'cargo' ? -cantidad : cantidad });
      if (resultado.error) setError(resultado.error);
      else alTerminar();
    });
  }

  return (
    <form onSubmit={guardar} className="mt-4 flex flex-col gap-3 rounded-lg border border-borde p-4">
      <fieldset>
        <legend className={ETIQUETA}>Qué es</legend>
        <Opciones
          nombre="tipo-de-apunte"
          valor={tipo}
          alCambiar={setTipo}
          opciones={[
            { valor: 'cargo', etiqueta: 'Cargo (resta)' },
            { valor: 'abono', etiqueta: 'Abono (suma)' },
          ]}
        />
      </fieldset>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
        <label className={ETIQUETA}>
          Fecha
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={`${CAMPO} mt-1`} />
        </label>
        <label className={ETIQUETA}>
          Concepto
          <input value={concepto} onChange={(e) => setConcepto(e.target.value)} maxLength={120} placeholder="Curso de formación" className={`${CAMPO} mt-1`} />
        </label>
        <label className={ETIQUETA}>
          Importe
          <span className="relative mt-1 block">
            <input value={importe} onChange={(e) => setImporte(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="30" className={`${CAMPO} pr-8`} />
            <span className="absolute top-1/2 right-3.5 -translate-y-1/2 text-apagado">€</span>
          </span>
        </label>
      </div>
      <p className="text-xs text-apagado">Entra en la siguiente liquidación que llegue. No paga IRPF.</p>
      {error && (
        <p role="alert" className={ERROR}>
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={guardando} className={BOTON_PRINCIPAL}>
          {guardando ? 'Guardando…' : tipo === 'cargo' ? 'Apuntar el cargo' : 'Apuntar el abono'}
        </button>
        <button type="button" onClick={alTerminar} className={BOTON_SECUNDARIO}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
