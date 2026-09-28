'use server';

import { esEstadoCliente, esLinea, obtenerBoveda, siguienteRequerimiento } from '@/lib/boveda/consultas';
import {
  ErrorEscritura,
  crearFichaCliente,
  crearNotaCobros,
  crearRequerimiento,
  crearReunion,
  guardar,
  leerPlantilla,
  lineaLimpia,
  type ResultadoEscritura,
} from '@/lib/boveda/escritura';
import { comillas, rellenarPlantilla } from '@/lib/boveda/plantillas';
import type { Boveda } from '@/lib/boveda/tipos';
import { slug } from '@/lib/documentos/documentos';
import { nombreMes, numero, sumarMeses } from '@/lib/economia';
import { esFechaValida, hoyMadrid } from '@/lib/fechas';
import { verificarSesion } from '@/lib/sesion';

// Notas nuevas desde el panel, con las plantillas de la bóveda. Cada Server Action comprueba
// la sesión al empezar y no da por bueno nada de lo que llega.

export interface ResultadoCreacion extends ResultadoEscritura {
  /** La nota creada, para enlazarla */
  ruta?: string;
  /** Algo que salió a medias y hay que contar aunque lo principal se hiciera */
  aviso?: string;
}

const RE_NOMBRE = /^[a-z0-9][a-z0-9-]*$/;
const RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const esTexto = (valor: unknown, maximo = 2000): valor is string => typeof valor === 'string' && valor.length <= maximo;
const NO_VALIDOS: ResultadoCreacion = { error: 'Datos no válidos.' };

/** Los nombres de nota son únicos en toda la bóveda: `[[cni]]` tiene que llevar a una sola */
function comprobarNombreLibre(boveda: Boveda, nombre: string): void {
  if (Object.hasOwn(boveda.rutas, nombre)) throw new ErrorEscritura(`Ya hay una nota que se llama «${nombre}».`);
}

function esFicha(boveda: Boveda, cliente: string): boolean {
  return RE_NOMBRE.test(cliente) && boveda.porRuta.get(`clientes/${cliente}/${cliente}.md`)?.propiedades.tipo === 'cliente';
}

function esProyecto(boveda: Boveda, proyecto: string): boolean {
  return RE_NOMBRE.test(proyecto) && boveda.porRuta.get(`proyectos/${proyecto}/${proyecto}.md`)?.propiedades.tipo === 'proyecto';
}

// ── Cliente ──────────────────────────────────────────────────────────────────

export interface DatosCliente {
  nombre: string;
  /** El nombre corto de la carpeta y de la nota; si llega vacío, sale del nombre */
  corto: string;
  sector: string;
  web: string;
  estado: string;
  linea: string;
  contexto: string;
  /** El trato, si ya lo hay: con el primer euro, el cliente tiene nota de cobros */
  cobros?: { concepto: string; importe: string; cada: string; desde: string };
}

export async function crearCliente(datos: DatosCliente): Promise<ResultadoCreacion> {
  await verificarSesion();
  const { nombre, corto, sector, web, estado, linea, contexto, cobros } = datos ?? {};
  if (![nombre, corto, sector, web, estado, linea].every((v) => esTexto(v, 300)) || !esTexto(contexto)) return NO_VALIDOS;
  if (!esEstadoCliente(estado) || !esLinea(linea)) return NO_VALIDOS;
  if (web.trim() && !/^https?:\/\/[^\s/]+\.[^\s]+$/.test(web.trim())) return { error: 'La web tiene que empezar por https://' };
  if (cobros && ![cobros.concepto, cobros.importe, cobros.cada, cobros.desde].every((v) => esTexto(v, 200))) return NO_VALIDOS;

  const hoy = hoyMadrid();
  const cliente = slug(corto.trim() || nombre, 40);
  const ruta = `clientes/${cliente}/${cliente}.md`;
  let rutaCobros: string | undefined;
  let fichaCreada = false;

  const resultado = await guardar('crear el cliente', async () => {
    const boveda = await obtenerBoveda();
    const titulo = lineaLimpia(nombre, 80, 'el nombre');
    if (!RE_NOMBRE.test(cliente)) throw new ErrorEscritura('El nombre corto solo puede llevar letras sin tilde, números y guiones.');
    comprobarNombreLibre(boveda, cliente);

    // El trato se comprueba antes de crear nada, para no dejar una ficha a medias por un importe mal escrito
    let notaCobros: string | undefined;
    if (cobros) {
      const concepto = lineaLimpia(cobros.concepto, 80, 'el concepto');
      const importe = numero(cobros.importe);
      if (importe === undefined || importe <= 0) throw new ErrorEscritura('El importe tiene que ser un número, como 50 o 49,90.');
      if (!['mes', 'año', 'sesion', 'hora'].includes(cobros.cada)) throw new ErrorEscritura('Datos no válidos.');
      if (!RE_MES.test(cobros.desde)) throw new ErrorEscritura('El primer mes tiene que ser como 2026-10.');

      const hasta = sumarMeses(cobros.desde, 11);
      const cantidad = Number.isInteger(importe) ? String(importe) : importe.toFixed(2).replace('.', ',');
      // Una casilla por cobro previsto: doce si es al mes, una si es al año; las tarifas, al cobrarlas
      const meses = cobros.cada === 'mes' ? Array.from({ length: 12 }, (_, i) => sumarMeses(cobros.desde, i)) : cobros.cada === 'año' ? [cobros.desde] : [];
      rutaCobros = `clientes/${cliente}/cobros/${cliente}-cobros-${cobros.desde.slice(0, 4)}.md`;
      notaCobros = rellenarPlantilla(await leerPlantilla('cobros'), {
        titulo: `Cobros de ${titulo} · ${nombreMes(cobros.desde)} – ${nombreMes(hasta)}`,
        fecha: hoy,
        propiedades: {
          cliente: comillas(`[[${cliente}]]`),
          anio: cobros.desde.slice(0, 4),
          desde: cobros.desde,
          plan: { bloque: [`  - concepto: ${comillas(concepto)}`, `    importe: ${importe}`, `    cada: ${cobros.cada}`] },
        },
        secciones: {
          cobros: meses.map((mes) => `- [ ] ${mes} — ${concepto} — ${cantidad} €`),
          relacionado: [`- [[${cliente}]]`],
        },
      });
    }

    await crearFichaCliente(
      ruta,
      rellenarPlantilla(await leerPlantilla('cliente'), {
        titulo,
        fecha: hoy,
        propiedades: {
          estado,
          linea,
          ...(sector.trim() ? { sector: comillas(lineaLimpia(sector, 80, 'el sector')) } : {}),
          ...(web.trim() ? { web: comillas(web.trim()) } : {}),
          fecha_alta: hoy,
        },
        secciones: { 'contexto del negocio': contexto.trim() ? [lineaLimpia(contexto, 1500, 'el contexto')] : [] },
      }),
    );
    fichaCreada = true;

    if (notaCobros && rutaCobros) {
      try {
        await crearNotaCobros(rutaCobros, notaCobros);
      } catch (error) {
        rutaCobros = undefined;
        throw new ErrorEscritura(
          `La ficha está creada, pero la nota de cobros no: ${error instanceof ErrorEscritura ? error.message : 'inténtalo desde Obsidian'}`,
        );
      }
    }
  });

  // Si la ficha se creó y lo que falló fue la nota de cobros, se enlaza la ficha igualmente
  return resultado.error ? { ...resultado, ruta: fichaCreada ? ruta : undefined } : { ruta };
}

// ── Reunión ──────────────────────────────────────────────────────────────────

export interface DatosReunion {
  cliente: string;
  fecha: string;
  hora: string;
  tema: string;
  proyectos: string[];
  objetivo: string;
}

export async function crearReunionNueva(datos: DatosReunion): Promise<ResultadoCreacion> {
  await verificarSesion();
  const { cliente, fecha, hora, tema, proyectos, objetivo } = datos ?? {};
  if (![cliente, fecha, hora, tema].every((v) => esTexto(v, 300)) || !esTexto(objetivo)) return NO_VALIDOS;
  if (!Array.isArray(proyectos) || proyectos.length > 20 || !proyectos.every((p) => esTexto(p, 100))) return NO_VALIDOS;
  if (!esFechaValida(fecha)) return { error: 'La fecha no es válida.' };
  if (hora && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(hora)) return { error: 'La hora tiene que ser como 10:30.' };

  let ruta = '';
  const resultado = await guardar('crear la reunión', async () => {
    const boveda = await obtenerBoveda();
    if (!esFicha(boveda, cliente)) throw new ErrorEscritura('Ese cliente no tiene ficha.');
    if (!proyectos.every((p) => esProyecto(boveda, p))) throw new ErrorEscritura('Algún proyecto no existe.');

    const asunto = lineaLimpia(tema, 80, 'el tema');
    const nombre = `${fecha}-${cliente}-${slug(asunto, 40) || 'reunion'}`;
    comprobarNombreLibre(boveda, nombre);
    ruta = `clientes/${cliente}/reuniones/${nombre}.md`;

    const tituloCliente = boveda.porRuta.get(`clientes/${cliente}/${cliente}.md`)?.titulo ?? cliente;
    await crearReunion(
      ruta,
      rellenarPlantilla(await leerPlantilla('reunion'), {
        titulo: `Reunión con ${tituloCliente}: ${asunto}`,
        fecha,
        propiedades: {
          fecha,
          ...(hora ? { hora: comillas(hora.padStart(5, '0')) } : {}),
          cliente: comillas(`[[${cliente}]]`),
          proyectos: proyectos.map((p) => comillas(`[[${p}]]`)),
        },
        secciones: {
          objetivo: objetivo.trim() ? [lineaLimpia(objetivo, 1500, 'el objetivo')] : [],
          relacionado: [cliente, ...proyectos].map((n) => `- [[${n}]]`),
        },
      }),
    );
  });
  return resultado.error ? resultado : { ruta };
}

// ── Requerimiento ────────────────────────────────────────────────────────────

export interface DatosRequerimiento {
  proyecto: string;
  titulo: string;
  pide: string;
  /** Nota donde se pidió (una reunión); si no, el propio proyecto */
  origen: string;
  horas: string;
  prioridad: string;
}

export async function crearRequerimientoNuevo(datos: DatosRequerimiento): Promise<ResultadoCreacion> {
  await verificarSesion();
  const { proyecto, titulo, pide, origen, horas, prioridad } = datos ?? {};
  if (![proyecto, titulo, origen, horas, prioridad].every((v) => esTexto(v, 300)) || !esTexto(pide)) return NO_VALIDOS;
  if (!['alta', 'media', 'baja'].includes(prioridad)) return NO_VALIDOS;
  const estimacion = horas.trim() ? numero(horas) : undefined;
  if (horas.trim() && !(estimacion !== undefined && estimacion > 0 && estimacion < 1000)) return { error: 'Las horas tienen que ser un número, como 8.' };

  let ruta = '';
  const resultado = await guardar('crear el requerimiento', async () => {
    const boveda = await obtenerBoveda();
    if (!esProyecto(boveda, proyecto)) throw new ErrorEscritura('Ese proyecto no existe.');
    if (origen && (!RE_NOMBRE.test(origen) || boveda.porRuta.get(boveda.rutas[origen] ?? '')?.propiedades.tipo !== 'reunion')) {
      throw new ErrorEscritura('Esa reunión no existe.');
    }

    const asunto = lineaLimpia(titulo, 100, 'el título');
    const numeroReq = siguienteRequerimiento(boveda, proyecto).slice(4);
    const nombre = `req-${numeroReq}-${slug(asunto, 40) || 'peticion'}`;
    comprobarNombreLibre(boveda, nombre);
    ruta = `proyectos/${proyecto}/requerimientos/${nombre}.md`;

    const contenido = rellenarPlantilla(await leerPlantilla('requerimiento'), {
      titulo: `REQ-${numeroReq} · ${asunto}`,
      fecha: hoyMadrid(),
      propiedades: {
        id: `REQ-${numeroReq}`,
        proyecto: comillas(`[[${proyecto}]]`),
        origen: comillas(`[[${origen || proyecto}]]`),
        estado: 'pendiente',
        fecha: hoyMadrid(),
        ...(estimacion !== undefined ? { estimacion_horas: String(estimacion) } : {}),
      },
      secciones: {
        'que pide el cliente': pide.trim() ? [lineaLimpia(pide, 1500, 'lo que pide')] : [],
        relacionado: [proyecto, ...(origen ? [origen] : [])].map((n) => `- [[${n}]]`),
      },
    }).replace('#prioridad/media', `#prioridad/${prioridad}`);
    await crearRequerimiento(ruta, contenido);
  });
  return resultado.error ? resultado : { ruta };
}
