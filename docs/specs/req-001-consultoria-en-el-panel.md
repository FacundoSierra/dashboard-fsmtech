# REQ-001 · La consultoría en el panel, con su propia base de datos

- Fecha: 2026-10-27
- Rama: `req-001-consultoria`
- Requerimiento (qué y por qué): `proyectos/dashboard-fsmtech/requerimientos/req-001-consultoria-en-el-panel.md` de la bóveda
- Decisiones: [ADR-001](../decisiones/adr-001-una-base-de-datos-propia-de-fsmtech.md) (la base propia y sus convenciones), [ADR-002](../decisiones/adr-002-el-panel-entra-en-la-base-con-una-clave-secreta-solo-en-el-servidor.md) (cómo entra el panel), [ADR-003](../decisiones/adr-003-la-consultoria-vive-solo-en-el-panel.md) (el cambio y FSM-Finance congelada)
- **De dónde viene**: el REQ-001 de FSM-Finance (repo `fsm-finance`, `docs/specs/req-001-consultoria.md`, «la spec de origen» en este documento) y sus ADR 001 a 006. **Las reglas de negocio, el modelo de datos, las pantallas y los scripts son los de allí**: aquí solo va lo que cambia al mudarlos
- **Plazo**: la liquidación de octubre de OVB (n.º 6) llega el 2026-10-28. Lo mínimo para marcarla en el panel está en la sección 2; lo demás va después (sección 13) sin estorbar
- **Red de seguridad**: si mañana no está, la n.º 6 se marca en FSM-Finance como hoy, y la copia la trae después (sección 6)

> **Protección de datos, también en este documento y en el repo**: ningún nombre de cliente real ni número de póliza en el código, las pruebas, los ejemplos, los commits ni la documentación. La salida de los scripts lleva nombres: se lee en la terminal y no se copia a ninguna nota.

## 1. La idea

El panel gana su primera base de datos, `fsmtech` (Supabase, `eu-west-1`, junto a las funciones de Dublín), cerrada a todo salvo al servidor del panel, que entra con una clave secreta detrás de `verificarSesion()`. La consultoría se muda entera: una migración consolidada con el estado final de las `0013`, `0015` y `0016` de FSM-Finance, el código de `src/lib/consultoria/` tal cual (las reglas y el cuadro, sin cambiar una línea), las pantallas adaptadas al diseño del panel y los scripts apuntando a la base nueva. Los datos pasan con un script que copia, conserva los `id` y compara las cifras de las dos bases; se puede repetir desde cero hasta el **cambio**, un momento explícito en el que FSM-Finance queda en solo lectura y la base nueva pasa a ser la fuente. Economía sigue leyendo las casillas de OVB de la bóveda, como hoy: la base no le suma nada, así que nada cuenta dos veces.

**¿Es «hacer las migraciones y copiar o amoldar el código»?** Casi. Además de eso hay cuatro cosas, ninguna grande:
1. Cómo entra el panel en la base (un archivo, `lib/base/cliente.ts`, y dos variables).
2. El script de copia con su comparación, que es nuevo y lo más delicado.
3. Adaptar las pantallas al diseño del panel (sus componentes, sus colores y el modo oscuro), que es lo que más horas lleva.
4. El cambio (congelar FSM-Finance) y, más adelante, quitarle la consultoría.

## 2. Lo mínimo para el 2026-10-28 y lo que va después

| Para marcar la n.º 6 en el panel (fases A a D) | Después, sin estorbar (sección 13) |
|---|---|
| La base `fsmtech` con la `0001` | Quitar la consultoría de FSM-Finance (código, documentación y `borrar-cuenta.mjs`) |
| Los datos copiados y las cifras iguales en las dos bases | Borrar sus tablas (`0018`, irreversible), con una exportación justo antes |
| Resumen, Clientes (lista y ficha), Producción con «Nueva firma» y la página de una herramienta, Liquidaciones con «Ha llegado» y «Deshacer», Hucha y Ajustes, en el panel | Las tareas 1, 2 y 3 de las unidades (redondeo del nivel, AVANZA × 5, dos cifras en los seguros) |
| `consultoria:firma`, `consultoria:importar`, `consultoria:cierres` y `consultoria:copiar` contra la base nueva | Que Economía lea la base en vez de las casillas (si Facundo quiere) |
| El recibo del RC Integral con 1,52 u para cobrar y 0 para el nivel (ya se puede: sección 11) | Las mejoras sin fecha del retomar de FSM-Finance; exportar la base cada semana |
| El cambio: FSM-Finance en solo lectura y `fuente_desde` puesto | |

Se copian **todas** las pantallas porque ya existen y adaptarlas es casi lo mismo que adaptar la mitad: lo que no dé tiempo a pulir (los detalles de 390 px y del modo oscuro) se pule después, siempre que se lea bien.

## 3. La base nueva

### 3.1 El proyecto (hecho por Facundo el 2026-10-27)
- Nombre `fsmtech`, región **West EU (Ireland), `eu-west-1`**, plan gratuito. La contraseña de la base, en su gestor de contraseñas: el panel no la usa
- **Plan gratuito** (supabase.com/pricing, consultado el 2026-10-27): 2 proyectos activos por persona, 500 MB, sin copias de seguridad y **pausa tras una semana sin actividad**. Coste hoy: 0 €. Pro: 25 $/mes por organización, con 10 $ de cómputo incluidos (una instancia Micro) y copias diarias de 7 días. Se recomienda seguir en gratuito y exportar cada semana (sección 13)

### 3.2 Lo que tiene que dejar puesto Facundo en Supabase (10 minutos)
1. **Authentication → Sign In / Providers**: desactivar «Allow new users to sign up». Nadie usa Supabase Auth en esta base
2. **Project Settings → API Keys → Secret keys**: crear **dos claves secretas**, `panel-vercel` y `pc` (ADR-002). La publicable no se usa
3. **Project Settings → Data API**: activa, con `public` expuesto. Da igual cómo quedara «Automatically expose new tables» al crear el proyecto: la `0001` quita y da los permisos explícitamente

### 3.3 Las variables (los nombres exactos)

| Dónde | Variable | Valor |
|---|---|---|
| Vercel, proyecto del panel, **solo Production** | `SUPABASE_URL` | `https://<ref>.supabase.co` (Project Settings → API) |
| | `SUPABASE_SECRET_KEY` | la clave secreta `panel-vercel` (`sb_secret_…`) |
| `.env.local` del panel, en el PC | `SUPABASE_URL` | la misma URL |
| | `SUPABASE_SECRET_KEY` | la clave secreta `pc` |

- **Sin `NEXT_PUBLIC_`**: nada de la base llega al navegador
- Ni en Preview ni en Development de Vercel: una rama en vista previa no toca los datos reales (se prueba en local)
- Nunca en GitHub ni en los secretos de Actions
- La copia lee FSM-Finance con **su** `.env.local`, cuya ruta se le pasa por argumento: no hay variables nuevas para eso
- En la bóveda, la sesión principal pone en la nota del proyecto `supabase: https://<ref>.supabase.co` (la URL pública, nunca claves): así la vigilancia la mira como las demás

### 3.4 Convenciones para lo que entre después (ADR-001)
- Tablas en `public` con el prefijo de su módulo (`consultoria_*`), nombres en español
- Migraciones en `supabase/migraciones/NNNN_titulo.sql`, desde `0001`, con sus comprobaciones en la cabecera, revisadas por el `revisor-migraciones` y **ejecutadas por Facundo** en el editor SQL. Toda migración que cree algo lleva sus `grant` (solo a `service_role`) y activa el RLS
- Dinero en `numeric(12,2)`, fechas contables en `date`
- Una sola puerta en el código: `lib/base/cliente.ts` (sección 5)

## 4. Modelo de datos: `supabase/migraciones/0001_consultoria.sql`

**Una migración consolidada** con el estado final de la consultoría de FSM-Finance: las tablas de la sección 2.1 de la spec de origen con la columna `aportacion_de` de la 11.1 ya dentro, las columnas generadas (2.2), los disparadores (2.3, incluidos `consultoria_proteger_liquidacion` de la `0015` y `consultoria_proteger_aportacion` de la `0016`), las vistas en su última versión (2.4: `consultoria_lineas` y `consultoria_clientes_resumen` como las dejó la `0016`; las otras tres, como en la `0013`) y las dos funciones de «Ha llegado» y «Deshacer» (2.5). **Mismos nombres de tablas, columnas, restricciones y vistas**: el código y los mensajes de error (`RESTRICCIONES` de `acciones.ts`) no cambian. El `backend` la escribe copiando de las tres migraciones; lo que cambia es solo esto:

### 4.1 El consultor, sin `perfiles`
Una tabla nueva, la primera:

```sql
create table if not exists public.consultoria_consultores (
  id           uuid primary key,             -- sin default: la copia trae el de FSM-Finance
  nombre       text not null check (char_length(btrim(nombre)) between 1 and 60),
  fuente_desde timestamptz,                  -- nulo hasta el cambio (sección 6.4)
  creado_en    timestamptz not null default now()
);
-- Un solo consultor (Facundo, 2026-10-25): el código y los scripts usan «el único»
create unique index if not exists consultoria_consultores_uno on public.consultoria_consultores ((true));
```

- **`consultor_id` se queda en las diez tablas**, con el mismo nombre y el mismo valor (el `id` de Facundo en FSM-Finance, que no es un dato personal), y pasa de `references public.perfiles (id) on delete restrict` a **`references public.consultoria_consultores (id) on delete restrict`**. Así:
  - las FK compuestas `(…, consultor_id)`, las PK de compañías y cierres y los índices no cambian;
  - el centenar largo de sitios de `consultas.ts` y `acciones.ts` que filtran por `consultor_id`, y los de los scripts, tampoco;
  - la copia no tiene que traducir ningún id;
  - y si un día el panel tuviera Supabase Auth (ADR-002), `consultor_id` ya está.
- **Sin `es_consultor()`** ni la siembra de compañías: las compañías vienen con la copia (y sin filas, `reglas.ts` usa las de serie)
- **Solo en `fsmtech`**: antes de cambiar nada, la `0001` se para si la base tiene `perfiles` (`to_regclass('public.perfiles')`), porque esa es la de FSM-Finance y allí sus `revoke` la dejarían sin consultoría. Los scripts hacen lo mismo al conectar (`comprobarQueEsLaDelPanel` de `consultoria-comun.mjs`)

### 4.2 RLS y permisos: cerrado a todo salvo `service_role`
- `enable row level security` en las once tablas, **sin ninguna política** (fuera los diez `create policy` de la `0013`). Para `service_role` no cuenta; para cualquier otro rol, no hay filas
- Tablas: `revoke all … from public, anon, authenticated, service_role;` y `grant select, insert, update, delete … to service_role;` (sin `truncate`: vaciar lo hace Facundo como `postgres`, sección 6.3)
- **La excepción, `consultoria_consultores`**: `service_role` tiene `select, insert, delete` y `update (nombre)`, y **no puede cambiar `fuente_desde`**. El cambio (6.4) lo hace Facundo como `postgres`, en el editor SQL. La copia inserta el consultor solo con `id`, `nombre` y `creado_en`, y ningún script ni acción hace `update` de esa tabla
- Vistas: `revoke all` igual y `grant select … to service_role`. Siguen con `security_invoker = on`, por si un día hay usuarios
- Lo que se cree después, cerrado por defecto: `alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;` y lo mismo con `sequences` y con `functions`. **El `execute` que Postgres da a `public` en toda función nueva no se quita así**: es un permiso por defecto global, y uno por esquema solo deshace lo que haya dado otro por esquema. Por eso cada función de la `0001` lleva su `revoke … from public`, y **cada función que venga después tiene que llevar el suyo**

### 4.3 «Ha llegado» y «Deshacer», sin `auth.uid()`
Con la clave secreta, `auth.uid()` es nulo (ADR-002). Las dos funciones reciben el consultor como **primer parámetro**:

```sql
consultoria_liquidar_mes(p_consultor uuid, p_mes date, p_fecha date, p_entraron uuid[], p_extornos uuid[],
                         p_cargos uuid[] default '{}', p_numero integer default null,
                         p_importe_recibido numeric default null, p_motivo text default null) returns uuid
consultoria_deshacer_liquidacion(p_consultor uuid, p_id uuid) returns void
```

- `v_yo := p_consultor` en vez de `auth.uid()`, y el primer `if` pasa a: si `p_consultor` es nulo o no está en `consultoria_consultores`, `raise exception 'No hay consultor' using errcode = '42501'`. El resto del cuerpo, igual que en la `0013`
- `security invoker`, `set search_path = public`; `revoke execute … from public, anon, authenticated;` y `grant execute … to service_role`
- Las funciones de los disparadores, como en origen: `revoke execute … from public, anon, authenticated, service_role`

### 4.4 Comprobaciones de la cabecera (con la base vacía, antes de la copia)
Como las de 2.8 de la spec de origen, adaptadas. Las que escriben son bloques `do` que acaban en error a propósito (no guardan nada) y crean dentro su propio consultor de prueba, porque la base está vacía:
1. RLS activo en las once tablas; `select count(*) from pg_policies where schemaname = 'public' and tablename like 'consultoria%'` → 0; permisos de tablas y vistas solo para `service_role` (y `postgres`, el dueño); `has_column_privilege('service_role', 'public.consultoria_consultores', …, 'update')` → `true · false` (`nombre` sí, `fuente_desde` no); `liquidar_mes` y `deshacer_liquidacion`, solo `service_role`; las de los disparadores, nadie; `pg_default_acl` sin `anon` ni `authenticated` en `public`
2. Columnas generadas `stored` (`attgenerated = 's'`): `bruto`, `hucha`, `irpf`, `neto` y `resto`
3. Importes por fila y el IRPF sobre el total: los mismos números de 2.8 (81.60 · 8.16 · 11.02 · 62.42 | 60.20 · 6.02 · 8.13 · 46.05; mes 141.80 · 14.18 · 127.62 · **19.14**)
4. **`anon` y `authenticated` no leen ni escriben**: `set local role anon` (y luego `authenticated`) y un `select` de `consultoria_clientes` y de `consultoria_lineas`, y un `insert`, cada uno en su `begin … exception when insufficient_privilege` → «rechazado» en los seis
5. Disparadores y funciones, el paso 5 de 2.8 con `p_consultor`: «cobrada | prevista al 2099-12-31 | hucha 8.16 | cargo: aplicado | parado | parado | parado | «La herramienta «Prueba» tiene un extorno…» | deshecha | sin aplicar»; más los de la `0015` (cambiar el mes de una liquidación con líneas → parado) y la `0016` (una APEX de otro cliente y una de dos niveles → paradas)
6. Un segundo consultor → rechazado por `consultoria_consultores_uno`

## 5. Cómo entra el panel: `lib/base/cliente.ts` (ADR-002)

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/** ¿Están SUPABASE_URL y SUPABASE_SECRET_KEY? Sin ellas, la sección dice que falta configurar la base */
export function hayBase(): boolean;
/** Comprueba la sesión (verificarSesion) y devuelve el cliente, uno por proceso, sin sesión de Auth
 *  (`auth: { persistSession: false, autoRefreshToken: false }`). Lanza BaseSinConfigurar si faltan las variables */
export async function baseDeDatos(): Promise<SupabaseClient>;
export class BaseSinConfigurar extends Error {}
```

- **Es el único archivo que lee `SUPABASE_SECRET_KEY`** (los scripts aparte: leen el `.env.local`). Comprobación: `grep -r SUPABASE_SECRET_KEY app components lib` solo encuentra `lib/base/cliente.ts`
- Además de lo de arriba: `detectSessionInUrl: false`, `fetch` con `cache: 'no-store'` (sin la caché de datos de Next, sección 10) y una `SUPABASE_URL` que no sea `https` cuenta como sin configurar
- `/api/vigilancia` nunca lo importa
- Dependencia nueva: **`@supabase/supabase-js` 2.117.2**, la misma que usa FSM-Finance (sin `@supabase/ssr`: no hay sesiones de Supabase)

`lib/consultoria/sesion.ts` (`server-only`), lo que sustituye a `exigirConsultor()`:

```ts
export interface Consultor { id: string; fuenteDesde: string | null }
/** Con sesión: el único consultor de la base, memorizado por petición (cache de React).
 *  `pendiente` si faltan las variables ('configuracion'), la 0001 ('0001') o la copia ('copia': no hay consultor) */
export const exigirConsultoria: () => Promise<{ consultor: Consultor } | { pendiente: true; falta: 'configuracion' | '0001' | 'copia' }>;
```

## 6. La copia, el cambio y FSM-Finance congelada (ADR-003)

### 6.1 `scripts/consultoria-copiar.mjs --origen <ruta al .env.local de FSM-Finance> [--guardar] [--exportar <archivo.json>]`
`npm run consultoria:copiar -- …`. Lee el origen con `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` del archivo que se le pasa (solo `select`: su cliente no tiene más que `from(…).select(…)`), y el destino con `SUPABASE_URL` y `SUPABASE_SECRET_KEY` del `.env.local` del panel. El consultor de origen, el único `perfiles.rol = 'consultor'` (como `buscarConsultor` de origen). Nombre del consultor en destino: «Facundo».

Antes de leer nada, **para si el origen y el destino tienen el mismo host**, y al abrir el destino, **si tiene `perfiles`** (es la base de FSM-Finance u otra, no la del panel). Si al destino le faltan las variables o la `0001`, lo dice y enseña igual el origen.

**Sin `--guardar` (vista previa), no escribe nada** y enseña, de origen y de destino, lado a lado, con «igual» o **«DISTINTO»** en cada fila. **Sin nombres**: solo recuentos, huellas e importes. El destino se lee entero, sin filtrar por consultor, así que una fila de más también sale distinta. **Sale con código 0 si todo es igual y con 1 si algo es distinto o el destino no se puede comparar, también en vista previa**: ese 1 no es un fallo.

| Qué | Cómo |
|---|---|
| Filas de cada tabla | Las diez de origen y las once de destino (menos `consultoria_consultores`) |
| Huella de cada tabla | `sha256` del JSON de sus filas, ordenadas por clave primaria, sin las columnas generadas, con los `numeric` como texto y las fechas tal cual: dos bases iguales dan la misma huella |
| Cada mes de liquidación | La línea de la casilla de OVB (`recuentoDelMes`, `calcularLiquidacion` y `cuentaDeComisiones` de `reglas.ts`, como hace `consultoria-comun.mjs`) |
| Hucha | Saldo hoy y a 2026-07-29 (`saldoDeHucha`) |
| Nivel | `unidadesAntes` de 2026-10 y de 2026-11 y el nivel de cada mes (`valorUnidadDelMes`) |
| Clientes | Clientes, herramientas y previstas de `consultoria_clientes_resumen` |

Las cifras que tienen que salir **en las dos** con los datos del 2026-10-27: 14 clientes; 17 filas de herramientas (16 y 1 APEX enganchada); 5 liquidaciones; 2 cargos; 48 cierres; 5 compañías; unidades previas 2,80; abril **234,70 €** a pagar; octubre **124,85 €**; noviembre **1.049,71 €** («5 herramientas y 1 APEX (2 previstas) · 624,00 u»); diciembre **399,33 €**; hucha **115,62 €** a 2026-07-29; nivel **827,20 u** antes de octubre (Financial Trainee) y **1.129,60 u** antes de noviembre (Financial Consultant). Si para entonces hay algo nuevo en FSM-Finance (la n.º 6, una firma), las cifras de origen cambian y lo que vale es que **las dos columnas coincidan**.

**Con `--guardar`:**
1. Para si el destino tiene `fuente_desde` («la base nueva ya es la fuente: no se copia encima») o si alguna tabla de destino tiene filas («vacíala antes con el bloque de 6.3»)
2. Inserta, conservando `id`, `consultor_id`, `creado_en`/`creada_en` y `origen`, **sin las columnas generadas** (`bruto`, `hucha`, `irpf`, `neto`, `resto`: Postgres no deja escribirlas), en este orden:
   1. `consultoria_consultores`, **solo con `id`** (el del consultor de origen), **`nombre` y `creado_en`** (el de su perfil en FSM-Finance). `fuente_desde` no se escribe nunca, ni nulo: la clave secreta no puede (4.2)
   2. `consultoria_companias`, `consultoria_ajustes`, `consultoria_niveles`, `consultoria_cierres`
   3. `consultoria_clientes`
   4. `consultoria_liquidaciones`, todas: las herramientas cobradas las apuntan, y su disparador exige que la liquidación sea la de su mes
   5. `consultoria_herramientas` **sin `aportacion_de`** primero, y después las que lo tienen: el disparador de la APEX busca a su madre
   6. `consultoria_extornos` (su disparador exige la herramienta anulada y cobrada)
   7. `consultoria_cuenta` y `consultoria_hucha`
3. Vuelve a leer el destino y repite la comparación. Sale con código 0 si todo es igual y 1 si algo es distinto, diciendo qué
4. Si una inserción falla a medias (PostgREST no hace una transacción entre tablas), lo dice y pide vaciar y repetir: no intenta arreglarlo

**Con `--exportar <archivo.json>`**: escribe las filas de origen en un JSON (`formato: "consultoria-copia-v1"`), sin las columnas generadas. Lleva nombres: se niega si la ruta está dentro de un repo de git con remoto **que no la ignore** (mira todos los `.git` hacia arriba con `git check-ignore`; si git no responde, se niega) y nunca sobrescribe un archivo. Por eso vale la carpeta de laboratorio del PC: está dentro de la bóveda, que tiene remoto, pero la bóveda ignora `.repos/`. Es la copia de antes de borrar las tablas de FSM-Finance (13.1).

### 6.2 Mientras no haya cambio
- Hasta el cambio **se sigue apuntando en FSM-Finance**, como hoy
- El panel enseña la consultoría copiada, pero **no escribe**: con `fuente_desde` nulo, cada acción devuelve «La consultoría aún se lleva en FSM-Finance: el cambio no está hecho», y la sección lleva arriba el aviso «Copia de FSM-Finance: aquí todavía no se guarda nada». «Nueva firma» calcula y enseña lo que saldría (eso no escribe)
- Se puede vaciar y volver a copiar cuantas veces haga falta

### 6.3 Vaciar la base nueva (Facundo, en el editor SQL de `fsmtech`, solo antes del cambio)

```sql
do $$
begin
  if exists (select 1 from public.consultoria_consultores where fuente_desde is not null) then
    raise exception 'La base nueva ya es la fuente desde el cambio: no se vacía';
  end if;
  truncate table public.consultoria_cuenta, public.consultoria_hucha, public.consultoria_extornos,
    public.consultoria_herramientas, public.consultoria_liquidaciones, public.consultoria_clientes,
    public.consultoria_cierres, public.consultoria_niveles, public.consultoria_ajustes,
    public.consultoria_companias, public.consultoria_consultores;
end $$;
```

`truncate` no dispara los disparadores de fila (por eso puede con las cobradas) y, con todas las tablas en la misma sentencia, tampoco choca con sus FK. Solo existe en esta base y se niega en cuanto es la fuente.

### 6.4 El cambio (Facundo y la sesión principal, unos 20 minutos, el 2026-10-28 antes de marcar la n.º 6)
1. **Facundo, en FSM-Finance**: ejecuta `0017_consultoria_solo_lectura.sql` (repo `fsm-finance`, la escribe el `backend` y la revisa el `revisor-migraciones`):
   - `revoke insert, update, delete, truncate` de las diez tablas `consultoria_*` a `authenticated` y `service_role`;
   - `revoke execute` de `consultoria_liquidar_mes(…)` y `consultoria_deshacer_liquidacion(uuid)` a `authenticated`;
   - en su cabecera, la comprobación (un `insert` como `service_role` → `42501`) y **el bloque para deshacerla** (los `grant` de la `0013`).
   
   Desde aquí **ni una firma más en FSM-Finance**: la base lo rechaza, también los scripts
2. **Sesión principal**: `consultoria:copiar` en vista previa. Si algo es distinto (porque FSM-Finance cambió desde la última copia), Facundo vacía (6.3) y se copia con `--guardar`, con su visto bueno. Tiene que acabar en «todo igual»
3. **Facundo, en el editor SQL de `fsmtech`** (como `postgres`: la clave secreta no puede cambiar `fuente_desde`, 4.2): `update public.consultoria_consultores set fuente_desde = now() where fuente_desde is null;`. Desde aquí la base nueva es la fuente y el panel escribe
4. **Sesión principal, en la bóveda**: la regla de las firmas de `C:\brain\CLAUDE.md`, «Cómo se apunta» de la nota de la consultoría y `como-trabajamos` pasan a decir el panel y su repo (`npm run consultoria:firma` en el repo del panel). La nota de FSM-Finance, que la consultoría se mudó

**Plan B si algo falla después del cambio**: en FSM-Finance, el bloque para deshacer la `0017`; se sigue allí y se apunta a mano lo que se hubiera hecho en el panel desde el cambio. En `fsmtech`, `fuente_desde` vuelve a nulo (Facundo, como `postgres`) para poder vaciar y copiar otra vez.

## 7. El código

### 7.1 Dónde va cada pieza

| En FSM-Finance | En el panel | Qué cambia |
|---|---|---|
| `src/lib/consultoria/reglas.ts`, `cuadro.ts` | `lib/consultoria/` | **Nada**. Siguen sin importaciones en tiempo de ejecución (`cuadro.ts`, solo `import type` de `./reglas`) |
| `reglas.test.mjs`, `apex.test.mjs` | `lib/consultoria/` | `reglas.test.mjs`, nada. `apex.test.mjs`, una línea: también importa `herramientasDeLaCasilla`, `liquidacionesPorMes` y `puedeSerSuMadre` de `scripts/consultoria-comun.mjs`, y como `lib/consultoria` está un nivel menos hondo que `src/lib/consultoria`, su ruta pasa de `../../../scripts/` a `../../scripts/`. Esas tres funciones de `consultoria-comun.mjs` no cambian |
| `tipos.ts`, `validar.ts` | `lib/consultoria/` | `Resultado` (`{ error?: string; ok?: string }`) se define en `tipos.ts`; `MigracionQueFalta` pasa a `"0001"` |
| `consultas.ts` | `lib/consultoria/` | `supabaseServidor()` → `baseDeDatos()`; los avisos de migración, a la `0001` (ya no hay `0016` aparte). Mismas funciones y mismas firmas |
| `acciones.ts` | `lib/consultoria/` | `comoConsultor`: `await verificarSesion()` **antes del `try`** (o `unstable_rethrow(error)` al principio del `catch`: si no, su `redirect('/login')` se traga, ver `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/unstable_rethrow.md`); después, `exigirConsultoria()`, y si `fuenteDesde` es nulo, el error de 6.2. Las dos `rpc` llevan `p_consultor: consultorId`. La revalidación pasa a **`revalidatePath('/(panel)/consultoria', 'layout')`**: la sección está dentro del grupo `(panel)` y Next etiqueta su layout con el grupo (`…/04-functions/revalidatePath.md`; con `'/consultoria'` la etiqueta no coincidía, aunque la pantalla se refrescara igual). En el log, solo `code` y `message` (sección 10). Mismas acciones, mismas entradas y mismos errores |
| `exigirConsultor()` de `src/lib/sesion.ts` | `exigirConsultoria()` de `lib/consultoria/sesion.ts` | Sección 5 |
| Lo que importan de fuera: `sumarMeses` y nombres de mes de `@/lib/calendario`; `euros`, `eurosConSigno`, `mesCorto`, `fechaCorta` de `@/lib/formato`; `normalizar` de `@/lib/huella` | `lib/consultoria/calendario.ts` y `lib/consultoria/formato.ts` | Copiadas las funciones que se usan, tal cual: así los importes y las fechas se escriben igual que en FSM-Finance |
| `src/componentes/consultoria/*` | `components/consultoria/*` | Sección 7.3. **Con los mismos nombres de archivo** que en origen, para que la mudanza se pueda comparar archivo a archivo (renombrarlos a guiones es cosmético, después) |
| `Bloque`, `BarrasMensuales` (con `previsto`, 5.4 de origen), `BotonBorrar` | `components/consultoria/Bloque.tsx`, `BarrasMensuales.tsx` y `BotonBorrar.tsx`, copiados con los colores del panel | `Bloque` se copió con el aspecto de `Tarjeta` (sus clases, en `estilos.ts`) porque lleva debajo del título la línea del periodo, que `Tarjeta` no tiene. `Tarjeta` de `components/ui.tsx` solo se usa en `FaltaMigracion`, y `Kpi` en ninguna. `Cifra` no hacía falta: ninguna pantalla de la consultoría de origen la usaba (solo el panel de inicio de FSM-Finance) |
| `src/app/consultoria/*` (layout, `error.tsx`, `loading.tsx` y las páginas de 5.2 de origen) | `app/(panel)/consultoria/*` | Dentro de `(panel)`, con su cabecera y sus barras. Cada página empieza con `exigirConsultoria()`; si `pendiente`, `FaltaMigracion` dice qué falta (configurar la base, la `0001` o la copia) |
| `scripts/consultoria-comun.mjs`, `-firma`, `-importar`, `-cierres` | `scripts/` | Sección 8 |

### 7.2 Pruebas en el panel
El panel no tenía ejecutor de pruebas. Se añadió igual que en FSM-Finance, sin dependencias: `node:test` con Node 24 (el del PC es 24.19), que ejecuta TypeScript quitando los tipos.
- `package.json`: `"test": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test \"lib/**/*.test.mjs\""`. No se ha cambiado el `"type"` del paquete
- `tsconfig.json`: `"erasableSyntaxOnly": true` (comprobado: el panel no usa `enum`, `namespace` ni propiedades en el constructor)
- **`npm test` pasa las 105 pruebas de origen** (90 de `reglas.test.mjs` y 15 de `apex.test.mjs`), sin cambiar ninguna; solo la ruta de una importación de `apex.test.mjs` (7.1)

### 7.3 Las pantallas, con el diseño del panel
- **Colores**: los de `app/globals.css` del panel, que tiene modo oscuro. Equivalencias de partida: `tinta` → `texto`, `tinta-suave` → `tenue`, `tinta-tenue` → `apagado`, `linea` → `borde`, `tarjeta` → `superficie`, `crema` → `fondo`, `principal` → `acento`. Nada de `bg-white` ni colores fijos
- **Estados con icono y texto** (regla del panel): `EstadoHerramienta` usa `<Estado>` de `ui.tsx`: cobrada → `bien`; prevista, firmada y confirmada → `neutro` con su texto; incidencia → `aviso`; anulada → `grave`. La hucha en negativo, `critico` con su texto. Los avisos de la consultoría (en FSM-Finance, texto ámbar) van con `components/consultoria/Aviso.tsx`: el icono de «aviso» del panel y el texto en tinta normal, nunca solo color
- **Producción**: la tabla entera solo desde `2xl`; por debajo, una tarjeta por herramienta (`TablaProduccion.tsx`)
- **Iconos** de `lucide-react` (los cuatro de heroicons de origen)
- **Navegación**: «Consultoría» con el icono `Briefcase`, en el grupo «Negocio» de `GRUPOS` (`components/navegacion.tsx`), después de Economía. Esa lista sirve a las dos barras: en el móvil sale en «Más» (no cambia `EN_BARRA_INFERIOR`). Y en `SECCIONES` de `components/barra-ordenes.tsx`, solo el enlace a la sección
- Las pestañas de dentro (Resumen · Clientes · Producción · Liquidaciones, la hucha y el engranaje de Ajustes), como en 5.1 de origen
- Los textos, los cálculos en el navegador («Nueva firma» con `proponerFirma`), «Ha llegado» y el móvil a 390 px, como en 5.4 a 5.8 de origen
- Nada de `Date.now()` al pintar: `hoyEnMadrid()` de `reglas.ts` en el servidor, como en origen

## 8. Los scripts en el panel
- `consultoria-comun.mjs` lee `SUPABASE_URL` y `SUPABASE_SECRET_KEY` del `.env.local` del panel (quitando las comillas que rodeen un valor, como Next; una URL que no sea `https` para), e importa `../lib/consultoria/reglas.ts` y `../lib/consultoria/cuadro.ts`
- Al conectar, si la base tiene `perfiles`, para: es la de FSM-Finance (u otra), no la del panel
- `buscarConsultor`: el único de `consultoria_consultores`; se quita `--consultor <correo>`. Si no hay ninguno: «La base nueva está vacía: copia antes los datos (`consultoria:copiar`)»
- **`--guardar` para si `fuente_desde` es nulo** (en `firma`, `importar` y `cierres`): «La consultoría aún se lleva en FSM-Finance». La vista previa funciona siempre
- Las comprobaciones de «falta la 0013 / la 0016» pasan a «falta la 0001»
- `package.json`: `consultoria:cierres`, `consultoria:importar`, `consultoria:firma` y `consultoria:copiar`, con `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON`
- Lo demás, igual que en la sección 6 de origen (lo que imprimen, las opciones y que su salida lleva nombres)

## 9. Economía y las casillas de OVB
**Se mantiene el camino de hoy**: Economía lee las casillas de `clientes/ovb/cobros/` (`linea: consultoria-financiera`), que escribe Claude con la línea que dan los scripts o la pantalla de Liquidaciones, sin nombres. La base no alimenta Economía, así que **no hay nada que cuente dos veces**. Al marcar «Ha llegado» en el panel, la sesión principal marca la casilla del mes con `— cobrado AAAA-MM-DD`, como hasta ahora.

Ahora que las dos cosas están en el panel, lo mejor más adelante es que Economía lea de la base el importe a pagar de cada mes (sin nombres) y que la nota de OVB deje de llevar casillas: una sola fuente y nada a mano. **Va en «después» (13.4) y es un cambio de una vez**: o casillas o base, nunca las dos.

## 10. Protección de datos: por dónde podrían escaparse los nombres

| Sitio | Riesgo | Qué se hace |
|---|---|---|
| Notas y GitHub | El panel escribe en la bóveda | Nada de la consultoría pasa por `lib/boveda/escritura.ts`: la tabla de escrituras no cambia. La casilla de OVB, sin nombres, la sigue escribiendo Claude |
| Vigilancia horaria (Actions e incidencias) | Los títulos de las incidencias salen de los avisos | `lib/avisos.ts` no lee la consultoría y `/api/vigilancia` no importa `lib/base/`. La única vigilancia de la base es la de siempre: `GET /auth/v1/health` sin clave, que no lee datos |
| Avisos de Hoy y Estado | | Ninguno de la consultoría en este requerimiento. Si más adelante hay alguno («liquidación de octubre sin marcar»), sin nombres y con `notificar: false` |
| Informes | Se mandan a clientes | No leen la consultoría |
| Búsqueda (`/buscar`) | | Solo notas. La búsqueda de clientes de la consultoría es la de su propia lista, sobre lo cargado |
| Barra de órdenes | Sus datos se piden con una Server Action | Solo el enlace a la sección; ni clientes ni herramientas de la consultoría |
| Caché | Next o Vercel guardando páginas con nombres | Las páginas de la sección leen cookies (son dinámicas) y las consultas solo usan `cache()` de React (por petición). **Nada de `'use cache'`, `unstable_cache` ni `fetch` en caché** en la consultoría |
| Logs de Vercel | Un error que imprima filas | Solo `code` y `message` de Postgres (los mensajes de los disparadores dicen el producto, no el cliente), nunca `details` ni filas. Como en origen |
| Navegador | | Sin service worker; la clave secreta no funciona desde un navegador y no tiene `NEXT_PUBLIC_` |
| Repo del panel | | Ni nombres ni pólizas en código, pruebas, ejemplos, commits ni documentación; `--exportar` se niega a escribir dentro de un repo |
| Salida de los scripts | Lleva nombres | Se lee en la terminal y no se copia a ninguna nota, como hasta ahora |

## 11. La liquidación de octubre (n.º 6) y las cuatro tareas de las unidades
- **La n.º 6 se marca donde esté la fuente ese día.** Si el cambio (6.4) está hecho cuando llegue, en el panel; si no, en FSM-Finance como hoy, y la copia la trae. En los dos sitios es igual:
  1. comparar el documento con octubre en Liquidaciones (hoy espera 124,85 €);
  2. lo que traiga y no esté en la base, como firma con su cobro en octubre; los cargos y abonos nuevos, con «Añadir cargo o abono»;
  3. «Ha llegado»;
  4. la casilla de octubre de OVB, con `— cobrado AAAA-MM-DD`.
- **Tarea 4, el recibo de septiembre del RC Integral** (1,52 u para cobrar y 0 para el nivel, sin hucha): no necesita código. «Nueva firma» ya enseña «Unidades para cobrar» y «Unidades para el nivel» en una comisión sobre recibo como esta, y `consultoria:firma` tiene `--unidades 1.52 --unidades-nivel 0`. Se apunta con la n.º 6, en el sitio donde se marque. Octubre pasaría a esperar unos 127,43 €
- **Tareas 1 a 3, después y solo en el panel** (13.2): ninguna cambia el dinero de la n.º 6 y, hechas antes del cambio, harían que la comparación de la copia no cuadrara con FSM-Finance. FSM-Finance no recibe ninguna

## 12. El plan, por pasos y por agente

Horas de agente: unas 14. Con lo que va en paralelo, unas 7 de reloj. De Facundo, alrededor de una hora en total, en cinco momentos (marcados con **F**).

### Fase A · Hoy, 2026-10-27, en paralelo desde ya

| Paso | Agente | Qué hace | Archivos | Depende de | Cómo se sabe que está bien |
|---|---|---|---|---|---|
| **F1** | Facundo | 3.2 (sign-ups fuera, dos claves secretas) y 3.3 (las cuatro variables) | Supabase, Vercel, `.env.local` | — | Las dos claves salen en Project Settings → API Keys con sus nombres; en Vercel, solo en Production |
| A1 | `backend` | La `0001` (sección 4) y, en el repo `fsm-finance`, la `0017` (6.4) | `supabase/migraciones/0001_consultoria.sql`; `fsm-finance/supabase/migraciones/0017_consultoria_solo_lectura.sql` | — | Comparadas con la `0013`, `0015` y `0016`, solo cambia lo de la sección 4; las comprobaciones de 4.4 escritas en la cabecera; ningún dato |
| A2 | `backend` | `lib/base/cliente.ts`, `lib/consultoria/` (7.1, sin las pantallas), `sesion.ts`, `@supabase/supabase-js` 2.117.2, `test` y `erasableSyntaxOnly`, `.env.example` | `lib/base/`, `lib/consultoria/`, `package.json`, `package-lock.json`, `tsconfig.json`, `.env.example` | — | `npm test`: 105 en verde; `npx tsc --noEmit` y `npm run lint` limpios; el `grep` de la sección 5 |
| A3 | `frontend` | Empieza ya a mudar `components/consultoria/` y `app/(panel)/consultoria/` (7.3), contra las firmas de `consultas.ts` y `acciones.ts`, que no cambian | `components/consultoria/`, `app/(panel)/consultoria/`, `components/navegacion.tsx`, `components/barra-ordenes.tsx` | Nada para empezar; A2 para compilar | Ver el paso B2 |

### Fase B · Hoy, por la tarde y la noche

| Paso | Agente | Qué hace | Archivos | Depende de | Cómo se sabe que está bien |
|---|---|---|---|---|---|
| B1 | `revisor-migraciones` | Revisa la `0001` (base vacía) y la `0017` (FSM-Finance, con datos reales: solo lee) | las dos migraciones | A1 | Visto bueno o cambios; nada ejecutado |
| **F2** | Facundo | Ejecuta la `0001` en `fsmtech` y pasa las comprobaciones de 4.4 | editor SQL de `fsmtech` | B1, F1 | Los seis resultados de 4.4 |
| B2 | `backend` | Los scripts (sección 8) y `consultoria-copiar.mjs` (6.1) | `scripts/consultoria-*.mjs`, `package.json` | A2 | Contra FSM-Finance y la base vacía, la vista previa de la copia enseña origen con las cifras de 6.1 y destino a cero; `consultoria:firma` en vista previa da las mismas fechas que en origen |
| B3 | `frontend` | Termina las pantallas y las conecta a `lib/consultoria/` | los de A3 | A2, A3 | `npm run build` limpio; con la base vacía, la sección dice «falta la copia»; sin variables, «falta configurar la base»; a 390 px, nada ensancha la página (la lista de qué mirar, para Facundo); en modo oscuro se lee todo |
| B4 | Sesión principal, con **F3** | `consultoria:copiar` en vista previa; con el visto bueno de Facundo, `--guardar`, y otra vez en vista previa | — | F2, B2 | **Todo «igual»**, con las cifras de 6.1 en las dos columnas |
| B5 | Sesión principal | `npm test`, `tsc`, lint, build; `npm run dev` contra la base copiada: las cifras de 6.1 en Resumen, Liquidaciones, Clientes y la hucha; cualquier guardado devuelve el error de 6.2; skill `web-design-guidelines` sobre lo nuevo | — | B3, B4 | Todo lo anterior |
| B6 | `guardian-docs` | README, `CLAUDE.md` (las reglas nuevas: la base solo por `baseDeDatos()`, la consultoría y sus scripts, `npm test`), `docs/arquitectura.md` (la base, sus variables y su seguridad), un `docs/base-de-datos.md` corto que remita a la `0001` y a la spec de origen, y la nota del proyecto | docs del panel | B5 | Nada contradice al código |
| — | Sesión principal | Commits en `req-001-consultoria`, `tipo(ámbito): descripción [REQ-001]` | — | B6 | |

### Fase C · Mañana, 2026-10-28, por la mañana

| Paso | Quién | Qué hace | Depende de | Cómo se sabe que está bien |
|---|---|---|---|---|
| **F4** | Facundo | Fusiona en `main` y hace push: Vercel lo publica | B5 | En producción, `/consultoria` enseña las cifras de 6.1 y el aviso «aquí todavía no se guarda nada»; sin sesión, lleva a `/login` |
| **F5** | Facundo y la sesión principal | **El cambio** (6.4): la `0017` en FSM-Finance, la copia hasta «todo igual», `fuente_desde`, y las reglas de la bóveda | F4 | En FSM-Finance, guardar una firma falla; en el panel, ya no sale el aviso y «Nueva firma» guarda |
| C1 | Facundo | La n.º 6 en el panel (sección 11), con el recibo del RC | F5 | Octubre como el documento de OVB; la casilla de OVB marcada |

**Hora límite**: si a las 12:00 del 2026-10-28 no está F5, la n.º 6 se marca en FSM-Finance (sección 11) y el cambio se hace otro día: la copia la trae.

### Fase D · Después (sección 13), cada una con su rama y su visto bueno

## 13. Después

### 13.1 Quitar la consultoría de FSM-Finance (unas 3 h, más la revisión)
Cuando Facundo lo haya comprobado en el panel (propuesta: tras un ciclo entero, hacia el 2026-11-04):
1. `backend` y `frontend`, en el repo `fsm-finance`, rama `req-001-quitar-consultoria`: fuera las páginas de `src/app/consultoria/` (la ruta, mejor una redirección a `https://dashboard.facundosmtech.com/consultoria`), las entradas de `BarraLateral` y de «Más» de `NavegacionMovil`, `src/lib/consultoria/`, `src/componentes/consultoria/`, `exigirConsultor()`, los `scripts/consultoria-*.mjs` y sus atajos (y el `test` si no quedan pruebas); en `borrar-cuenta.mjs`, `contarConsultoria`; la documentación (`CLAUDE.md`, README, `docs/`); la spec y los ADR 001 a 006 se quedan, marcados «se mudó al panel». Se publica (push de Facundo) y se comprueba que nada falla
2. `consultoria:copiar --exportar <archivo>` justo antes (la copia de seguridad, fuera de los repos)
3. `0018_borrar_consultoria.sql`: `drop` de las vistas, las funciones (también `es_consultor()`), los disparadores y las diez tablas. **Irreversible**: la revisa el `revisor-migraciones` y la ejecuta Facundo, después del paso 1
4. `guardian-docs` en los dos repos

### 13.2 Las tareas de las unidades, solo en el panel
1. **El nivel con cada herramienta redondeada a unidades enteras**, como OVB (en `reglas.ts` y en el acumulado de los scripts), y las unidades previas de 2,80 a 0 con el visto bueno de Facundo. Unas 1,5 h. Propuesta: 2026-10-29
2. **AVANZA × 5** en `cuadro.ts` (9 u para el nivel en un PIAS de 100 €/mes). 0,5 h. 2026-10-29
3. **Las dos cifras en los seguros** que se cobran de una vez (Allianz): «Nueva firma» y `consultoria:firma` piden las que se cobran y las que cuentan, y el cuadro de Allianz lo explica (19 u por cada 100 € de prima neta anual). Unas 1,5 h. Antes de la próxima firma de un seguro (propuesta: 2026-11-06)

### 13.3 Exportar la base cada semana
Con el plan gratuito no hay copias. Un `consultoria:exportar <archivo>` que escriba la base del panel en JSON fuera de los repos (como `--exportar` de 6.1), y una línea en la revisión semanal para lanzarlo. Unas 0,5 h.

### 13.4 Economía desde la base (si Facundo quiere)
Economía lee el importe a pagar de cada mes de la base, sin nombres, para `linea: consultoria-financiera`, y la nota de cobros de OVB deja de llevar casillas. Un cambio de una vez (sección 9). Unas 2 h.

### 13.5 Mejoras sin fecha
Las del retomar de FSM-Finance (la pantalla de `guardarLiquidacion`, editar reclamaciones y el reparto de un extorno, las hojas con `<dialog>`, que los scripts usen `mesesDeLiquidacion`), y renombrar `components/consultoria/` a guiones.

## 14. Criterios de aceptación: cómo se comprueba

| Criterio | Comprobación |
|---|---|
| Base propia, en Europa, cerrada | Comprobaciones 1, 4 y 6 de 4.4: sin políticas, sin permisos para `anon` ni `authenticated`, un solo consultor |
| Las cuentas no cambian | `npm test` en el panel: 105 en verde; comprobaciones 2, 3 y 5 de 4.4 |
| Sin perder nada | `consultoria:copiar` en vista previa después de guardar: recuentos y huellas iguales en las once tablas, y las cifras de 6.1 |
| La sección en el panel | Con la base copiada, Resumen, Liquidaciones (abril 234,70; octubre, noviembre y diciembre), Clientes (14) y la hucha (115,62 a 2026-07-29) como en FSM-Finance; «Nueva firma» con AXA el 2026-10-27 enseña efecto 10/12 y cobro 31/12 antes de guardar |
| Solo con sesión | Sin cookie, `/consultoria/*` lleva a `/login`; una Server Action de la consultoría sin cookie no devuelve datos ni escribe |
| Nada escribe antes del cambio | Con `fuente_desde` nulo, guardar devuelve el error de 6.2 y los scripts con `--guardar` paran |
| FSM-Finance congelada | Tras la `0017`, `consultoria:firma --guardar` de FSM-Finance falla con `42501` |
| Sin nombres fuera | El `grep` de la sección 5; `lib/avisos.ts`, `lib/informes.ts`, `lib/boveda/` y `app/api/vigilancia/` no importan `lib/consultoria/` ni `lib/base/` |
| 390 px y modo oscuro | La lista que deja el `frontend` (la revisión visual la hace Facundo a mano) |

## 15. Riesgos

| Riesgo | Plan B |
|---|---|
| No da tiempo a las pantallas (son unas 5.200 líneas entre componentes y páginas) | Se mudan tal cual con los colores cambiados y se pulen después; y si aun así no llegan, la hora límite de la fase C: la n.º 6 en FSM-Finance |
| La copia no cuadra | No se da el cambio: se mira qué tabla tiene otra huella, se vacía (6.3) y se repite. FSM-Finance sigue intacta |
| Una inserción falla a medias | Vaciar y repetir: el destino está vacío hasta el cambio |
| Se apunta algo en FSM-Finance entre la última copia y el cambio | La `0017` va antes de la copia final, y la copia final compara: no se pierde |
| Algo va mal después del cambio | El plan B de 6.4: volver a FSM-Finance con su bloque de deshacer |
| Un `try` que traga el `redirect` de `verificarSesion()` | Revisarlo en `acciones.ts` (7.1); probarlo con la cookie borrada |
| La clave secreta se filtra | Crear otra, cambiarla en Vercel, redesplegar y borrar la vieja (ADR-002) |
| La base gratuita se pausa (una semana sin uso) | Se reactiva desde Supabase; la exportación semanal (13.3); o Pro |
| Next 16 trae algo distinto en el panel (16.3.5) y en FSM-Finance (16.3.6) | Misma versión mayor; ante la duda, `node_modules/next/dist/docs/` del panel |

## 16. Preguntas para Facundo
1. **La hora límite del 2026-10-28**: se propone las 12:00. Si no está el cambio, la n.º 6 va a FSM-Finance
2. **Plan gratuito o Pro**: se recomienda gratuito ahora, con la exportación semanal (13.3), y pasar a Pro cuando la base guarde algo más que la consultoría
3. **Cuándo borrar las tablas de FSM-Finance** (irreversible): se recomienda tras un ciclo entero en el panel, hacia el 2026-11-04, con la exportación justo antes
4. **Economía, de las casillas o de la base** (13.4): se recomienda seguir con las casillas hasta que la mudanza esté asentada y hacerlo después, de una vez
