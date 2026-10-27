'use client';

import { useState, useTransition } from 'react';
import { guardarNiveles } from '@/lib/consultoria/acciones';
import type { Nivel } from '@/lib/consultoria/reglas';
import { nombreDelMes } from '@/lib/consultoria/calendario';
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO, CAMPO, ERROR } from './estilos';
import { aCampo, euroPorUnidad, leerNumero, unidades } from './formato';

interface Fila {
  clave: number;
  nombre: string;
  valorUnidad: string;
  desdeUnidades: string;
  /** AAAA-MM */
  desdeMes: string;
}

const aFila = (n: Nivel, clave: number): Fila => ({
  clave,
  nombre: n.nombre,
  valorUnidad: aCampo(n.valorUnidad),
  desdeUnidades: aCampo(n.desdeUnidades),
  desdeMes: n.desdeMes ? n.desdeMes.slice(0, 7) : '',
});

/**
 * Los niveles del plan de carrera: se alcanzan por unidades o, los que piden equipo, a mano desde
 * un mes. Vale el de mayor €/unidad de los alcanzados. Se guardan todos de una vez.
 */
export default function FormularioNiveles({ niveles, deSerie }: { niveles: Nivel[]; deSerie: boolean }) {
  const [cambiando, setCambiando] = useState(false);
  const [filas, setFilas] = useState(() => niveles.map(aFila));
  const [aviso, setAviso] = useState<{ error?: string; ok?: string }>({});
  const [guardando, empezar] = useTransition();

  const cambiar = (clave: number, cambios: Partial<Fila>) => setFilas((actuales) => actuales.map((f) => (f.clave === clave ? { ...f, ...cambios } : f)));

  function guardar() {
    const lista: Nivel[] = [];
    for (const f of filas) {
      const valor = leerNumero(f.valorUnidad);
      const desde = f.desdeUnidades.trim() ? leerNumero(f.desdeUnidades) : null;
      if (!f.nombre.trim()) return setAviso({ error: 'Cada nivel lleva su nombre.' });
      if (valor === null || valor <= 0) return setAviso({ error: `El €/unidad de «${f.nombre}» tiene que ser mayor que cero.` });
      if (f.desdeUnidades.trim() && (desde === null || desde < 0)) return setAviso({ error: `Las unidades de «${f.nombre}» no pueden ser negativas.` });
      lista.push({ nombre: f.nombre.trim(), valorUnidad: valor, desdeUnidades: desde, desdeMes: f.desdeMes ? `${f.desdeMes}-01` : null });
    }
    empezar(async () => {
      const resultado = await guardarNiveles(lista);
      setAviso(resultado);
      if (!resultado.error) setCambiando(false);
    });
  }

  if (!cambiando) {
    return (
      <div className="mt-4">
        {deSerie && <p className="mb-2 text-sm text-apagado">Son los de serie del cuadro: al guardarlos, pasan a ser los tuyos.</p>}
        <ul className="flex flex-col gap-1.5">
          {niveles.map((n) => (
            <li key={n.nombre} className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-lg bg-fondo/60 px-3 py-2.5 text-sm">
              <span className="font-medium text-texto">{n.nombre}</span>
              <span className="text-tenue">
                <span className="cifras font-medium text-texto">{euroPorUnidad(n.valorUnidad)}</span>
                {' · '}
                {n.desdeUnidades !== null ? `desde ${unidades(n.desdeUnidades)}` : n.desdeMes ? `desde ${nombreDelMes(n.desdeMes)}` : 'a mano (requiere equipo)'}
              </span>
            </li>
          ))}
        </ul>
        {aviso.ok && <p className="mt-2 text-sm font-medium text-bien-texto">{aviso.ok}</p>}
        <button type="button" onClick={() => setCambiando(true)} className={`${BOTON_SECUNDARIO} mt-3`}>
          Cambiar los niveles
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {filas.map((f) => (
          <li key={f.clave} className="grid grid-cols-1 gap-2 rounded-lg border border-borde p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <label className="text-xs font-medium text-tenue">
              Nombre
              <input value={f.nombre} onChange={(e) => cambiar(f.clave, { nombre: e.target.value })} maxLength={40} className={`${CAMPO} mt-1`} />
            </label>
            <label className="text-xs font-medium text-tenue">
              €/unidad
              <input value={f.valorUnidad} onChange={(e) => cambiar(f.clave, { valorUnidad: e.target.value })} inputMode="decimal" className={`${CAMPO} mt-1`} />
            </label>
            <label className="text-xs font-medium text-tenue">
              Desde unidades
              <input value={f.desdeUnidades} onChange={(e) => cambiar(f.clave, { desdeUnidades: e.target.value })} inputMode="decimal" placeholder="A mano" className={`${CAMPO} mt-1`} />
            </label>
            <label className="text-xs font-medium text-tenue">
              O desde el mes
              <input type="month" value={f.desdeMes} onChange={(e) => cambiar(f.clave, { desdeMes: e.target.value })} placeholder="AAAA-MM" className={`${CAMPO} mt-1`} />
            </label>
            <button
              type="button"
              onClick={() => setFilas((actuales) => actuales.filter((x) => x.clave !== f.clave))}
              aria-label={`Quitar el nivel ${f.nombre || 'sin nombre'}`}
              className="min-h-11 px-2 text-sm text-apagado underline-offset-4 hover:text-critico-texto hover:underline"
            >
              Quitar
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setFilas((actuales) => [...actuales, { clave: Math.max(0, ...actuales.map((f) => f.clave)) + 1, nombre: '', valorUnidad: '', desdeUnidades: '', desdeMes: '' }])}
        className={`${BOTON_SECUNDARIO} self-start`}
      >
        Añadir un nivel
      </button>
      {aviso.error && (
        <p role="alert" className={ERROR}>
          {aviso.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={guardar} disabled={guardando} className={BOTON_PRINCIPAL}>
          {guardando ? 'Guardando…' : 'Guardar los niveles'}
        </button>
        <button
          type="button"
          onClick={() => {
            setFilas(niveles.map(aFila));
            setAviso({});
            setCambiando(false);
          }}
          className={BOTON_SECUNDARIO}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
