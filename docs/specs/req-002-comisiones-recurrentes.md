# REQ-002 · Comisiones recurrentes de los seguros que se cobran por recibo

- Fecha: 2026-11-01
- Rama: `req-002-comisiones-recurrentes`
- Requerimiento (qué y por qué): `proyectos/dashboard-fsmtech/requerimientos/req-002-comisiones-recurrentes-de-los-seguros.md` de la bóveda
- Decisión: [ADR-004](../decisiones/adr-004-las-comisiones-recurrentes-son-filas-programadas-por-delante.md)
- Parte de la 0001 (`supabase/migraciones/0001_consultoria.sql`) y de la spec de REQ-001. **«Ha llegado» y «Deshacer» no cambian**

> **Protección de datos, también aquí**: ni nombres de clientes ni números de póliza en el código, las pruebas, los ejemplos, los commits ni este documento. Las cifras de la n.º 6 son los totales del documento de OVB. Ninguna de ellas lleva datos de nadie.

## 1. La idea

Una herramienta que se cobra por recibo se apunta **una vez**, como **serie**: cada cuánto cobra (trimestral o semestral) y cuántas unidades cobra cada cuota. Cada cuota es una fila más de `consultoria_herramientas`, colgada de su herramienta (`cuota_de`) e identificada por su periodo natural (`cuota_periodo`). Lleva sus unidades y 0 para el nivel. El panel las **programa solo, con seis meses por delante**: al apuntar la serie, al marcar «Ha llegado» y con un botón.

Como son filas, «Ha llegado», «Deshacer», lo que «no ha entrado», las previsiones, la hucha y el IRPF funcionan como hoy, sin tocar sus funciones. La regla de cobro está en `reglas.ts`, con sus pruebas. La fila la arma una función SQL que copia la herramienta, para que el panel y los scripts no puedan armar cuotas distintas. Anular corta las cuotas sin cobrar.

## 2. La regla (Facundo, 2026-11-01)

| Recibos del cliente | Qué es | Cuándo se cobra |
|---|---|---|
| **Trimestrales** | Comisión recurrente | Cada trimestre natural, **el mes siguiente a su último mes**, empezando por el trimestre que contiene el efecto: enero-marzo en abril, abril-junio en julio, julio-septiembre en octubre y octubre-diciembre en enero. Un efecto el 1 de abril cobra su primera cuota en julio, no en mayo |
| **Semestrales** | Comisión recurrente | Igual, por semestres: enero-junio en julio y julio-diciembre en enero. **Deducido** de «se hace así» y sin ver aún en una liquidación: la pantalla y el script lo avisan (`dato_provisional`) hasta que llegue la primera |
| **Mensuales** | **No es recurrente** | La comisión se toma anualizada y se cobra de una vez el mes siguiente al del efecto, «como si fuese una de ahorro». Es el Allianz Vida Riesgo (efecto el 1 de abril, cobrado en mayo). **Ya funciona así y no cambia**: tipo «Anualizada» |
| Anuales | Fuera de alcance | Facundo no los ha mencionado. El `check` de la 0002 no los admite |

Sus palabras: «cada trimestre, el mes siguiente. El de Allianz cobró el mes siguiente del efecto porque se cobró en forma mensual; al cobrarlo así, se toma como un cobro anual y ya, como si fuese una de ahorro. Pero en un seguro que se cobre trimestral o semestral, se hace así».

**En el RC Integral**, con efecto el 2026-06-01, la regla da lo que ya ha pasado: abril-junio en julio (cobrado, n.º 5), julio-septiembre en octubre (la n.º 6), y después enero, abril, julio…

La sesión principal escribe la regla en «Cuándo se cobra» de la nota de la consultoría de la bóveda (sección 11).

## 3. Lo que tiene que salir con los datos de hoy

| Qué | Antes | Después |
|---|---|---|
| Liquidación de octubre de 2026 (n.º 6) | La que espera hoy, sin la cuota | **140,28 €**, el documento: comisión 183,04 · RC 18,00 · neta 165,04 · IRPF 24,76 (sobre el total). Sube 2,58 € (3,04 de comisión menos 0,46 de IRPF) |
| Recuento de octubre | El de hoy | **«1 herramienta y 1 cuota · 91,52 u»** |
| Hucha, después de marcar la n.º 6 | 115,62 € | **133,62 €** (entra la RC del TopPlan, 18,00 €; la cuota no lleva) |
| Unidades para el nivel | 1.129,60 antes de noviembre | **Igual**: las cuotas cuentan 0 y el RC sigue contando sus 37 |
| Cuotas del RC programadas el 2026-11-01 | — | Julio-septiembre (cobro 2026-10), octubre-diciembre (2027-01) y enero-marzo (2027-04). La de abril-junio es la fila de julio |
| Clientes: herramientas del cliente del RC | 1 | **1**: una cuota no es una herramienta más |

## 4. Modelo de datos: `supabase/migraciones/0002_cuotas_recurrentes.sql`

**Solo añade.** No crea ninguna tabla nueva, no cambia «Ha llegado» ni «Deshacer» y no toca ningún dato. El código de hoy sigue funcionando después de ejecutarla: no escribe las columnas nuevas, que quedan nulas («no es recurrente»), y la vista conserva sus columnas, con dos más al final. Por eso **va antes que el código** (sección 10).

### 4.1 Lo que se para antes de cambiar nada
- Como en la 0001: si `to_regclass('public.perfiles')` no es nulo, es la base de FSM-Finance: `raise exception` y nada más
- Si `to_regclass('public.consultoria_herramientas')` es nulo, falta la 0001: `raise exception`

### 4.2 Columnas nuevas de `consultoria_herramientas`, al final y con `add column if not exists`

| Columna | Tipo | En qué fila | Qué es |
|---|---|---|---|
| `cuotas_cada_meses` | `smallint` | La herramienta (la serie) | 3 (trimestral) o 6 (semestral); nula = no es recurrente |
| `unidades_cuota` | `numeric(10,2)` | La herramienta | Lo que cobra cada cuota (el RC: 1,52) |
| `cuota_de` | `uuid` | La cuota | La herramienta de la que es cuota; nula en las demás |
| `cuota_periodo` | `date` | La cuota | El día 1 de su periodo natural: `2026-07-01` es julio-septiembre |

En una cuota, el resto de columnas sale de su herramienta, con estas diferencias:
- `aportacion`: nula (así no suma dos veces en el resumen de clientes);
- `unidades`: `unidades_cuota`;
- `unidades_nivel`: **0**, nunca nula, porque nula querría decir «las de `unidades`»;
- `pct_irpf`: el de Ajustes cuando se programa («la retención en vigor en cada momento»);
- `fecha_cobro`: la de la regla;
- `estado`: `prevista` si su herramienta lo está; si no, `confirmada`;
- `notas` y `origen`: nulos.

Copian el mes de producción y el efecto de su herramienta, como trae el documento de OVB la segunda cuota del RC (2026-05 y 2026-06-01). El €/unidad y la reserva son los de su herramienta: la del RC es 0.

### 4.3 Restricciones (en bloques `do` que miran `pg_constraint`, para poder repetirla)

> **Un `check` que da NULL deja pasar la fila.** Cada condición se escribe para no dar nunca NULL, con `is null`, `is not null` o `coalesce`. Lo revisa el `revisor-migraciones`.

- `consultoria_herramientas_serie`: `(cuotas_cada_meses is null) = (unidades_cuota is null)`, y si no es nula:
  - `cuotas_cada_meses in (3, 6)`;
  - `unidades_cuota > 0`;
  - `tipo_comision in ('sobre_recibo', 'sobre_saldo')`;
  - `aportacion_de is null and cuota_de is null`: ni una APEX ni una cuota son una serie
- `consultoria_herramientas_cuota`: `(cuota_de is null) = (cuota_periodo is null)`, y si no es nula:
  - `cuota_de <> id`;
  - `aportacion_de is null`;
  - `coalesce(unidades_nivel, -1) = 0`;
  - `unidades > 0`;
  - `extract(day from cuota_periodo) = 1`
- `consultoria_herramientas_cuota_fk`: `foreign key (cuota_de, consultor_id) references public.consultoria_herramientas (id, consultor_id) on delete restrict`. Como la de las APEX: nunca cuelga de otro consultor, y una herramienta con cuotas no se borra
- `create unique index if not exists consultoria_herramientas_cuota_unica on public.consultoria_herramientas (cuota_de, cuota_periodo)`:
  - una cuota por periodo, aunque se programe dos veces;
  - es el árbitro del `on conflict` de 4.5;
  - sirve de índice para la FK.
  
  Sin predicado: los NULL son distintos en un índice único (`NULLS DISTINCT` es lo de serie, postgresql.org/docs/current/sql-createindex.html), así que las filas que no son cuotas no chocan entre sí. Un índice único sin predicado se infiere en `on conflict (cuota_de, cuota_periodo)` (postgresql.org/docs/current/sql-insert.html)

### 4.4 Disparador: `consultoria_proteger_cuota()`
`before insert or update of cuota_de, cuota_periodo, cliente_id, cuotas_cada_meses`, `for each row`, `set search_path = public`. Los errores son P0001 en español, **con el producto y nunca con el cliente**:
- **Si es una cuota** (`new.cuota_de` no nulo), su herramienta:
  - existe y es del mismo consultor;
  - es del mismo cliente;
  - es una serie (`cuotas_cada_meses` no nulo);
  - no es a su vez una cuota.
  
  Al crearla, además, su herramienta no puede estar anulada: «“%” está anulada: no se programan más cuotas»
- **Una cuota cobrada** (`old.liquidacion_id` no nulo) no cambia de `cuota_de` ni de `cuota_periodo`
- **Una herramienta con cuotas**:
  - no deja de ser una serie («“%” tiene cuotas: anúlala para cortar las que faltan»);
  - no cambia de cliente, como pasa con las APEX.

Con `revoke execute … from public, anon, authenticated, service_role`, como los de la 0001.

### 4.5 Función: `consultoria_programar_cuotas`

```sql
consultoria_programar_cuotas(p_consultor uuid, p_herramienta uuid, p_periodos date[], p_cobros date[], p_pct_irpf numeric)
  returns integer   -- las cuotas que ha creado; 0 si ya estaban todas
```
`language plpgsql`, `security invoker` y `set search_path = public`. Los pasos:
1. Si `p_consultor` es nulo o no está en `consultoria_consultores`, `42501` («No hay consultor»), como en «Ha llegado»
2. Lee la herramienta `for update`, filtrando por `consultor_id`. Así, dos llamadas a la vez van una detrás de otra. Los errores:
   - si no está, P0002 («Esa herramienta no existe»);
   - si no es una serie, P0001 («“%” no se cobra en cuotas»);
   - si está anulada, P0001 («“%” está anulada: no se programan más cuotas»)
3. Comprueba lo que recibe, con P0001 si algo falla:
   - las dos listas, del mismo tamaño y sin nulos;
   - `p_pct_irpf`, entre 0 y 100;
   - cada periodo, día 1, alineado con su serie (`(extract(month from periodo)::int - 1) % cuotas_cada_meses = 0`) y no anterior al periodo que contiene el efecto;
   - cada cobro, el último día de un mes y no antes del mes siguiente al final de su periodo;
   - **de los periodos que aún no están guardados, ningún cobro en un mes que ya tiene liquidación**: «La cuota de % se cobraría en %, y esa liquidación ya llegó». Los ya guardados no se comprueban: se los salta el `on conflict`, aunque «no ha entrado» los haya movido de mes
   
   **La regla no se repite aquí**: solo se comprueba que lo que llega tiene sentido
4. `insert … select … from unnest(p_periodos, p_cobros) as c(periodo, cobro)`, copiando la herramienta como en 4.2:
   - deja fuera el periodo que ya cubre la propia herramienta (`unidades > 0` y el del efecto);
   - termina con `on conflict (cuota_de, cuota_periodo) do nothing`.
   
   Los disparadores de siempre siguen saltando: lo cobrado no se toca
5. Devuelve las filas creadas (`get diagnostics … row_count`)

Con `revoke execute on function … from public, anon, authenticated;` y `grant execute … to service_role;`. El `execute` de `public` no lo quita el `alter default privileges` de la 0001.

### 4.6 La vista `consultoria_lineas`
`create or replace view public.consultoria_lineas with (security_invoker = on) as …`, igual que en la 0001, con **`h.cuota_de` y `h.cuota_periodo` al final**. Postgres deja añadir columnas al final, y conserva el dueño y los permisos. Pero el `with (…)` se toma del comando nuevo, así que **`security_invoker = on` se vuelve a escribir** (postgresql.org/docs/current/sql-createview.html, «Notes»). Después, el `revoke all … from public, anon, authenticated, service_role` y el `grant select … to service_role` de la vista, que dejan lo mismo.

### 4.7 Lo que no cambia
- **Las funciones de «Ha llegado» (`consultoria_liquidar_mes`) y de «Deshacer» (`consultoria_deshacer_liquidacion`)**:
  - una cuota es una línea con `unidades > 0`, así que entra, pasa al mes siguiente con su motivo y vuelve a «confirmada» al deshacer, como cualquier otra;
  - su `cuota_periodo` no cambia al moverse, y por eso volver a programar no la duplica
- Las otras cuatro vistas:
  - en `consultoria_clientes_resumen`, una cuota no cuenta como herramienta ni suma aportación, porque tiene 0 para el nivel, pero sí suma en lo generado;
  - en `consultoria_hucha_movimientos`, su RC es 0;
  - `consultoria_liquidaciones_por_mes` las cuenta como líneas, y la pantalla no usa ese recuento
- **RLS y permisos**: no hay tablas nuevas. RLS sigue activo y sin políticas, y los `grant` de tabla de `service_role` cubren las columnas nuevas

### 4.8 Comprobaciones de la cabecera
Como las de la 0001: cada bloque por separado, en el editor SQL de `fsmtech`. Los bloques que escriben son `do` que acaban en error a propósito, así que no guardan nada. Usan meses de 2099 y el consultor que ya hay, y crean dentro el cliente «Prueba» y la compañía PLU si falta.
1. **Columnas**: `information_schema.columns` de las cuatro columnas → `smallint`, `numeric(10,2)`, `uuid` y `date`
2. **Permisos**:
   - `has_function_privilege` de `consultoria_programar_cuotas(uuid, uuid, date[], date[], numeric)`: `anon` false · `authenticated` false · `service_role` true;
   - el de `consultoria_proteger_cuota()`: false · false · false;
   - la consulta de permisos de la 0001 (bloque 1) sigue sin filas para otros roles;
   - `select reloptions from pg_class where oid = 'public.consultoria_lineas'::regclass` → `{security_invoker=on}`
3. **Como el panel** (`set local role service_role`), con una serie de prueba (PLU, sobre recibo, 0 u para cobrar, 37 para el nivel, trimestral, 1,52 por cuota, 2 €/u, sin hucha, IRPF 15, efecto 2099-04-01):
   1. programar abril-junio, julio-septiembre y octubre-diciembre (cobros 2099-07-31, 2099-10-31 y 2100-01-31) → 3;
   2. programarlas otra vez → 0;
   3. una cuota → bruto 3.04 · hucha 0.00 · irpf 0.46;
   4. «Ha llegado» de 2099-07 con esa cuota → cobrada; «Deshacer» → confirmada;
   5. «Ha llegado» de 2099-10 sin marcar su cuota → pasa a 2099-11-30 y conserva su periodo. Programar otra vez las tres → 0, sin error: la movida ya está guardada y no se vuelve a comprobar;
   6. programar una cuota cuyo mes ya está liquidado → parada;
   7. una cuota con `unidades_nivel` nula → parada (el `check`);
   8. una serie con `unidades_cuota` nula → parada (el `check`);
   9. una cuota de una herramienta que no es serie → parada (el disparador);
   10. quitar la serie a una herramienta con cuotas → parada;
   11. borrar una herramienta con cuotas → parada (`23503`, `consultoria_herramientas_cuota_fk`);
   12. anularla y programar → parada («está anulada»)
4. **`anon` y `authenticated` no ejecutan la función**: `set local role anon`, y luego `authenticated`, con `begin … exception when insufficient_privilege` → rechazado en los dos

El resultado esperado de cada bloque, escrito debajo, como en la 0001.

## 5. Las reglas: `lib/consultoria/reglas.ts`

Sin importaciones en tiempo de ejecución, solo sintaxis que se pueda borrar, importes en enteros y `??` en los porcentajes, como manda el `CLAUDE.md`.

```ts
/** Cada cuántos meses cobra una comisión recurrente: trimestral o semestral. Los recibos mensuales no: van anualizados, de una vez */
export type CuotasCadaMeses = 3 | 6;
export const CUOTAS_CADA_MESES: readonly CuotasCadaMeses[] = [3, 6];
/** Se guardan las cuotas que se cobran hasta este número de meses después del de hoy */
export const MESES_DE_CUOTAS_POR_DELANTE = 6;

/** El día 1 del trimestre o del semestre natural que contiene la fecha: 2026-05-15 → 2026-04-01 (trimestral) */
export function periodoNatural(fecha: string, cadaMeses: CuotasCadaMeses): string;
/** La regla de Facundo (2026-11-01): el último día del mes siguiente al último mes del periodo. 2026-04-01 → 2026-07-31; 2026-10-01 → 2027-01-31 */
export function cobroDeLaCuota(periodo: string, cadaMeses: CuotasCadaMeses): string;

export interface SerieDeCuotas {
  fechaEfecto: string;
  cuotasCadaMeses: CuotasCadaMeses;
  /** La herramienta cobra ella misma la cuota de su primer periodo (`unidades > 0`): la del RC de antes */
  laFirmaCobraLaPrimera: boolean;
}
export interface CuotaDeLaSerie {
  numero: number;    // 1 = la del periodo del efecto
  periodo: string;   // día 1 del periodo
  fechaCobro: string; // último día del mes de cobro
}

/** Las de la serie, de la primera a la última que se cobra hasta `hasta` (un mes, incluido) */
export function cuotasDeLaSerie(serie: SerieDeCuotas, hasta: string): CuotaDeLaSerie[];

/**
 * Las que hay que guardar: las de la serie hasta `hasta` que no están en `guardadas` (sus
 * `cuota_periodo`), sin la de la propia firma si la cobra ella. Las que se cobrarían antes de
 * `desde` (el mes siguiente a la última liquidación que llegó) no se guardan: van en `sinProgramar`,
 * con el aviso `cuotas_sin_programar`. Con 6 meses (semestral), el aviso `dato_provisional` de la regla deducida
 */
export function cuotasQueFaltan(
  serie: SerieDeCuotas,
  opciones: { desde: string | null; hasta: string; guardadas: string[] },
): { cuotas: CuotaDeLaSerie[]; sinProgramar: CuotaDeLaSerie[]; avisos: Aviso[] };

/** Al anular el día `anuladaEl`: las que se cortan, sin cobrar y de un periodo que empieza después */
export function cuotasQueSeCortan<T extends { periodo: string; cobrada: boolean }>(cuotas: T[], anuladaEl: string): T[];
```

- Un `cadaMeses` que no sea 3 o 6 es un error de programación: `RangeError`. Quien llama valida antes
- `CodigoAviso` gana `"cuotas_sin_programar"`
- **`proponerFirma`**: `EntradaFirma` gana `cuotasCadaMeses?: CuotasCadaMeses`. Con ella, `fechaCobro` es la de la primera cuota (`cobroDeLaCuota(periodoNatural(efecto))`), en vez del mes siguiente al efecto. Efecto el 2026-04-01: julio, no mayo. Si es semestral, lleva además el aviso de la regla deducida. Sin ella, todo sale igual que hoy
- **El recuento**:
  - `LineaParaContar` gana `cuotaDe?: string | null`, y `RecuentoDelMes`, `cuotas: number`. Una línea con `cuotaDe` cuenta como cuota, no como herramienta. La herramienta que cobra su primera cuota cuenta como herramienta, así que julio sigue diciendo «3 herramientas»;
  - `textoDeHerramientas` junta hasta tres partes: «1 herramienta y 1 cuota», «2 cuotas», «4 herramientas, 1 APEX y 2 cuotas»;
  - **sin cuotas, todo sale exactamente igual que hoy**: las pruebas de `apex.test.mjs` no se tocan, y los tipos que reciben `cuotas` lo aceptan opcional (`?? 0`).

### 5.1 Pruebas: `lib/consultoria/cuotas.test.mjs` (nuevo)
`node:test`, sin dependencias. `npm test` lo recoge solo, y las 105 de hoy siguen en verde sin cambiar.
- **Los cuatro trimestres**:
  - del 2026-04-01 al 2026-06-30 (días 1, 15 y 30, el último del mes) → 2026-07-31;
  - julio-septiembre → 2026-10-31;
  - octubre-diciembre → **2027-01-31** (el paso de año);
  - enero-marzo → 2026-04-30
- **Los dos semestres**: 2026-03-01 → 2026-07-31; 2026-09-01 → 2027-01-31, con el aviso de la regla deducida
- **Un efecto que no cae en el último mes**: el 2026-04-01 trimestral cobra la primera en **julio**, no en mayo (`proponerFirma`). Sin `cuotasCadaMeses`, la misma firma sale en mayo, como hoy
- **El RC** (efecto 2026-06-01, trimestral, la firma cobra la primera, `desde` 2026-08, `hasta` 2027-05):
  - salen julio-septiembre (2026-10-31), octubre-diciembre (2027-01-31) y enero-marzo (2027-04-30);
  - sin avisos
- **No duplica**: con `guardadas` = `["2026-07-01"]`, salen solo las dos siguientes; con las tres, ninguna
- **Lo de antes de `desde`**: una cuota de agosto con `desde` 2026-09 va a `sinProgramar`, con su aviso
- **Anular**:
  - el 2026-11-15 se cortan las de enero-marzo y abril-junio de 2027, y se queda la de octubre-diciembre;
  - el 2027-01-01 se queda también enero-marzo, porque su periodo empieza ese día;
  - una cobrada no se corta nunca
- **El redondeo**: `calcularImportes(1.52, 2, 0, 15)` → 3.04 · 0 · 0.46 · 2.58. Y **la n.º 6**: `calcularLiquidacion` del TopPlan (180 · 18 · 15) y la cuota (3.04 · 0 · 15) → comisión 183.04, RC 18, neta 165.04, IRPF 24.76 e importe **140.28**
- **El nivel**: `unidadesAcumuladas`, con la herramienta (0 u y 37 para el nivel) y tres cuotas (1,52 u y 0 para el nivel) → 37
- **El recuento**:
  - `recuentoDelMes` de una herramienta y una cuota → `{ herramientas: 1, apex: 0, cuotas: 1, previstas: 0 }`;
  - los textos de 5.1, también en la casilla: «1 herramienta y 1 cuota»;
  - una cuota prevista cuenta en las previstas
- **`RangeError`** con `cadaMeses` 1 o 12, y con una fecha mal escrita

## 6. Contratos

### 6.1 `lib/consultoria/tipos.ts`
```ts
export type MigracionQueFalta = "0001" | "0002";

// Herramienta, cuatro campos más
cuotasCadaMeses: CuotasCadaMeses | null;  // es una serie
unidadesCuota: number | null;
cuotaDe: string | null;                   // es una cuota
cuotaPeriodo: string | null;
/** En una cuota, su herramienta, para «Cuota de RC Integral» con su enlace; null en las demás */
serieDe: { id: string; producto: string } | null;

// HerramientaConAportaciones, dos más
/** Sus cuotas guardadas, por periodo; vacío si no es una serie */
cuotas: Herramienta[];
/** Solo lo rellena `herramienta()`, para su página; null en las listas */
serie: SerieVista | null;

export interface SerieVista {
  cadaMeses: CuotasCadaMeses;
  unidadesCuota: number;
  brutoCuota: number;          // unidadesCuota × €/unidad, como la base
  pctHucha: number;
  /** La de la propia firma (si la cobra), las guardadas y las que se programarán hasta 12 meses después de hoy, por periodo */
  cuotas: CuotaVista[];
  /** Las que deberían estar guardadas (hasta seis meses después de hoy) y no lo están: el botón «Programar» */
  faltanPorProgramar: number;
  /** Las de antes de la última liquidación que no se guardaron: «si llegó, apúntala a mano» */
  sinProgramar: CuotaDeLaSerie[];
  avisos: Aviso[];
}
export interface CuotaVista {
  numero: number;
  periodo: string;
  fechaCobro: string;
  /** La fila (la cuota, o la herramienta si es su primera); null = aún sin guardar */
  herramientaId: string | null;
  estado: EstadoHerramienta | "sin_programar";
  liquidacionId: string | null;
  bruto: number;
  /** «No ha entrado» la movió: su cobro es posterior al de la regla */
  retrasada: boolean;
  /** Es la propia herramienta: la del RC de antes */
  esLaFirma: boolean;
}

// LineaLiquidacion, dos más
cuotaDe: string | null;
cuotaPeriodo: string | null;

// MesLiquidacion, una más
cuotas: number;   // el recuento: «1 herramienta y 1 cuota»

// FirmaAGuardar, dos más. Sin decir (undefined), no se tocan; null quita la serie (si no tiene cuotas)
cuotasCadaMeses?: CuotasCadaMeses | null;
unidadesCuota?: number | null;
```

### 6.2 `lib/consultoria/consultas.ts`
- `COLUMNAS_HERRAMIENTA` y `FilaHerramienta`, con las cuatro columnas. La vista de líneas, con `cuota_de` y `cuota_periodo`
- **`comprobar`**: un `42703`, `PGRST204` o `PGRST202` que nombre una columna nueva o `consultoria_programar_cuotas` → `FaltaLaMigracion("0002")`. `FaltaMigracion` dice «ejecuta la 0002»
- **`herramienta(consultorId, id, hoy)`**: `hoy` es nuevo y lo pasa la página, con `hoyEnMadrid()`
  - en una serie, `cuotas` (las de `cuota_de = id`) y `serie`. Este sale de `cuotasDeLaSerie(…, hoy + 12)`, junto a lo guardado:
    - `faltanPorProgramar`, con `cuotasQueFaltan(…, hasta: hoy + 6)`;
    - `desde`, el mes siguiente a la última liquidación de `cargarMeses`;
  - en una cuota, `serieDe`
- **`produccion()`**: **sin las cuotas**, ni en las filas ni en los totales (`.is('cuota_de', null)`). Si no, la producción de mayo de 2026 crecería con cada trimestre. `madresPosibles` se queda sin ellas por lo mismo
- **`fichaDeCliente()`**: las cuotas, dentro de su herramienta (`cuotas`) y no sueltas, como las APEX. `sePuedeBorrar` no cambia
- **`cargarMeses()`**: `cuotaDe` y `cuotaPeriodo` en cada línea, y `cuotas` en el recuento de cada mes
- Lo demás (Resumen, hucha, cuenta, liquidaciones del año, contexto de las reglas) no cambia: las cuotas ya están en las líneas

### 6.3 `lib/consultoria/acciones.ts`
Todas como hasta ahora: `verificarSesion()` fuera del `try` y `unstable_rethrow`, el filtro por `consultor_id`, nada con `fuente_desde` nulo, y en el log, solo `code` y `message`.

**Un ayudante interno, `programar(supabase, consultorId, { herramientaId?, hoy })`**:
1. Lee las series sin anular (`cuotas_cada_meses` no nulo, de una o de todas), los `cuota_periodo` de sus cuotas, la última liquidación (`max(mes)` de `consultoria_liquidaciones`) y el IRPF de Ajustes (`contexto()`)
2. Calcula `cuotasQueFaltan`:
   - `desde`: el mes siguiente a esa liquidación;
   - `hasta`: el mes de hoy más `MESES_DE_CUOTAS_POR_DELANTE`
3. Llama, por serie con algo que guardar, a `rpc('consultoria_programar_cuotas', { p_consultor, p_herramienta, p_periodos, p_cobros, p_pct_irpf })`. Las listas van como los `uuid[]` de «Ha llegado»: un array de JSON es un array de Postgres
4. Devuelve `{ programadas, sinProgramar, meses }`

| Acción | Qué cambia | Mensajes |
|---|---|---|
| **`programarCuotas(herramientaId?: string): Promise<Resultado>`** (nueva) | El ayudante, de una serie o de todas | ok: «Programadas 2 cuotas: octubre de 2026 y enero de 2027.» o «No faltaba ninguna.»; los errores de la función tal cual (P0001/P0002, `conPunto`) |
| **`guardarFirma`** | Valida `cuotasCadaMeses` (`unoDe` 3 o 6) y `unidadesCuota` (`cantidad` mayor que 0): las dos o ninguna. Además:<br>• solo con `sobre_recibo` o `sobre_saldo`;<br>• ni con `aportacionDe` ni en una cuota;<br>• **una serie nueva lleva 0 u para cobrar**.<br>Al cambiar una que ya tiene unidades para cobrar (el RC), se quedan: es su primera cuota.<br>Después de guardar una serie:<br>• si es nueva, o le cambian `cuotasCadaMeses` o el efecto, borra las cuotas sin cobrar y llama a `programar` de esa serie;<br>• si solo cambia `unidadesCuota`, actualiza las `unidades` de las que no se han cobrado;<br>• si pasa de prevista a otro estado, o al revés, actualiza el de sus cuotas sin cobrar.<br>Una cuota se puede cambiar como cualquier herramienta (las unidades de un trimestre, sus notas), pero no se le pone serie | «Elige cada cuánto cobra: trimestral o semestral.» · «Pon las unidades que cobra cada cuota: tienen que ser mayores que cero.» · «Solo una comisión sobre recibo (o sobre saldo) cobra en cuotas. Si el recibo es mensual, la comisión va anualizada, de una vez: elige “Anualizada”.» · «Una cuota no lleva serie: la serie es la de su herramienta.» · «Una serie nueva no cobra en la firma: cada periodo es su cuota. Deja a 0 las unidades para cobrar.» · ok: «Firma apuntada, con 3 cuotas programadas.» |
| **`marcarLiquidacion`** | Después de la `rpc`, el ayudante de todas las series | ok: «Liquidación apuntada.», y si se programa alguna, « Programadas N cuotas.». Si falla: «Liquidación apuntada, pero no se han podido programar las próximas cuotas: hazlo desde su herramienta.» |
| **`anularHerramienta`** | Si es una serie, después de anularla borra sus cuotas sin cobrar con `cuota_periodo > anulada_el` (`.delete().eq('cuota_de', id).is('liquidacion_id', null).gt('cuota_periodo', anuladaEl)`). El extorno, como hoy | ok: «… Se han cortado 2 cuotas sin cobrar.» Si falla el borrado: «Anulada, pero no se han podido cortar sus cuotas: bórralas desde la herramienta.» |
| **`borrarHerramienta`** | Si es una serie: con alguna cuota cobrada, no se borra; si no, borra antes sus cuotas y después ella | «Tiene cuotas cobradas: anúlala.» · `consultoria_herramientas_cuota_fk` → «Tiene cuotas: bórralas antes.» (hoy un `23503` dice «Tiene un extorno»: hay que distinguirlo por la restricción) |
| `deshacerLiquidacion`, el resto | Nada | — |

Se añaden a `RESTRICCIONES` los mensajes de `consultoria_herramientas_serie` y `consultoria_herramientas_cuota`.

### 6.4 Los scripts
- **`consultoria-firma.mjs`**: dos opciones nuevas, `--cuotas trimestral|semestral` y `--unidades-cuota N`
  - Con `--cuotas`:
    - el tipo, el del producto (RC Integral: `sobre_recibo`), que tiene que ser sobre recibo o sobre saldo;
    - `--unidades`, 0 o sin dar (si no, para: «con --cuotas la firma no cobra…»);
    - `--unidades-nivel`, obligatoria;
    - el cobro, el de la primera cuota (`proponerFirma` con `cuotasCadaMeses`)
  - **La vista previa** añade:
    - «Cuotas: 1,52 u (3,04 €) cada trimestre, sin hucha»;
    - «Se programan: 2026-07 (abril-junio) · 2026-10 · 2027-01»;
    - el aviso de los semestrales, si lo es;
    - la línea de la casilla del mes de la primera cuota, «con esta firma», con su cuota
  - **Con `--guardar`**: inserta la herramienta, después llama a `consultoria_programar_cuotas` con `cuotasQueFaltan` (como el ayudante de 6.3) y escribe «✓ Guardada, con N cuotas programadas»
  - Las cuotas guardadas no salen en `suyas`: ni son una firma repetida ni pueden ser la herramienta de una APEX (filtro `cuota_de` nulo)
  - Sin la 0002, la vista previa de las firmas normales funciona igual, y `--cuotas` para con «Falta la migración 0002»
- **`consultoria-comun.mjs`**:
  - `leerLineasGuardadas` lee también `cuota_de` (si la 0002 está);
  - `herramientasDeLaCasilla` cuenta las cuotas («1 herramienta y 1 cuota · 91,52 u»), y sin cuotas sale como hoy;
  - `AVISO_MIGRACION_0002`
- `consultoria-importar` y `consultoria-cierres`, igual. `consultoria-copiar` enseñará «DISTINTO» en las herramientas, por las columnas nuevas: es lo esperado, y ese script se retira con la 13.1 de REQ-001

## 7. Las pantallas

Con las reglas de aspecto del `CLAUDE.md`:
- los estados, con icono y texto;
- 44 px como mínimo en lo que se toca;
- sin colores fijos;
- nada que ensanche la página a 390 px;
- todo legible en modo oscuro.

| Dónde | Qué se ve |
|---|---|
| **La página de una serie** (`FichaHerramienta`) | Una sección **«Cuotas»** debajo de los datos:<br>• «Cobra cada trimestre: 1,52 u (3,04 €) por cuota, sin hucha». Si la cobra ella: «La primera, la de abril-junio, es esta firma»;<br>• una fila por cuota: el periodo («julio-septiembre de 2026»), el mes de cobro, el importe y el estado (`EstadoHerramienta`). Cada una lleva a su página, y las cobradas, a su liquidación (`enlaceAlMes`);<br>• las que aún no están guardadas, «Se programará», con el borde discontinuo de las previstas (`PREVISTA`) y su texto;<br>• una retrasada: «No entró en octubre: se espera en noviembre», con `Aviso`;<br>• con `faltanPorProgramar > 0`, el botón **«Programar las que faltan (N)»** (`programarCuotas(h.id)`). Con `sinProgramar`, un aviso: «La de … no se ha programado porque su mes ya está liquidado: si llegó, apúntala a mano»;<br>• anulada: «Anulada el …: no se programan más cuotas».<br>En la cabecera, junto al tipo de comisión, «Recurrente · trimestral» |
| **La página de una cuota** | Debajo del producto: «**Cuota de julio-septiembre de 2026** de [RC Integral]», con el enlace a su herramienta. Sin «Libre de extorno» (no es suyo). Las acciones de siempre: cambiar, anular y, si no se ha cobrado, borrar |
| **«Nueva firma» y «Cambiar»** (`FormularioFirma`) | Con el tipo «Sobre recibo» (o «Sobre saldo»), una pregunta más en Unidades: **«¿Cobra cada periodo?»**, con *No* · *Trimestral* · *Semestral*. Debajo, en texto tenue: «Si el recibo es mensual, la comisión va anualizada, de una vez: elige el tipo “Anualizada”».<br>Con *Trimestral* o *Semestral*:<br>• los campos son «Unidades por cuota» y «Unidades para el nivel»; las de cobrar en la firma desaparecen (son 0);<br>• en Fechas: «Primera cuota: julio de 2026 (abril-junio); después, cada trimestre: octubre, enero, abril…» (`cuotasDeLaSerie`);<br>• si es semestral, el aviso de la regla deducida.<br>**Al cambiar una que ya cobró su primera cuota** (el RC), las unidades para cobrar se quedan, de solo lectura: «Esta firma ya cobró la cuota de abril-junio: las siguientes se programan solas».<br>**En una cuota**, el bloque no sale; sale «Es la cuota de julio-septiembre de RC Integral» |
| **Anular** (`AnularHerramienta`) | En una serie, antes de confirmar, con `cuotasQueSeCortan`: «Se corta 1 cuota sin cobrar: enero-marzo de 2027». Y si queda alguna: «Sigue pendiente la de octubre-diciembre: su periodo empezó antes de la anulación. Si no llega, bórrala» |
| **«Ha llegado»** y **el detalle del mes** (`HaLlegado`, `DetalleLiquidacion`) | La línea de una cuota: «RC Integral · cuota jul-sep», con una insignia de texto «Cuota», como `InsigniaApex`. **Marcada de serie** si está confirmada, como las demás |
| **Liquidaciones** y **Resumen** | El recuento de cada mes, con `textoDelRecuento`: «1 herramienta y 1 cuota · 91,52 u». Las cuotas futuras, en lo previsto de su mes. El Resumen enseña hasta el último mes con algo previsto, como mucho 12: con seis meses de cuotas por delante, su ventana llega hasta abril de 2027 y deja de verse el principio de 2026. Es lo esperado (sección 13) |
| **Producción** (`TablaProduccion`) | Sin las cuotas. La serie lleva debajo del producto «Recurrente · trimestral», en texto |
| **La ficha del cliente** (`TarjetaHerramienta`) | La serie, con «Recurrente · trimestral · 2 cuotas cobradas». Las cuotas no salen sueltas |
| **`FaltaMigracion`** | Sabe decir «ejecuta la 0002» |

## 8. Cómo entran el RC y la n.º 6 (después de publicar)

Sin migrar ningún dato: lo hace Facundo en el panel, y así se prueba el camino entero.

1. **La página del RC Integral → «Cambiar»**: «¿Cobra cada periodo?» *Trimestral*, con 1,52 unidades por cuota. Lo demás no cambia: el estado sigue «Cobrada», y las unidades (1,52), la reserva (0) y el cobro (julio) son los mismos, así que el disparador de lo cobrado no salta.
2. Al guardar se programan julio-septiembre (cobro en octubre), octubre-diciembre (enero) y enero-marzo (abril), con 1,52 u, 0 para el nivel, sin hucha e IRPF 15. La fila de julio es la cuota de abril-junio.
3. **Liquidaciones, octubre**: 140,28 €, «1 herramienta y 1 cuota · 91,52 u». Si no sale eso, se para y se mira antes de marcar.
4. **«Ha llegado»** de octubre: fecha 2026-10-28, n.º 6, recibidos 140,28 €, con las dos líneas marcadas. La hucha queda en 133,62 €.
5. **La casilla de octubre de OVB** ya está marcada con 140,28 € y `— cobrado 2026-10-28`. El importe es el mismo, así que **no hace falta tocarla**: el texto «2 herramientas» se puede quedar, porque Economía solo lee el importe.

**Plan B** si algo sale mal entre el paso 1 y el 4:
- en la página del RC: borrar sus cuotas sin cobrar y quitarle la serie (el disparador lo deja sin cuotas);
- en el editor SQL, las dos sentencias juntas, en una sola ejecución (corregido por el `revisor-migraciones`: el disparador salta con cualquier rol, también con `postgres`, así que mientras la serie tenga cuotas no se le puede quitar la serie; primero se borran las cuotas sin cobrar):
  ```sql
  delete from public.consultoria_herramientas
   where cuota_de = '3146870c-bedc-4ac4-975c-76de6fbabce2' and liquidacion_id is null;
  update public.consultoria_herramientas
     set cuotas_cada_meses = null, unidades_cuota = null
   where id = '3146870c-bedc-4ac4-975c-76de6fbabce2';
  ```
  Ese `id` es el del RC Integral en `fsmtech` (no es un dato personal). Si ya hay alguna cuota cobrada (después de la n.º 6), el `update` se para: antes hay que deshacer esa liquidación.

Nada de eso toca la fila de julio ni la n.º 5.

**El orden importa**: primero convertir el RC y después «Ha llegado» de la n.º 6. La función no programa una cuota cuyo mes de cobro ya tiene liquidación, así que si se marca octubre antes, la cuota de julio-septiembre habría que apuntarla a mano.

**Pendiente opcional (para una 0003)**: que el disparador compruebe también que el periodo de una cuota encaja con su serie (hoy solo lo comprueba `consultoria_programar_cuotas`; un `insert` a mano podría guardar un periodo que no empieza trimestre). Lo propuso el `revisor-migraciones` el 2026-11-01.

## 9. Generalidad y lo que no entra

- **Trimestral y semestral**: entran con el mismo código. El semestral, con su aviso de regla deducida hasta la primera liquidación
- **Mensual**: no es recurrente (sección 2). Va como hoy: anualizada, de una vez. Por eso el `check` no admite 1
- **Fuera**:
  - **los recibos anuales**: Facundo no los ha mencionado, y ampliar el `check` es una migración pequeña;
  - **las comisiones sobre saldo de importe variable** (AVANZA): la serie da una cuota fija. Se puede usar con una estimación y cambiar cada cuota cuando llegue, pero no es lo pensado;
  - **el Allianz de los años siguientes** (anualizado el primero y sobre recibo después): sería una serie que empieza en el segundo año, y se apunta a mano si llega;
  - el extorno de las cuotas cobradas al anular la serie: si OVB lo cobrara, se anula esa cuota con su extorno, como cualquier herramienta;
  - reprogramar las pendientes si cambia la regla: con «Cambiar», al cambiar `cuotasCadaMeses`;
  - avisos en Hoy («una cuota no ha llegado»);
  - que Economía lea la base (13.4 de REQ-001)
- **Lo que ya pasa hoy y no cambia**: una herramienta anulada deja de contar sus unidades para el nivel en todos los meses, también los de antes. Con una serie anulada a los dos años, sus 37 u desaparecen del acumulado. Es así para todas las anulaciones desde FSM-Finance; si OVB no lo hace así, es otro requerimiento

## 10. El plan, por pasos y por agente

Horas de agente: unas 14. Con el paralelo, unas 8 de reloj. De Facundo, unos 45 minutos en tres momentos (F1 a F3).

| Paso | Quién | Qué hace | Archivos | Depende de | Cómo se sabe que está bien |
|---|---|---|---|---|---|
| 1 | `backend` | La 0002 de la sección 4, con sus comprobaciones y el resultado esperado de cada una | `supabase/migraciones/0002_cuotas_recurrentes.sql` | — | • Ejecutarla dos veces deja lo mismo<br>• Ningún dato<br>• Ninguna línea de `liquidar_mes` ni de `deshacer` cambia<br>• Ningún `check` puede dar NULL con datos válidos o inválidos |
| 2 | `revisor-migraciones` | Revisa la 0002 contra la base con datos reales (solo lee) | la 0002 | 1 | Visto bueno o cambios, sin ejecutar nada |
| **F1** | Facundo | Ejecuta la 0002 en el editor SQL de `fsmtech` y las comprobaciones de 4.8. **Puede ir ya**: el código de hoy sigue funcionando | editor SQL | 2 | • Los resultados esperados de 4.8<br>• `/consultoria` en producción igual que antes, con octubre como ahora |
| 3 | `backend` | Lo de la sección 5 y sus pruebas (`cuotas.test.mjs`), y lo de la 6 | `lib/consultoria/{reglas,tipos,validar,consultas,acciones}.ts`, `lib/consultoria/cuotas.test.mjs`, `scripts/consultoria-{firma,comun}.mjs` | 1 (los nombres). Para ver datos en local, F1 | • `npm test`: las 105 de hoy y las nuevas, en verde, sin tocar las de hoy<br>• `npx tsc --noEmit` y `npm run lint` limpios<br>• `grep -r SUPABASE_SECRET_KEY app components lib` solo da `lib/base/cliente.ts`<br>• `consultoria:firma` en vista previa con `--compania PLU --producto "RC Integral" --cuotas trimestral --unidades-cuota 1.52 --unidades-nivel 37 --efecto 2027-04-01 …`: primera cuota en 2027-07, sin `--guardar` |
| 4 | `frontend` | La sección 7. Puede empezar con los tipos de 6.1 mientras el `backend` acaba | `components/consultoria/{FichaHerramienta,FormularioFirma,AnularHerramienta,HaLlegado,DetalleLiquidacion,TablaProduccion,TarjetaHerramienta,FaltaMigracion,formato}.ts(x)`, una `InsigniaCuota.tsx`, `app/(panel)/consultoria/produccion/[id]/page.tsx` (`hoy` a `herramienta()`) | 3 para compilar | • `npm run build` limpio<br>• Con la base real, tras F1, en `npm run dev` y **sin guardar nada**: la página del RC ofrece «¿Cobra cada periodo?»; Producción no cambia; octubre, como hoy<br>• A 390 px nada ensancha la página, también la lista de cuotas y «Ha llegado»<br>• Modo oscuro legible<br>• La lista de qué mirar, para Facundo |
| 5 | Sesión principal | `npm test`, `tsc`, lint y build. La skill `web-design-guidelines` sobre lo nuevo. Revisa que ninguna acción nueva escriba sin `verificarSesion()` fuera del `try` | — | 3 y 4 | Todo lo anterior. Ningún nombre de cliente en código, pruebas ni mensajes de error |
| 6 | `guardian-docs` | Pone al día:<br>• `CLAUDE.md`: el comando de la firma con `--cuotas` y `--unidades-cuota`, y en Estructura, `cuotas.test.mjs`;<br>• `docs/base-de-datos.md`: la 0002;<br>• la consultoría en `docs/arquitectura.md`;<br>• la sección 11 de la spec de REQ-001: la «tarea 4», el recibo con `--repetida`, la sustituye REQ-002;<br>• y la nota del proyecto | docs del panel | 5 | Nada contradice al código |
| — | Sesión principal | Commits en `req-002-comisiones-recurrentes`, `feat(consultoria): … [REQ-002]` | — | 6 | — |
| **F2** | Facundo | Fusiona en `main` y hace push: Vercel lo publica | — | 5, 6 y F1 | `/consultoria` en producción sin «falta la 0002» |
| **F3** | Facundo, con la sesión principal | La sección 8: el RC pasa a ser una serie, octubre queda en 140,28 € y «Ha llegado» de la n.º 6 | el panel | F2 | Las cifras de la sección 3 |
| — | Sesión principal | En la bóveda (sección 11). El `seguimiento` y el estado del REQ-002, y la diaria | notas | F3 | — |

**El orden importa**: la 0002 antes que el código (F1 antes de F2). El código nuevo lee columnas que sin ella no existen, y la sección diría «ejecuta la 0002». El código de hoy, con la 0002 ya ejecutada, sigue igual.

## 11. Lo que hace cada uno fuera del código

- **Facundo**:
  - ejecutar la 0002 (F1) después del `revisor-migraciones`;
  - el push (F2);
  - la conversión del RC y «Ha llegado» de la n.º 6 (F3).
  
  Sin variables nuevas ni nada que crear en Supabase o en Vercel
- **La sesión principal, en la bóveda** (los agentes no escriben allí):
  - **la nota de la consultoría**, «Cuándo se cobra»: la regla de la sección 2, también lo de los mensuales, y el semestral como deducido. **Contradicción que hay que quitar**: hoy dice que el recibo de septiembre «va en el panel como una herramienta más del cliente, con `--repetida`», y eso es lo que REQ-002 sustituye;
  - **`C:\brain\CLAUDE.md`**, el párrafo de «Cuando llega la liquidación de OVB»: «Con ella se apunta el recibo de septiembre del RC Integral: 1,52 u para cobrar y 0 para el nivel» pasa a decir que entra como cuota de su serie (sección 8). Y en la regla de las firmas, que un seguro trimestral o semestral se apunta con `--cuotas`;
  - el cuadro de comisiones de la bóveda, en el RC: «el mes siguiente a su trimestre natural»;
  - el requerimiento: `estimacion_horas: 14`, su estado y el seguimiento.

## 12. Protección de datos

| Sitio | Qué se hace |
|---|---|
| La función nueva y el disparador | Sus mensajes dicen el producto y el periodo, nunca el cliente |
| El log del panel | Solo `code` y `message`, como hasta ahora |
| Las cuotas | Son filas del mismo cliente que su herramienta: ningún dato nuevo, y el `check` de clientes sigue sin columnas personales |
| La casilla de OVB | La línea sin nombres de siempre, con «y 1 cuota» |
| El script de la firma | Su salida ya llevaba el nombre. Las líneas nuevas (cuotas y casilla) no lo repiten. Se lee en la terminal |
| Pruebas, ejemplos y este documento | Clientes inventados. De la n.º 6, solo totales |
| Caché | Nada nuevo en caché: `cache()` de React por petición |

## 13. Riesgos

| Riesgo | Plan B |
|---|---|
| Se publica el código antes de ejecutar la 0002 | La sección dice «ejecuta la 0002»: se ejecuta. Si después de ejecutarla PostgREST sigue sin ver las columnas, `notify pgrst, 'reload schema';` en el editor SQL (docs.postgrest.org/en/stable/references/schema_cache.html). Lo normal es que se recargue solo, con su disparador de DDL |
| No hay base de pruebas: `npm run dev` lee la base de verdad | Los agentes no guardan nada. Lo que escribe se prueba con los bloques de 4.8, que se deshacen solos, y con las pruebas de las reglas. La primera escritura de verdad es la conversión del RC (F3), con su plan B (sección 8) |
| Programar después de «Ha llegado» falla: no va en la misma transacción | La liquidación queda bien, el mensaje lo dice y el botón de la herramienta lo repite; no duplica. Con seis meses por delante, hay margen de sobra |
| Una cuota no llega y pasa de mes en mes | Como cualquier línea. La página de la serie la enseña «retrasada»; si no va a llegar, se borra o se anula |
| El `check` deja pasar una fila por un NULL | La sección 4.3 lo avisa, los bloques 7 y 8 de 4.8 lo prueban y el revisor lo mira |
| `create or replace view` sin el `with` quitaría `security_invoker` | Se vuelve a escribir, y el bloque 2 de 4.8 lo comprueba |
| El Resumen enseña menos meses del principio del año | Es la ventana de doce meses de siempre, que llega más lejos. Si molesta, `barrasDe` se limita a tres meses por delante (una línea) |
| La regla semestral deducida no es la buena | Se ve con la primera liquidación de un semestral. Se cambia `cobroDeLaCuota` y sus pruebas, y las pendientes se reprograman con «Cambiar». Hoy no hay ninguna |
| Al cambiar cada cuánto cobra una serie o su efecto, se borran sus cuotas sin cobrar y se vuelven a programar: una que «no entró» y se movió a un mes posterior vuelve al de su regla, y si ese mes ya está liquidado, no se programa | Sale en «sin programar» y se apunta a mano. Cambiar la frecuencia o el efecto de una serie con cuotas es raro; si pasa, se mira antes en su página qué hay pendiente |
| Una serie programada tarde, con el mes de su primera cuota ya liquidado | No se programa (la función lo para): sale como «sin programar» y se apunta a mano si llegó. El orden normal es apuntar la firma antes de marcar «Ha llegado» |

## 14. Decisiones de Facundo

1. **Si un cliente cancela a mitad de un periodo, ¿llega la cuota de ese periodo?** Por ejemplo, cancela el 15 de noviembre: ¿llega en enero la de octubre-diciembre? **Decidido el 2026-11-01, de forma provisional**: Facundo no lo sabe y se informará. Mientras, como recomendaba el diseño: la cuota del periodo en que cae la anulación **se queda pendiente**, y en la liquidación él la da por cobrada o la quita según llegue o no («que yo en la liquidación pueda deshacerlo o no en función de si me llega o no»). Se cortan solas las de los periodos que empiezan después. Por eso, una cuota pendiente tiene que poder borrarse desde su página y desde su serie, y en «Ha llegado» marcarse como no llegada. Si cuando se informe resulta que no llega nunca, se cambia una comparación en `cuotasQueSeCortan` y en el borrado (`>` por `>=` sobre el periodo que contiene la anulación).
2. **La regla de cobro** (2026-11-01): trimestrales y semestrales, por periodo natural, cobrados el mes siguiente a su último mes, desde el periodo del efecto; los recibos mensuales, de una vez y anualizados, como hoy. La semestral, deducida.
3. **Seguir con este diseño**: «empieza con la req2» (2026-11-01).

## 15. Criterios de aceptación: cómo se comprueba

| Criterio del requerimiento | Comprobación |
|---|---|
| Se apunta una vez, con cada cuánto cobra, lo de cada cuota y lo del nivel | «Nueva firma» y `--cuotas`/`--unidades-cuota`. Una sola fila de herramienta, con `cuotas_cada_meses` y `unidades_cuota`. El nivel cuenta 37 (prueba de 5.1) |
| Cada periodo natural se cobra el mes siguiente a su último mes, desde el del efecto y hasta que se anula | Pruebas de 5.1 (los cuatro trimestres, el paso de año, el efecto del 1 de abril, la anulación). En el RC, las cuotas de la sección 3 |
| Liquidaciones las prevé, con su línea sin nombres; «Ha llegado» las cobra y lo que no llega pasa al siguiente | Octubre en 140,28 € con «1 herramienta y 1 cuota». Bloques 3.4 y 3.5 de 4.8. «Ha llegado» de la n.º 6 (F3) |
| En la herramienta, las cuotas cobradas y las próximas | La sección «Cuotas» de la página del RC: abril-junio cobrada (la firma), julio-septiembre cobrada tras la n.º 6, y las siguientes programadas o por programar |
| Anular corta las que no se han cobrado | Prueba de 5.1, el bloque 3.12 de 4.8 y el aviso de la pantalla de anular |
| La hucha de su compañía y el IRPF de siempre | Cuota: RC 0, IRPF 15 (bloque 3.3 de 4.8). La hucha, en 133,62 € tras la n.º 6 |
| El RC de antes pasa a ser recurrente sin perder julio, y la de octubre entra en la n.º 6 | Sección 8: la fila de julio no cambia (sigue en la n.º 5) y octubre cuadra con el documento |
| Ningún nombre fuera de la base | Sección 12. Ningún mensaje de la 0002 lleva cliente. El `grep` de la clave |
