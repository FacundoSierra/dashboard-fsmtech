# Base de datos

**Estado (2026-10-28):** la `0001_consultoria.sql` está ejecutada en `fsmtech` y los datos copiados de FSM-Finance con «todo igual». El cambio se hizo el 2026-10-27 a las 13:27 (`fuente_desde` puesto): la base del panel es la fuente. Lo que sigue de REQ-001, en la sección 13 de `docs/specs/req-001-consultoria-en-el-panel.md`.

**Estado (2026-11-01):** la `0002_cuotas_recurrentes.sql` (REQ-002) está ejecutada en `fsmtech` y comprobada: todas sus comprobaciones salieron como se esperaba (las 11 de solo lectura, las doce situaciones de la prueba grande paradas con su mensaje y `anon` y `authenticated` rechazados).

## Motor
- Supabase (Postgres), proyecto `fsmtech`, West EU (Irlanda, `eu-west-1`), plan gratuito: sin copias de seguridad (la exportación semanal es la 13.3 de la spec)
- Sin ORM: el servidor del panel entra con `@supabase/supabase-js` por `baseDeDatos()` (`lib/base/cliente.ts`), y los scripts del PC por `scripts/consultoria-comun.mjs`. Por qué y con qué clave: ADR-001 y ADR-002, y la sección «Base de datos: la consultoría» de `docs/arquitectura.md`

## Qué hay: la consultoría (REQ-001)
Es la consultoría de FSM-Finance, con **los mismos nombres de tablas, columnas, restricciones, índices y vistas, y las columnas en el mismo orden**. No se repite aquí:
- **La migración**, con sus comprobaciones en la cabecera: `supabase/migraciones/0001_consultoria.sql`
- **El porqué de cada tabla y las reglas de negocio**: la spec de origen, en el repo `fsm-finance`, `docs/specs/req-001-consultoria.md`, secciones 2 y 11, y su `docs/base-de-datos.md`

Lo que crea la `0001`:

| Qué | Nombres |
|---|---|
| Tablas (11) | `consultoria_consultores` (la nueva), `consultoria_companias`, `consultoria_ajustes`, `consultoria_niveles`, `consultoria_cierres`, `consultoria_clientes`, `consultoria_liquidaciones`, `consultoria_herramientas`, `consultoria_extornos`, `consultoria_cuenta` y `consultoria_hucha` |
| Vistas (5), con `security_invoker = on` | `consultoria_lineas`, `consultoria_liquidaciones_por_mes`, `consultoria_cuenta_movimientos`, `consultoria_hucha_movimientos` y `consultoria_clientes_resumen` |
| Funciones de «Ha llegado» y «Deshacer» | `consultoria_liquidar_mes(p_consultor, …)` y `consultoria_deshacer_liquidacion(p_consultor, p_id)` |
| Funciones de los disparadores | `consultoria_proteger_herramienta`, `_extorno`, `_cargo`, `_liquidacion` y `_aportacion`: lo cobrado no cambia por debajo |

Dinero en `numeric(12,2)` (las unidades, en `numeric(10,2)`), fechas contables en `date`, y los importes de cada herramienta en columnas generadas (`bruto`, `hucha`, `irpf` y `neto`; en los extornos, `resto`).

## Lo que cambia respecto a FSM-Finance (spec, sección 4)
- **`consultoria_consultores`**, la primera tabla: `id` (sin valor por defecto: la copia trae el de FSM-Finance, que no es un dato personal), `nombre`, `fuente_desde` (nulo hasta el cambio; puesto desde el 2026-10-27) y `creado_en`. Solo puede haber uno (`consultoria_consultores_uno`). El `consultor_id` de las otras diez tablas apunta aquí, con el mismo nombre y el mismo valor
- **Sin `perfiles`, sin `es_consultor()`, sin políticas** (fuera los diez `create policy`) y sin la siembra de compañías: las compañías llegan con la copia
- **Solo en `fsmtech`**: la `0001` se para antes de cambiar nada si la base tiene `perfiles`, porque esa es la de FSM-Finance. Los scripts hacen lo mismo al conectar
- **`p_consultor`**: las dos funciones lo reciben como primer parámetro, porque con la clave secreta no hay `auth.uid()`. Si es nulo o no está en `consultoria_consultores`, `42501` («No hay consultor»)
- **Permisos, cerrados a todo salvo `service_role`**:
  - RLS activo en las once tablas y ninguna política
  - Tablas: `select, insert, update, delete` solo a `service_role`, sin `truncate` (vaciar lo hace Facundo como `postgres`, con el bloque de la 6.3 de la spec, solo antes del cambio)
  - **La excepción, `consultoria_consultores`**: `service_role` tiene `select, insert, delete` y solo `update (nombre)`. **`fuente_desde` lo cambia Facundo como `postgres`** en el editor SQL; ningún código lo toca
  - Vistas: `select` solo a `service_role`
  - Funciones: las dos de las liquidaciones, solo `service_role`; las de los disparadores, nadie
  - Lo que se cree después en `public`: sin permisos por defecto para `anon` ni `authenticated` (tablas, secuencias y funciones). El `execute` de `public` en las funciones nuevas no se quita así: **cada función lleva su `revoke … from public`**

## La 0002: las comisiones recurrentes (REQ-002)
Una herramienta que se cobra por recibo trimestral o semestral es una **serie**, y cada cuota es una fila más de `consultoria_herramientas`. Solo añade: ninguna tabla nueva, «Ha llegado» y «Deshacer» no cambian y no toca ningún dato. Por qué: ADR-004. Diseño y comprobaciones: `docs/specs/req-002-comisiones-recurrentes.md`, sección 4. Migración: `supabase/migraciones/0002_cuotas_recurrentes.sql`.

| Qué | Nombres |
|---|---|
| Columnas nuevas de `consultoria_herramientas` | `cuotas_cada_meses` (`smallint`, 3 o 6; en la serie), `unidades_cuota` (`numeric(10,2)`; en la serie), `cuota_de` (`uuid`; en la cuota) y `cuota_periodo` (`date`, el día 1 de su periodo natural; en la cuota) |
| Restricciones | `consultoria_herramientas_serie` y `consultoria_herramientas_cuota` (`check`, escritos para no dar nunca NULL), `consultoria_herramientas_cuota_fk` (`on delete restrict`: una herramienta con cuotas no se borra) e índice único `consultoria_herramientas_cuota_unica (cuota_de, cuota_periodo)` |
| Disparador | `consultoria_herramienta_cuota`, con la función `consultoria_proteger_cuota()`: la cuota es del mismo cliente y consultor que su serie, una cobrada no cambia de periodo, y una serie con cuotas no deja de serlo ni cambia de cliente |
| Función | `consultoria_programar_cuotas(p_consultor, p_herramienta, p_periodos, p_cobros, p_pct_irpf)`: crea las cuotas que faltan y devuelve cuántas; relanzarla no duplica. Solo `service_role`. No repite la regla: la recibe de `reglas.ts` |
| Vista | `consultoria_lineas` gana `cuota_de` y `cuota_periodo` al final, con `security_invoker = on` |

Una cuota copia de su serie el cliente, la compañía, el producto, el mes de producción, el efecto, el €/unidad y la hucha. Lleva `unidades` = `unidades_cuota`, `unidades_nivel` 0, `aportacion` nula y el IRPF de Ajustes del momento en que se programa.

## Migraciones
- En `supabase/migraciones/NNNN_titulo.sql`, numeradas desde `0001`, con un comentario arriba que dice qué y por qué, y sus comprobaciones
- Que se puedan ejecutar dos veces sin romper nada (`if not exists`, `create or replace`, `drop … if exists`). Para corregir una tabla ya creada, otra migración
- **Las ejecuta Facundo** en el editor SQL de `fsmtech`, después del `revisor-migraciones`. Nunca un agente ni el código
- Lo que entre después (ADR-001): tablas en `public` con el prefijo de su módulo (`<modulo>_*`), en español; cada tabla con RLS y `grant` solo a `service_role`; cada función con su `revoke … from public`
