'use client';

import { useState, useTransition } from 'react';
import { guardarCompania } from '@/lib/consultoria/acciones';
import type { Calendario, DatosCompania, ReglaCompania } from '@/lib/consultoria/reglas';
import Aviso from './Aviso';
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO, CAMPO, ERROR, ETIQUETA } from './estilos';
import { NOMBRE_CALENDARIO, NOMBRE_REGLA, aCampo, leerNumero, pct } from './formato';

type CalendarioDeCompania = Exclude<Calendario, 'RANKING'>;
const REGLAS = Object.keys(NOMBRE_REGLA) as ReglaCompania[];
const CALENDARIOS: CalendarioDeCompania[] = ['AXA_PIAS', 'INTESA', 'AVANZA'];

/**
 * Las compañías con las que trabaja: su código (como sale en la liquidación), su regla de fechas,
 * el calendario de cierres que sigue, la reserva de sus productos y los meses del efecto al cobro.
 * Son datos: una nueva se añade aquí, sin tocar el código.
 */
export default function AjustesCompanias({ companias, deSerie }: { companias: DatosCompania[]; deSerie: boolean }) {
  const [editando, setEditando] = useState<string | null>(null);

  return (
    <div className="mt-4 flex flex-col gap-2">
      {deSerie && (
        <Aviso caja>
          No tienes compañías guardadas: estas son las de serie, y sin las tuyas no se puede apuntar ninguna firma. Guarda cada una.
        </Aviso>
      )}
      <ul className="flex flex-col gap-2">
        {companias.map((c) =>
          editando === c.codigo ? (
            <li key={c.codigo}>
              <FormularioCompania compania={c} alTerminar={() => setEditando(null)} />
            </li>
          ) : (
            <li key={c.codigo} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg bg-superficie-2 px-3 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="font-medium text-texto">{c.nombre}</span>
                <span className="text-apagado"> · {c.codigo}</span>
                <span className="block text-sm text-tenue">
                  {NOMBRE_REGLA[c.regla]}
                  {c.calendario && ` · cierres de ${NOMBRE_CALENDARIO[c.calendario]}`}
                  {c.pctHucha !== null && ` · reserva del ${pct(c.pctHucha)}`}
                  {c.mesesHastaCobro !== null && ` · cobro ${c.mesesHastaCobro === 0 ? 'el mes del efecto' : `${c.mesesHastaCobro} ${c.mesesHastaCobro === 1 ? 'mes' : 'meses'} después`}`}
                </span>
              </span>
              <button type="button" onClick={() => setEditando(c.codigo)} aria-label={`Cambiar ${c.nombre}`} className="min-h-11 shrink-0 px-2 text-sm font-medium text-acento underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-acento">
                Cambiar
              </button>
            </li>
          ),
        )}
      </ul>
      {editando === '' ? (
        <FormularioCompania alTerminar={() => setEditando(null)} />
      ) : (
        <button type="button" onClick={() => setEditando('')} className={`${BOTON_SECUNDARIO} self-start`}>
          Añadir una compañía
        </button>
      )}
    </div>
  );
}

function FormularioCompania({ compania, alTerminar }: { compania?: DatosCompania; alTerminar: () => void }) {
  const [codigo, setCodigo] = useState(compania?.codigo ?? '');
  const [nombre, setNombre] = useState(compania?.nombre ?? '');
  const [regla, setRegla] = useState<ReglaCompania>(compania?.regla ?? 'sin_calendario');
  const [calendario, setCalendario] = useState<CalendarioDeCompania>(compania?.calendario ?? 'AXA_PIAS');
  const [pctHucha, setPctHucha] = useState(aCampo(compania?.pctHucha));
  const [meses, setMeses] = useState(aCampo(compania?.mesesHastaCobro));
  const [error, setError] = useState<string | null>(null);
  const [guardando, empezar] = useTransition();

  function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    const reserva = pctHucha.trim() ? leerNumero(pctHucha) : null;
    const hastaCobro = meses.trim() ? leerNumero(meses) : null;
    if (!/^[A-Z0-9_]{2,10}$/.test(codigo.trim().toUpperCase())) return setError('El código va en mayúsculas, de 2 a 10 letras, números o «_», como sale en la liquidación.');
    if (!nombre.trim()) return setError('Escribe el nombre de la compañía.');
    if (pctHucha.trim() && (reserva === null || reserva < 0 || reserva > 100)) return setError('La reserva va del 0 al 100 % (0 vale; vacío, la de Ajustes).');
    if (meses.trim() && (hastaCobro === null || !Number.isInteger(hastaCobro) || hastaCobro < 0 || hastaCobro > 12))
      return setError('Los meses del efecto al cobro van de 0 a 12.');
    setError(null);
    empezar(async () => {
      const resultado = await guardarCompania({
        codigo,
        nombre,
        regla,
        calendario: regla === 'sin_calendario' ? null : calendario,
        pctHucha: reserva,
        mesesHastaCobro: hastaCobro,
      });
      if (resultado.error) setError(resultado.error);
      else alTerminar();
    });
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-3 rounded-lg bg-superficie-2 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={ETIQUETA}>
          Código
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            disabled={Boolean(compania)}
            maxLength={10}
            placeholder="ALL"
            autoComplete="off"
            className={`${CAMPO} mt-1`}
          />
        </label>
        <label className={ETIQUETA}>
          Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={40} placeholder="Allianz" className={`${CAMPO} mt-1`} />
        </label>
        <label className={ETIQUETA}>
          Cómo salen sus fechas
          <select value={regla} onChange={(e) => setRegla(e.target.value as ReglaCompania)} className={`${CAMPO} mt-1`}>
            {REGLAS.map((r) => (
              <option key={r} value={r}>
                {NOMBRE_REGLA[r]}
              </option>
            ))}
          </select>
        </label>
        {regla !== 'sin_calendario' && (
          <label className={ETIQUETA}>
            Calendario de cierres
            <select value={calendario} onChange={(e) => setCalendario(e.target.value as CalendarioDeCompania)} className={`${CAMPO} mt-1`}>
              {CALENDARIOS.map((cal) => (
                <option key={cal} value={cal}>
                  {NOMBRE_CALENDARIO[cal]}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className={ETIQUETA}>
          Reserva de sus productos <span className="font-normal text-apagado">(vacío: la de Ajustes)</span>
          <span className="relative mt-1 block">
            <input value={pctHucha} onChange={(e) => setPctHucha(e.target.value)} inputMode="decimal" className={`${CAMPO} pr-8`} />
            <span className="absolute top-1/2 right-3.5 -translate-y-1/2 text-apagado">%</span>
          </span>
        </label>
        <label className={ETIQUETA}>
          Meses del efecto al cobro <span className="font-normal text-apagado">(vacío: el de su regla)</span>
          <input value={meses} onChange={(e) => setMeses(e.target.value)} inputMode="numeric" className={`${CAMPO} mt-1`} />
        </label>
      </div>
      {error && (
        <p role="alert" className={ERROR}>
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={guardando} className={BOTON_PRINCIPAL}>
          {guardando ? 'Guardando…' : 'Guardar la compañía'}
        </button>
        <button type="button" onClick={alTerminar} className={BOTON_SECUNDARIO}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
