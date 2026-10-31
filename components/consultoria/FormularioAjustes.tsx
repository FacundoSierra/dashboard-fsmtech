'use client';

import { useState, useTransition } from 'react';
import { guardarAjustes } from '@/lib/consultoria/acciones';
import type { Ajustes } from '@/lib/consultoria/reglas';
import { BOTON_PRINCIPAL, CAMPO, ERROR, ETIQUETA } from './estilos';
import { aCampo, conDosDecimales, leerNumero } from './formato';

/**
 * Las unidades previas (el punto de partida del nivel) y los porcentajes de serie. Cambiar un
 * porcentaje no toca lo apuntado: cada herramienta guarda los suyos. **0 es un valor.**
 */
export default function FormularioAjustes({ ajustes, deSerie }: { ajustes: Ajustes; deSerie: boolean }) {
  const [previas, setPrevias] = useState(aCampo(ajustes.unidadesPrevias));
  const [pctHucha, setPctHucha] = useState(aCampo(ajustes.pctHucha));
  const [pctIrpf, setPctIrpf] = useState(aCampo(ajustes.pctIrpf));
  const [aviso, setAviso] = useState<{ error?: string; ok?: string }>({});
  const [guardando, empezar] = useTransition();

  function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    const u = leerNumero(previas);
    const h = leerNumero(pctHucha);
    const i = leerNumero(pctIrpf);
    if (u === null || u < 0 || !conDosDecimales(u)) return setAviso({ error: 'Las unidades previas, de 0 en adelante y con dos decimales como mucho.' });
    if (h === null || h < 0 || h > 100) return setAviso({ error: 'La reserva va del 0 al 100 % (0 vale).' });
    if (i === null || i < 0 || i > 100) return setAviso({ error: 'El IRPF va del 0 al 100 % (0 vale).' });
    empezar(async () => setAviso(await guardarAjustes({ unidadesPrevias: u, pctHucha: h, pctIrpf: i })));
  }

  return (
    <form onSubmit={guardar} className="mt-4 flex flex-col gap-3">
      {deSerie && <p className="text-sm text-apagado">Aún son los de serie: al guardar, pasan a ser los tuyos.</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className={ETIQUETA}>
          Unidades previas
          <span className="relative mt-1 block">
            <input value={previas} onChange={(e) => setPrevias(e.target.value)} inputMode="decimal" className={`${CAMPO} pr-8`} />
            <span className="absolute top-1/2 right-3.5 -translate-y-1/2 text-apagado">u</span>
          </span>
          <span className="mt-1 block text-[13px] font-normal text-apagado">Las producidas antes de la primera herramienta apuntada.</span>
        </label>
        <label className={ETIQUETA}>
          Reserva de cancelación de serie
          <span className="relative mt-1 block">
            <input value={pctHucha} onChange={(e) => setPctHucha(e.target.value)} inputMode="decimal" className={`${CAMPO} pr-8`} />
            <span className="absolute top-1/2 right-3.5 -translate-y-1/2 text-apagado">%</span>
          </span>
          <span className="mt-1 block text-[13px] font-normal text-apagado">Cuando ni el producto ni la compañía dicen otra.</span>
        </label>
        <label className={ETIQUETA}>
          IRPF
          <span className="relative mt-1 block">
            <input value={pctIrpf} onChange={(e) => setPctIrpf(e.target.value)} inputMode="decimal" className={`${CAMPO} pr-8`} />
            <span className="absolute top-1/2 right-3.5 -translate-y-1/2 text-apagado">%</span>
          </span>
          <span className="mt-1 block text-[13px] font-normal text-apagado">Para las firmas nuevas y las reclamaciones.</span>
        </label>
      </div>
      {aviso.error && (
        <p role="alert" className={ERROR}>
          {aviso.error}
        </p>
      )}
      {aviso.ok && <p className="text-sm font-medium text-bien-texto">{aviso.ok}</p>}
      <button type="submit" disabled={guardando} className={`${BOTON_PRINCIPAL} self-start`}>
        {guardando ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  );
}
