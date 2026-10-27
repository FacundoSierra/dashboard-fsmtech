-- La consultoría de OVB en la base propia del panel, `fsmtech` (REQ-001: sección 4 de
-- docs/specs/req-001-consultoria-en-el-panel.md; ADR-001, ADR-002 y ADR-003). Es la primera
-- migración de esta base y se ejecuta con la base vacía. **Solo en `fsmtech`**: en la base de
-- FSM-Finance no se ejecuta nunca.
--
-- Qué es: el estado final de la consultoría de FSM-Finance (sus migraciones 0013, 0015 y 0016) en
-- una sola migración, porque en una base vacía no hay historia que repetir: las tablas, las columnas
-- generadas, los disparadores, las cinco vistas y las dos funciones de «Ha llegado» y «Deshacer».
-- **Mismos nombres de tablas, columnas, restricciones, índices y vistas, y las columnas en el mismo
-- orden** (`aportacion_de` va al final de `consultoria_herramientas`, donde la dejó el
-- `add column` de la 0016, y al final de `consultoria_lineas`): así el código de `lib/consultoria/`,
-- sus mensajes de error (`RESTRICCIONES` de `acciones.ts`) y la copia de los datos
-- (`consultoria:copiar`, que compara filas de las dos bases) no cambian. Las reglas de negocio y el
-- porqué de cada tabla están en la spec de origen: repo fsm-finance, docs/specs/req-001-consultoria.md,
-- secciones 2 y 11.
--
-- Lo único que cambia respecto a FSM-Finance (sección 4 de la spec):
-- 1. **El consultor, sin `perfiles`.** Esta base no tiene usuarios de la aplicación: el consultor es
--    una fila de `consultoria_consultores`, la primera tabla, con un índice único que solo deja una
--    (`consultoria_consultores_uno`: hay un solo consultor, y el código y los scripts usan «el
--    único»). `consultor_id` se queda en las diez tablas, con el mismo nombre y el mismo valor (la
--    copia trae el `id` de FSM-Finance, que no es un dato personal), y apunta aquí con
--    `on delete restrict`. Las FK compuestas, las PK y los índices no cambian. `fuente_desde` es nulo
--    hasta el cambio (sección 6.4): mientras lo sea, el panel no escribe y la copia se puede repetir
-- 2. **Cerrada a todo salvo `service_role`** (ADR-002). El panel entra con una clave secreta, que es
--    `service_role` y se salta el RLS. RLS activo en las once tablas y **ninguna política**: para
--    cualquier otro rol no hay filas. Permisos: tablas, `select, insert, update, delete` solo a
--    `service_role` (sin `truncate`: vaciar lo hace Facundo como `postgres`, sección 6.3), salvo en
--    `consultoria_consultores`, donde `service_role` no cambia `fuente_desde` (solo `nombre`): el
--    cambio lo hace Facundo como `postgres`. Las ejecuciones se paran si la base es la de
--    FSM-Finance (tiene `perfiles`); vistas,
--    `select` solo a `service_role`, y siguen con `security_invoker = on` por si un día hay
--    usuarios. Fuera `es_consultor()`, que leía `perfiles`, y los diez `create policy`
-- 3. **«Ha llegado» y «Deshacer» reciben el consultor** como primer parámetro (`p_consultor`), porque
--    con la clave secreta `auth.uid()` es nulo. Si es nulo o no está en `consultoria_consultores`,
--    `42501` («No hay consultor»). El resto del cuerpo, igual que en la 0013. Solo para
--    `service_role`
-- 4. **Sin la siembra de compañías**: vienen con la copia, y sin filas `reglas.ts` usa las de serie
-- 5. **Lo que se cree después en `public`, cerrado por defecto**: se quitan a `anon` y
--    `authenticated` los permisos que Supabase da solos a las tablas, secuencias y funciones nuevas
--    que cree `postgres`. Ojo: el `execute` que Postgres da a `public` en toda función nueva es un
--    permiso por defecto global, y un `alter default privileges … in schema public` no puede
--    quitarlo (la documentación de Postgres: «Per-schema REVOKE is only useful to reverse the
--    effects of a previous per-schema GRANT»). Por eso cada función de esta migración lleva su
--    `revoke … from public`, y cada una que venga después tiene que llevar el suyo
--
-- La seguridad de los datos es la del acceso al panel (`verificarSesion()` dentro de
-- `baseDeDatos()`): el RLS no frena un fallo del código del panel, solo cierra la puerta a la clave
-- publicable y a cualquier otro rol (ADR-002).
--
-- **Datos**: ninguno. Ni el consultor, ni las compañías, ni nada de nadie: todo llega con
-- `consultoria:copiar` (sección 6.1).
--
-- Se puede ejecutar más de una vez sin estropear nada (`if not exists`, `create or replace`,
-- `drop … if exists`; los `revoke` y `grant` dejan lo mismo). Ojo: si una tabla ya existe, volver a
-- ejecutarla no le cambia las columnas ni las restricciones; para corregir una tabla ya creada hace
-- falta otra migración (la 0002).
--
-- Comprobaciones después de ejecutarla, en el editor SQL de `fsmtech`, **cada bloque por separado**.
-- Están pensadas para la base vacía, antes de la copia (y siguen valiendo después). Las de 1 y 2
-- solo leen. Las de 3 a 6 son bloques `do` que **acaban en un error rojo a propósito**: el mensaje
-- del error enseña el resultado y, al fallar, no se guarda nada. Crean dentro su propio consultor de
-- prueba si no hay ninguno (y si ya hay uno, usan ese) y la compañía AXA si falta, y usan meses de
-- 2099 para no mezclarse con datos de verdad:
/*
-- 1. Cerrada: RLS, políticas y permisos
select relname, relrowsecurity
  from pg_class
 where relnamespace = 'public'::regnamespace and relname like 'consultoria%' and relkind = 'r'
 order by 1;
-- Esperado: once tablas (ajustes, cierres, clientes, companias, consultores, cuenta, extornos,
-- herramientas, hucha, liquidaciones y niveles, con su «consultoria_» delante), todas true

select count(*) as politicas from pg_policies where schemaname = 'public' and tablename like 'consultoria%';
-- Esperado: 0

select c.relname, c.relkind,
       has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate, references, trigger')          as anon,
       has_table_privilege('authenticated', c.oid, 'select, insert, update, delete, truncate, references, trigger') as authenticated,
       has_table_privilege('service_role', c.oid, 'select')                         as sr_lee,
       has_table_privilege('service_role', c.oid, 'insert, update, delete')         as sr_escribe,
       has_table_privilege('service_role', c.oid, 'truncate, references, trigger')  as sr_lo_demas
  from pg_class c
 where c.relnamespace = 'public'::regnamespace and c.relname like 'consultoria%' and c.relkind in ('r', 'v')
 order by c.relkind, c.relname;
-- Esperado: las once tablas (r): false · false · true · true · false
--           las cinco vistas (v): false · false · true · false · false

select c.relname, pg_get_userbyid(a.grantee) as rol, a.privilege_type
  from pg_class c, aclexplode(c.relacl) a
 where c.relnamespace = 'public'::regnamespace and c.relname like 'consultoria%' and c.relkind in ('r', 'v')
   and pg_get_userbyid(a.grantee) not in ('postgres', 'service_role');
-- Esperado: ninguna fila. Nadie más que postgres (el dueño) y service_role tiene permisos

select has_column_privilege('service_role', 'public.consultoria_consultores', 'nombre', 'update')       as sr_cambia_nombre,
       has_column_privilege('service_role', 'public.consultoria_consultores', 'fuente_desde', 'update') as sr_cambia_fuente;
-- Esperado: true · false (el cambio, `fuente_desde`, solo lo hace Facundo como postgres)

select p.proname, pg_get_function_identity_arguments(p.oid) as argumentos,
       has_function_privilege('anon', p.oid, 'execute')          as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('service_role', p.oid, 'execute')  as service_role
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.proname like 'consultoria%'
 order by 1;
-- Esperado: consultoria_deshacer_liquidacion (p_consultor uuid, p_id uuid) y consultoria_liquidar_mes
-- (p_consultor uuid, p_mes date, …): false · false · true. Las cinco consultoria_proteger_*
-- (aportacion, cargo, extorno, herramienta y liquidacion): false · false · false

select to_regprocedure('public.es_consultor()') as es_consultor;
-- Esperado: nulo (no existe)

select count(*) as anon_o_authenticated
  from pg_default_acl d, aclexplode(d.defaclacl) a
 where d.defaclrole = 'postgres'::regrole
   and d.defaclnamespace = 'public'::regnamespace
   and pg_get_userbyid(a.grantee) in ('anon', 'authenticated');
-- Esperado: 0. Para verlo entero:
--   select pg_get_userbyid(defaclrole) as de, defaclobjtype as tipo, defaclacl
--     from pg_default_acl where defaclnamespace = 'public'::regnamespace order by 1, 2;
-- Las filas de `postgres` (r tablas, S secuencias, f funciones), sin anon ni authenticated. Si sale
-- alguna de `supabase_admin` que los nombre, vale solo para lo que crea ese rol: aquí todo lo crea
-- `postgres`

-- 2. Columnas generadas, guardadas (attgenerated = 's')
select attrelid::regclass as tabla, attname as columna, attgenerated
  from pg_attribute
 where attrelid in ('public.consultoria_herramientas'::regclass, 'public.consultoria_extornos'::regclass)
   and attgenerated <> '' and not attisdropped
 order by 1, attnum;
-- Esperado: herramientas: bruto, hucha, irpf, neto; extornos: resto. Todas 's'

-- 3. Importes por fila y el IRPF sobre el total (como postgres)
do $$
declare v_yo uuid; v_filas text; v_mes text;
begin
  select id into v_yo from public.consultoria_consultores;
  if v_yo is null then
    insert into public.consultoria_consultores (id, nombre) values (gen_random_uuid(), 'Prueba') returning id into v_yo;
  end if;
  insert into public.consultoria_companias (consultor_id, codigo, nombre, regla, calendario, meses_hasta_cobro)
  values (v_yo, 'AXA', 'AXA', 'axa_pias', 'AXA_PIAS', 0)
  on conflict do nothing;

  with c as (insert into public.consultoria_clientes (consultor_id, nombre)
             values (v_yo, 'Prueba') returning id, consultor_id),
       h as (insert into public.consultoria_herramientas
               (consultor_id, cliente_id, compania, producto, aportacion, unidades, valor_unidad, pct_hucha, pct_irpf,
                mes_produccion, fecha_efecto, fecha_cobro, estado)
             select c.consultor_id, c.id, 'AXA', 'Prueba', 100, u, 2.00, 10, 15,
                    '2099-10-01', '2099-11-10', '2099-11-30', 'confirmada'
               from c, (values (40.80), (30.10)) as t(u)
             returning unidades, bruto, hucha, irpf, neto)
  select string_agg(concat_ws(' · ', bruto, hucha, irpf, neto), ' | ' order by unidades desc) into v_filas from h;
  select concat_ws(' · ', comision_pendiente, rc_pendiente, neta_pendiente, irpf_pendiente) into v_mes
    from public.consultoria_liquidaciones_por_mes where consultor_id = v_yo and mes = '2099-11-01';
  raise exception 'Prueba deshecha, no se ha guardado nada. Filas: % || Mes: %', v_filas, v_mes;
end $$;
-- Esperado. Filas: 81.60 · 8.16 · 11.02 · 62.42 | 60.20 · 6.02 · 8.13 · 46.05
--           Mes: 141.80 · 14.18 · 127.62 · 19.14 (sobre el total; fila a fila serían 19,15)

-- 4. anon y authenticated no leen ni escriben (lo que tendría quien se hiciera con la clave publicable)
do $$
declare
  v_rol text;
  r     text;
begin
  foreach v_rol in array array['anon', 'authenticated'] loop
    execute format('set local role %I', v_rol);
    begin
      perform 1 from public.consultoria_clientes;
      r := concat_ws(' | ', r, v_rol || ' lee clientes: ENTRA');
    exception
      when insufficient_privilege then r := concat_ws(' | ', r, v_rol || ' lee clientes: rechazado');
    end;
    begin
      perform 1 from public.consultoria_lineas;
      r := concat_ws(' | ', r, v_rol || ' lee líneas: ENTRA');
    exception
      when insufficient_privilege then r := concat_ws(' | ', r, v_rol || ' lee líneas: rechazado');
    end;
    begin
      insert into public.consultoria_clientes (consultor_id, nombre) values (gen_random_uuid(), 'Prueba');
      r := concat_ws(' | ', r, v_rol || ' escribe clientes: ENTRA');
    exception
      when insufficient_privilege then r := concat_ws(' | ', r, v_rol || ' escribe clientes: rechazado');
      when others then r := concat_ws(' | ', r, v_rol || ' escribe clientes: NO LO PARAN LOS PERMISOS (' || sqlstate || ')');
    end;
    reset role;
  end loop;
  raise exception 'Prueba deshecha, no se ha guardado nada. %', r;
end $$;
-- Esperado: anon lee clientes: rechazado | anon lee líneas: rechazado | anon escribe clientes: rechazado
--         | authenticated lee clientes: rechazado | authenticated lee líneas: rechazado
--         | authenticated escribe clientes: rechazado

-- 5. Como el panel (service_role): disparadores y funciones, con p_consultor
do $$
declare
  v_yo uuid; v_cli uuid; v_cli2 uuid; v_h1 uuid; v_h2 uuid; v_h3 uuid; v_apex uuid; v_cargo uuid; v_liq uuid; v_ext uuid;
  r_estado text; r_cobro date; r_hucha numeric; r_cargo text;
  r_cambio text; r_otro_mes text; r_cargo_fijo text; r_mes_liq text; r_desh1 text; r_desh2 text; r_cargo_suelto text;
  r_apex_otro text; r_apex_dos text; r_sin text; r_no_esta text;
begin
  set local role service_role;
  select id into v_yo from public.consultoria_consultores;
  if v_yo is null then
    insert into public.consultoria_consultores (id, nombre) values (gen_random_uuid(), 'Prueba') returning id into v_yo;
  end if;
  insert into public.consultoria_companias (consultor_id, codigo, nombre, regla, calendario, meses_hasta_cobro)
  values (v_yo, 'AXA', 'AXA', 'axa_pias', 'AXA_PIAS', 0)
  on conflict do nothing;

  -- Lo nuevo de la 0001: sin consultor, o con uno que no está, no hacen nada
  begin
    perform public.consultoria_liquidar_mes(p_consultor => null, p_mes => '2099-11-01', p_fecha => '2099-11-27',
              p_entraron => '{}'::uuid[], p_extornos => '{}'::uuid[]);
    r_sin := 'NO LO HA PARADO';
  exception when insufficient_privilege then get stacked diagnostics r_sin = message_text;
  end;
  begin
    perform public.consultoria_deshacer_liquidacion(p_consultor => gen_random_uuid(), p_id => gen_random_uuid());
    r_no_esta := 'NO LO HA PARADO';
  exception when insufficient_privilege then get stacked diagnostics r_no_esta = message_text;
  end;

  insert into public.consultoria_clientes (consultor_id, nombre) values (v_yo, 'Prueba') returning id into v_cli;
  insert into public.consultoria_clientes (consultor_id, nombre) values (v_yo, 'Prueba B') returning id into v_cli2;
  insert into public.consultoria_herramientas
    (consultor_id, cliente_id, compania, producto, aportacion, unidades, valor_unidad, pct_hucha, pct_irpf,
     mes_produccion, fecha_efecto, fecha_cobro, estado)
  values (v_yo, v_cli, 'AXA', 'Prueba', 100, 40.80, 2.00, 10, 15, '2099-10-01', '2099-11-10', '2099-11-30', 'confirmada')
  returning id into v_h1;
  insert into public.consultoria_herramientas
    (consultor_id, cliente_id, compania, producto, aportacion, unidades, valor_unidad, pct_hucha, pct_irpf,
     mes_produccion, fecha_efecto, fecha_cobro, estado)
  values (v_yo, v_cli, 'AXA', 'Prueba', 100, 81.60, 2.00, 10, 15, '2099-10-01', '2099-11-10', '2099-11-30', 'prevista')
  returning id into v_h2;
  insert into public.consultoria_herramientas
    (consultor_id, cliente_id, compania, producto, aportacion, unidades, valor_unidad, pct_hucha, pct_irpf,
     mes_produccion, fecha_efecto, fecha_cobro, estado)
  values (v_yo, v_cli, 'AXA', 'Prueba', 100, 30.10, 2.00, 10, 15, '2099-11-01', '2099-12-10', '2099-12-31', 'confirmada')
  returning id into v_h3;
  insert into public.consultoria_cuenta (consultor_id, fecha, concepto, importe)
  values (v_yo, '2099-11-20', 'Curso de prueba', -30) returning id into v_cargo;

  v_liq := public.consultoria_liquidar_mes(p_consultor => v_yo, p_mes => '2099-11-01', p_fecha => '2099-11-27',
             p_entraron => array[v_h1], p_extornos => '{}'::uuid[], p_cargos => array[v_cargo],
             p_numero => 1, p_motivo => 'prueba');
  select estado      into r_estado from public.consultoria_herramientas where id = v_h1;
  select fecha_cobro into r_cobro  from public.consultoria_herramientas where id = v_h2;
  select importe     into r_hucha  from public.consultoria_hucha_movimientos where liquidacion_id = v_liq;
  select case when liquidacion_id = v_liq then 'aplicado' else 'NO APLICADO' end into r_cargo
    from public.consultoria_cuenta where id = v_cargo;

  begin
    update public.consultoria_herramientas set unidades = 50 where id = v_h1;
    r_cambio := 'NO LO HA PARADO';
  exception when raise_exception then r_cambio := 'parado';
  end;
  begin
    update public.consultoria_herramientas set estado = 'cobrada', liquidacion_id = v_liq where id = v_h3;
    r_otro_mes := 'NO LO HA PARADO';
  exception when raise_exception then r_otro_mes := 'parado';
  end;
  begin
    update public.consultoria_cuenta set importe = -40 where id = v_cargo;
    r_cargo_fijo := 'NO LO HA PARADO';
  exception when raise_exception then r_cargo_fijo := 'parado';
  end;
  -- El de la 0015: el mes de una liquidación con líneas no se cambia
  begin
    update public.consultoria_liquidaciones set mes = '2099-10-01' where id = v_liq;
    r_mes_liq := 'NO LO HA PARADO';
  exception when raise_exception then r_mes_liq := 'parado';
  end;

  update public.consultoria_herramientas set estado = 'anulada', anulada_el = '2099-12-05' where id = v_h1;
  insert into public.consultoria_extornos (consultor_id, herramienta_id, fecha, importe, de_hucha)
  values (v_yo, v_h1, '2099-12-05', 81.60, 81.60) returning id into v_ext;
  begin
    perform public.consultoria_deshacer_liquidacion(v_yo, v_liq);
    r_desh1 := 'NO LO HA PARADO';
  exception when raise_exception then get stacked diagnostics r_desh1 = message_text;
  end;

  delete from public.consultoria_extornos where id = v_ext;
  perform public.consultoria_deshacer_liquidacion(v_yo, v_liq);
  r_desh2 := case when exists (select 1 from public.consultoria_liquidaciones where id = v_liq)
                  then 'NO SE HA BORRADO' else 'deshecha' end;
  select case when liquidacion_id is null then 'sin aplicar' else 'SIGUE APLICADO' end into r_cargo_suelto
    from public.consultoria_cuenta where id = v_cargo;

  -- Los de la 0016: una APEX de otro cliente y una APEX de una APEX
  begin
    insert into public.consultoria_herramientas
      (consultor_id, cliente_id, compania, producto, periodicidad, aportacion, unidades, valor_unidad, pct_hucha, pct_irpf,
       mes_produccion, fecha_efecto, fecha_cobro, estado, aportacion_de)
    values (v_yo, v_cli2, 'AXA', 'Prueba', 'unica', 2000, 6, 2.00, 0, 15, '2099-11-01', '2099-12-10', '2099-12-31', 'prevista', v_h2);
    r_apex_otro := 'NO LO HA PARADO';
  exception when raise_exception then r_apex_otro := 'parado';
  end;
  insert into public.consultoria_herramientas
    (consultor_id, cliente_id, compania, producto, periodicidad, aportacion, unidades, valor_unidad, pct_hucha, pct_irpf,
     mes_produccion, fecha_efecto, fecha_cobro, estado, aportacion_de)
  values (v_yo, v_cli, 'AXA', 'Prueba', 'unica', 5000, 15, 2.00, 0, 15, '2099-11-01', '2099-12-10', '2099-12-31', 'prevista', v_h2)
  returning id into v_apex;
  begin
    insert into public.consultoria_herramientas
      (consultor_id, cliente_id, compania, producto, periodicidad, aportacion, unidades, valor_unidad, pct_hucha, pct_irpf,
       mes_produccion, fecha_efecto, fecha_cobro, estado, aportacion_de)
    values (v_yo, v_cli, 'AXA', 'Prueba', 'unica', 2000, 6, 2.00, 0, 15, '2099-11-01', '2099-12-10', '2099-12-31', 'prevista', v_apex);
    r_apex_dos := 'NO LO HA PARADO';
  exception when raise_exception then r_apex_dos := 'parado';
  end;

  raise exception 'Prueba deshecha, no se ha guardado nada. % | prevista al % | hucha % | cargo: % | cambiar una cobrada: % | colgar una de otro mes: % | cambiar un cargo aplicado: % | deshacer con extorno: «%» | deshacer sin extorno: % | cargo después: % || cambiar el mes de la liquidación: % | APEX de otro cliente: % | APEX de una APEX: % || sin consultor: «%» | consultor que no está: «%»',
    r_estado, r_cobro, r_hucha, r_cargo, r_cambio, r_otro_mes, r_cargo_fijo, r_desh1, r_desh2, r_cargo_suelto,
    r_mes_liq, r_apex_otro, r_apex_dos, r_sin, r_no_esta;
end $$;
-- Esperado: Prueba deshecha, no se ha guardado nada. cobrada | prevista al 2099-12-31 | hucha 8.16
--           | cargo: aplicado | cambiar una cobrada: parado | colgar una de otro mes: parado
--           | cambiar un cargo aplicado: parado
--           | deshacer con extorno: «La herramienta «Prueba» tiene un extorno: quítalo antes de deshacer la liquidación en que se cobró»
--           | deshacer sin extorno: deshecha | cargo después: sin aplicar
--        || cambiar el mes de la liquidación: parado | APEX de otro cliente: parado | APEX de una APEX: parado
--        || sin consultor: «No hay consultor» | consultor que no está: «No hay consultor»

-- 6. Un solo consultor
do $$
declare r text;
begin
  if not exists (select 1 from public.consultoria_consultores) then
    insert into public.consultoria_consultores (id, nombre) values (gen_random_uuid(), 'Prueba');
  end if;
  begin
    insert into public.consultoria_consultores (id, nombre) values (gen_random_uuid(), 'Prueba 2');
    r := 'ENTRA';
  exception when unique_violation then get stacked diagnostics r = constraint_name;
    r := 'rechazado por ' || r;
  end;
  raise exception 'Prueba deshecha, no se ha guardado nada. Un segundo consultor: %', r;
end $$;
-- Esperado: Un segundo consultor: rechazado por consultoria_consultores_uno
*/

-- ───────────────── Solo en `fsmtech` ─────────────────
-- Si la base tiene `perfiles`, es la de FSM-Finance: allí esta migración dejaría a la aplicación sin
-- acceso a la consultoría (los `revoke` de abajo). Se para antes de cambiar nada
do $$
begin
  if to_regclass('public.perfiles') is not null then
    raise exception 'Esta es la base de FSM-Finance: la 0001 es solo para fsmtech. No se ha cambiado nada';
  end if;
end $$;

-- ───────────────── Lo que se cree después en `public`, cerrado por defecto ─────────────────
-- Supabase daba a `anon`, `authenticated` y `service_role` todos los permisos sobre lo nuevo que
-- crea `postgres` en `public`, y algún proyecto creado en octubre de 2026 los seguía trayendo aunque
-- se desmarcara «Automatically expose new tables» (`desarrollo/base-de-datos/
-- permisos-por-defecto-de-supabase.md` de la bóveda). Aquí se quitan a `anon` y `authenticated`
-- antes de crear nada, para que salga igual traiga lo que traiga el proyecto. `service_role`
-- conserva los suyos, y cada migración da los que tocan, explícitos. El `execute` de `public` en las
-- funciones no se puede quitar así (ver arriba, punto 5): cada función lleva su `revoke … from public`
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

-- ───────────────── El consultor ─────────────────
-- Uno solo (Facundo, 2026-10-25). Sin `default` en el `id`: la copia trae el de FSM-Finance, el
-- mismo que llevan en `consultor_id` todas las filas. `fuente_desde`: nulo hasta el cambio
-- (sección 6.4); desde entonces, esta base es la fuente, el panel escribe y la copia se niega
create table if not exists public.consultoria_consultores (
  id           uuid primary key,
  nombre       text not null check (char_length(btrim(nombre)) between 1 and 60),
  fuente_desde timestamptz,
  creado_en    timestamptz not null default now()
);

-- Un solo consultor: el código y los scripts usan «el único». Un índice sobre una constante solo
-- admite una fila
create unique index if not exists consultoria_consultores_uno on public.consultoria_consultores ((true));

-- ───────────────── La cartera ─────────────────
-- Lo mínimo de cada cliente: no hay columnas para DNI, IBAN, salud, contacto ni número de póliza, y
-- no se añaden. Sin unicidad por nombre: puede haber dos «Juan» (los scripts paran si un nombre
-- coincide con más de uno)
create table if not exists public.consultoria_clientes (
  id               uuid primary key default gen_random_uuid(),
  consultor_id     uuid not null references public.consultoria_consultores (id) on delete restrict,
  nombre           text not null check (char_length(btrim(nombre)) between 1 and 80),
  referencia       text check (char_length(referencia) <= 40),   -- quién lo refirió: «ref. Marta»
  proxima_revision date,
  notas            text check (char_length(notas) <= 500),        -- breves y sin datos personales
  creado_en        timestamptz not null default now(),
  -- Para las FK compuestas: lo de un cliente solo puede ser de su consultor
  unique (id, consultor_id)
);

create index if not exists consultoria_clientes_consultor_idx
  on public.consultoria_clientes (consultor_id, nombre);

-- ───────────────── Las compañías ─────────────────
-- El «Partner» de la liquidación. Son datos: una nueva se añade sin tocar el código, y una que no
-- tenga regla propia se trata como «sin calendario». `regla` dice cómo salen las fechas;
-- `calendario`, qué cierre sigue; `pct_hucha`, la reserva por defecto de sus productos que no tengan
-- la suya en el cuadro (nula = la de Ajustes); `meses_hasta_cobro`, los meses del mes del efecto al
-- del cobro (nulo = el de su regla). Los productos no son una tabla: salen del cuadro de comisiones,
-- en `lib/consultoria/cuadro.ts`. Sin filas, valen las de serie de `reglas.ts`
create table if not exists public.consultoria_companias (
  consultor_id      uuid not null references public.consultoria_consultores (id) on delete restrict,
  codigo            text not null check (codigo ~ '^[A-Z0-9_]{2,10}$'),  -- como sale en la liquidación
  nombre            text not null check (char_length(btrim(nombre)) between 1 and 40),
  regla             text not null check (regla in ('axa_pias', 'por_pago', 'sin_calendario')),
  calendario        text check (calendario in ('INTESA', 'AVANZA', 'AXA_PIAS')),
  pct_hucha         numeric(5,2) check (pct_hucha between 0 and 100),
  meses_hasta_cobro smallint check (meses_hasta_cobro between 0 and 12),
  primary key (consultor_id, codigo),
  constraint consultoria_companias_calendario_segun_regla
    check ((regla = 'sin_calendario') = (calendario is null))
);

-- ───────────────── Las liquidaciones: las de OVB que han llegado ─────────────────
-- Con su fecha propia (sale entre el 25 y el 29 del mes) y su número. Lo que se va a cobrar no tiene
-- fila: sale de las vistas. Las cifras tampoco se guardan aquí: salen de sus líneas y sus cargos.
-- Va antes que las herramientas porque ellas, los extornos y la cuenta la apuntan
create table if not exists public.consultoria_liquidaciones (
  id               uuid primary key default gen_random_uuid(),
  consultor_id     uuid not null references public.consultoria_consultores (id) on delete restrict,
  mes              date not null check (extract(day from mes) = 1),  -- el mes que liquida
  fecha            date not null,                                     -- la del documento; también el día en que su reserva entra en la hucha
  numero           integer check (numero > 0),                        -- el n.º de OVB; sin unicidad (no se sabe si se reinicia cada año)
  importe_recibido numeric(12,2) check (importe_recibido >= 0),      -- lo que entró en el banco; 0 si no hubo transferencia
  notas            text check (char_length(notas) <= 500),
  creada_en        timestamptz not null default now(),
  unique (consultor_id, mes),
  unique (id, consultor_id)
);

-- ───────────────── Las herramientas: cada firma (o previsión), una línea de la liquidación ─────────────────
-- Guarda lo que se le aplicó (€/unidad y porcentajes del momento) y la base de datos saca los
-- importes. Postgres no deja que una columna generada lea otra generada, así que cada una repite la
-- expresión entera, con round(…, 2) por fila: la mitad se redondea alejándose de cero (4,515 → 4,52)
-- y la aritmética de numeric es exacta. `stored` dicho explícito: en Postgres 18 el valor por
-- defecto es `virtual`.
-- `bruto` y `hucha` son la «Com. Bruta» y la «RC» de la liquidación de OVB, fila a fila como ella.
-- **`irpf` y `neto` por fila son orientativos**: el IRPF de verdad se calcula sobre el total de la
-- liquidación (vista `consultoria_liquidaciones_por_mes`) y puede diferir en un céntimo de la suma
-- fila a fila.
-- Del cuadro de comisiones guarda también el tipo de comisión, la duración y si es un contrato
-- propio, como instantánea: un cuadro nuevo no cambia lo apuntado. `unidades` son las que se cobran
-- en esta línea y `unidades_nivel`, las que cuentan para el ranking y el nivel (nula = las de
-- `unidades`). En la firma de una comisión sobre recibo o sobre saldo, que no se cobra de una vez,
-- `unidades` es 0 y `unidades_nivel` lleva las de producción; cada comisión que llega después es su
-- propia fila, con sus unidades y `unidades_nivel` 0.
-- `aportacion_de` (la 0016 de FSM-Finance): la herramienta de la que es aportación extraordinaria
-- (APEX), nula en las demás. Son dos filas porque su dinero es distinto (la cuota lleva reserva y
-- extorno; la APEX, no), pero donde se cuentan herramientas va con la suya. Va la última, como allí
create table if not exists public.consultoria_herramientas (
  id                   uuid primary key default gen_random_uuid(),
  consultor_id         uuid not null references public.consultoria_consultores (id) on delete restrict,
  cliente_id           uuid not null,
  compania             text not null,                             -- el código de su compañía, sin lista fija
  producto             text not null check (char_length(btrim(producto)) between 1 and 60),  -- texto libre
  pago                 text not null default 'domiciliacion' check (pago in ('domiciliacion', 'transferencia')),
  periodicidad         text not null default 'mensual' check (periodicidad in ('mensual', 'unica')),
  tipo_comision        text not null default 'anticipada'
                       check (tipo_comision in ('anticipada', 'anualizada', 'sobre_recibo', 'unica', 'sobre_saldo')),
  duracion_anios       smallint check (duracion_anios between 1 and 99),  -- para proponer las unidades (PIAS, TOP PLAN)
  propio               boolean not null default false,            -- contrato propio: el consultor es el tomador
  aportacion           numeric(12,2) check (aportacion is null or aportacion > 0),  -- nula solo en lo importado del histórico
  unidades             numeric(10,2) not null check (unidades >= 0),       -- las que se cobran en esta línea; 0 en la firma de una sobre recibo o sobre saldo
  unidades_nivel       numeric(10,2) check (unidades_nivel >= 0),          -- las que cuentan para el nivel; nula = las de `unidades`
  valor_unidad         numeric(6,2) not null check (valor_unidad > 0),
  pct_hucha            numeric(5,2) not null check (pct_hucha between 0 and 100),  -- puede ser 0
  pct_irpf             numeric(5,2) not null check (pct_irpf between 0 and 100),
  fecha_confirmacion   date,                                      -- nulo en lo importado
  mes_produccion       date not null check (extract(day from mes_produccion) = 1),
  fecha_efecto         date not null,
  fecha_cobro          date not null check (extract(day from fecha_cobro + 1) = 1),  -- estimación: último día del mes
  estado               text not null
                       check (estado in ('prevista', 'firmada', 'confirmada', 'incidencia', 'cobrada', 'anulada')),
  fechas_provisionales boolean not null default false,           -- salieron de una regla sin confirmar (por_pago, sin_calendario)
  liquidacion_id       uuid,                                      -- en qué liquidación se cobró
  anulada_el           date,
  bruto                numeric(12,2) generated always as (
                         round(unidades * valor_unidad, 2)
                       ) stored,
  -- La reserva de cancelación de esta línea, no el saldo de la hucha
  hucha                numeric(12,2) generated always as (
                         round(round(unidades * valor_unidad, 2) * pct_hucha / 100, 2)
                       ) stored,
  -- Orientativo: ver arriba
  irpf                 numeric(12,2) generated always as (
                         round((round(unidades * valor_unidad, 2)
                                - round(round(unidades * valor_unidad, 2) * pct_hucha / 100, 2))
                               * pct_irpf / 100, 2)
                       ) stored,
  -- Orientativo: ver arriba
  neto                 numeric(12,2) generated always as (
                         round(unidades * valor_unidad, 2)
                         - round(round(unidades * valor_unidad, 2) * pct_hucha / 100, 2)
                         - round((round(unidades * valor_unidad, 2)
                                  - round(round(unidades * valor_unidad, 2) * pct_hucha / 100, 2))
                                 * pct_irpf / 100, 2)
                       ) stored,
  notas                text check (char_length(notas) <= 500),
  origen               text,                                      -- `nota:<archivo>` u `ovb:<año>-<n.º>:<línea>` si vino de una importación
  creada_en            timestamptz not null default now(),
  aportacion_de        uuid,                                      -- null = no es una aportación extraordinaria de otra
  -- Para la FK de los extornos y la de las APEX
  unique (id, consultor_id),
  constraint consultoria_herramientas_cliente_fk
    foreign key (cliente_id, consultor_id)
    references public.consultoria_clientes (id, consultor_id) on delete restrict,
  constraint consultoria_herramientas_compania_fk
    foreign key (consultor_id, compania)
    references public.consultoria_companias (consultor_id, codigo) on update cascade on delete restrict,
  constraint consultoria_herramientas_liquidacion_fk
    foreign key (liquidacion_id, consultor_id)
    references public.consultoria_liquidaciones (id, consultor_id) on delete restrict,
  -- Compuesta, como las demás: nunca cuelga de una herramienta de otro consultor. `on delete
  -- restrict`: una herramienta con aportaciones no se borra
  constraint consultoria_herramientas_aportacion_fk
    foreign key (aportacion_de, consultor_id)
    references public.consultoria_herramientas (id, consultor_id) on delete restrict,
  constraint consultoria_herramientas_cobro_tras_efecto
    check (fecha_cobro >= fecha_efecto),
  -- Unidades para cobrar o para el nivel: alguna tiene que haber. Con `coalesce` para que una
  -- `unidades_nivel` nula (= las de `unidades`) no deje pasar una fila con 0 de todo
  constraint consultoria_herramientas_con_unidades
    check (unidades > 0 or coalesce(unidades_nivel, 0) > 0),
  -- Cobrada es estar en una liquidación
  constraint consultoria_herramientas_cobrada_con_liquidacion
    check (estado <> 'cobrada' or liquidacion_id is not null),
  -- Una anulada después de cobrarse sigue contando en su liquidación
  constraint consultoria_herramientas_liquidada_cobrada_o_anulada
    check (liquidacion_id is null or estado in ('cobrada', 'anulada')),
  constraint consultoria_herramientas_anulada_con_fecha
    check ((estado = 'anulada') = (anulada_el is not null)),
  -- Solo una aportación única cuelga de otra herramienta, y nunca de sí misma
  constraint consultoria_herramientas_aportacion_unica
    check (aportacion_de is null or (aportacion_de <> id and periodicidad = 'unica'))
);

create index if not exists consultoria_herramientas_cobro_idx
  on public.consultoria_herramientas (consultor_id, fecha_cobro);
create index if not exists consultoria_herramientas_produccion_idx
  on public.consultoria_herramientas (consultor_id, mes_produccion);
create index if not exists consultoria_herramientas_cliente_idx
  on public.consultoria_herramientas (cliente_id);
create index if not exists consultoria_herramientas_liquidacion_idx
  on public.consultoria_herramientas (liquidacion_id) where liquidacion_id is not null;
-- Importar dos veces lo mismo no duplica nada
create unique index if not exists consultoria_herramientas_origen_unico
  on public.consultoria_herramientas (consultor_id, origen) where origen is not null;
-- Para la FK al borrar y para buscar las aportaciones de una herramienta
create index if not exists consultoria_herramientas_aportacion_idx
  on public.consultoria_herramientas (aportacion_de) where aportacion_de is not null;

-- ───────────────── Los extornos ─────────────────
-- Lo que se devuelve cuando un cliente cancela una herramienta ya cobrada dentro del plazo de
-- responsabilidad de su producto. Uno por herramienta. Sale primero de la hucha (`de_hucha`) y lo
-- que no cubre (`resto`) es un cargo en la cuenta de comisiones (vista
-- `consultoria_cuenta_movimientos`). El reparto se guarda, para que deshacer o añadir algo después
-- no lo reescriba. `irpf_hucha` e `irpf_resto` son supuestos editables (0 por defecto)
create table if not exists public.consultoria_extornos (
  id             uuid primary key default gen_random_uuid(),
  consultor_id   uuid not null references public.consultoria_consultores (id) on delete restrict,
  herramienta_id uuid not null unique,
  fecha          date not null,                                   -- día en que OVB lo aplica: la parte de la hucha sale ese día
  importe        numeric(12,2) not null check (importe > 0),
  de_hucha       numeric(12,2) not null default 0,
  resto          numeric(12,2) generated always as (importe - de_hucha) stored,
  resto_cobro    date check (extract(day from resto_cobro + 1) = 1),  -- último día del mes en que se espera aplicar el resto
  liquidacion_id uuid,                                            -- en qué liquidación se aplicó el resto
  irpf_hucha     numeric(12,2) not null default 0 check (irpf_hucha >= 0),
  irpf_resto     numeric(12,2) not null default 0,                -- reduce el cargo
  notas          text check (char_length(notas) <= 500),
  creado_en      timestamptz not null default now(),
  constraint consultoria_extornos_herramienta_fk
    foreign key (herramienta_id, consultor_id)
    references public.consultoria_herramientas (id, consultor_id) on delete restrict,
  constraint consultoria_extornos_liquidacion_fk
    foreign key (liquidacion_id, consultor_id)
    references public.consultoria_liquidaciones (id, consultor_id) on delete restrict,
  constraint consultoria_extornos_de_hucha_hasta_importe
    check (de_hucha >= 0 and de_hucha <= importe),
  -- Si queda resto, tiene su mes; si no, no
  constraint consultoria_extornos_resto_con_mes
    check ((importe > de_hucha) = (resto_cobro is not null)),
  constraint consultoria_extornos_liquidado_con_resto
    check (liquidacion_id is null or importe > de_hucha),
  constraint consultoria_extornos_irpf_resto_hasta_resto
    check (irpf_resto >= 0 and irpf_resto <= importe - de_hucha)
);

create index if not exists consultoria_extornos_fecha_idx
  on public.consultoria_extornos (consultor_id, fecha);
create index if not exists consultoria_extornos_resto_idx
  on public.consultoria_extornos (consultor_id, resto_cobro) where resto_cobro is not null;

-- ───────────────── La hucha: lo que no sale de una liquidación ni de un extorno ─────────────────
-- El saldo de partida (uno), lo que se reclama (en negativo, con el IRPF que se retenga al pagarlo)
-- y algún ajuste. Lo que entra con cada liquidación y lo que sale por cada extorno no se repite
-- aquí: lo junta la vista `consultoria_hucha_movimientos`
create table if not exists public.consultoria_hucha (
  id           uuid primary key default gen_random_uuid(),
  consultor_id uuid not null references public.consultoria_consultores (id) on delete restrict,
  fecha        date not null,
  tipo         text not null check (tipo in ('inicial', 'reclamacion', 'ajuste')),
  importe      numeric(12,2) not null check (importe <> 0),      -- con signo: entra positivo, sale negativo
  irpf         numeric(12,2) not null default 0 check (irpf >= 0),
  notas        text check (char_length(notas) <= 500),
  creado_en    timestamptz not null default now(),
  constraint consultoria_hucha_inicial_positivo
    check (tipo <> 'inicial' or importe > 0),
  constraint consultoria_hucha_reclamacion_negativa
    check (tipo <> 'reclamacion' or importe < 0),
  constraint consultoria_hucha_irpf_solo_en_reclamacion
    check (tipo = 'reclamacion' or irpf = 0)
);

-- Un solo saldo de partida por consultor
create unique index if not exists consultoria_hucha_un_inicial
  on public.consultoria_hucha (consultor_id) where tipo = 'inicial';
create index if not exists consultoria_hucha_fecha_idx
  on public.consultoria_hucha (consultor_id, fecha);

-- ───────────────── La cuenta de comisiones: cargos y abonos que no son comisión ─────────────────
-- Un curso (−30 €), una participación en gastos de formación (+15 €), un saldo anterior al que se
-- empieza a apuntar. Se suman después del IRPF y no lo pagan. Los restos de los extornos no van
-- aquí: salen de `consultoria_extornos` y se juntan en la vista `consultoria_cuenta_movimientos`.
-- Un cargo no tiene mes: se aplica en la liquidación en que se marque (nula = aún sin aplicar)
create table if not exists public.consultoria_cuenta (
  id             uuid primary key default gen_random_uuid(),
  consultor_id   uuid not null references public.consultoria_consultores (id) on delete restrict,
  fecha          date not null,                                   -- la del apunte en OVB
  concepto       text not null check (char_length(btrim(concepto)) between 1 and 120),
  importe        numeric(12,2) not null check (importe <> 0),    -- con signo: cargo negativo, abono positivo
  liquidacion_id uuid,
  creado_en      timestamptz not null default now(),
  constraint consultoria_cuenta_liquidacion_fk
    foreign key (liquidacion_id, consultor_id)
    references public.consultoria_liquidaciones (id, consultor_id) on delete restrict
);

create index if not exists consultoria_cuenta_fecha_idx
  on public.consultoria_cuenta (consultor_id, fecha);
create index if not exists consultoria_cuenta_liquidacion_idx
  on public.consultoria_cuenta (liquidacion_id) where liquidacion_id is not null;

-- ───────────────── Los cierres de OVB ─────────────────
-- Hasta cuándo se confirma y hasta cuándo se resuelve una incidencia, por mes y calendario. Se
-- cargan cada año con `scripts/consultoria-cierres.mjs`
create table if not exists public.consultoria_cierres (
  consultor_id      uuid not null references public.consultoria_consultores (id) on delete restrict,
  mes               date not null check (extract(day from mes) = 1),
  calendario        text not null check (calendario in ('INTESA', 'AVANZA', 'AXA_PIAS', 'RANKING')),
  confirmar_hasta   date not null,                                -- hasta las 23:59 de ese día
  incidencias_hasta date,                                         -- puede caer en el mes siguiente; nulo si no se sabe
  primary key (consultor_id, mes, calendario),
  constraint consultoria_cierres_confirmar_en_su_mes
    check (confirmar_hasta >= mes and confirmar_hasta < (mes + interval '1 month')::date),
  constraint consultoria_cierres_incidencias_tras_confirmar
    check (incidencias_hasta is null or incidencias_hasta >= confirmar_hasta)
);

-- ───────────────── Los niveles del plan de carrera ─────────────────
-- El €/unidad de cada nivel. Se alcanza por unidades (`desde_unidades`) o a mano desde un mes
-- (`desde_mes`). Sin filas, valen los de serie de `reglas.ts`
create table if not exists public.consultoria_niveles (
  id             uuid primary key default gen_random_uuid(),
  consultor_id   uuid not null references public.consultoria_consultores (id) on delete restrict,
  nombre         text not null check (char_length(btrim(nombre)) between 1 and 40),
  valor_unidad   numeric(6,2) not null check (valor_unidad > 0),
  desde_unidades numeric(10,2) check (desde_unidades >= 0),
  desde_mes      date check (extract(day from desde_mes) = 1),
  unique (consultor_id, nombre)
);

-- ───────────────── Los ajustes: una fila por consultor ─────────────────
-- Sin fila, valen los de serie de `reglas.ts`. `pct_hucha` es la reserva cuando ni el producto ni la
-- compañía tienen la suya; `pct_irpf`, el de las herramientas nuevas y el que se propone para una
-- reclamación. Cambiarlos no toca lo guardado. El saldo de partida de la hucha no va aquí: es el
-- movimiento `inicial` de `consultoria_hucha`
create table if not exists public.consultoria_ajustes (
  consultor_id     uuid primary key references public.consultoria_consultores (id) on delete restrict,
  unidades_previas numeric(10,2) not null default 0 check (unidades_previas >= 0),  -- el punto de partida
  pct_hucha        numeric(5,2) not null check (pct_hucha between 0 and 100),
  pct_irpf         numeric(5,2) not null check (pct_irpf between 0 and 100),
  actualizado_en   timestamptz not null default now()
);

-- ───────────────── RLS y permisos: cerrado a todo salvo `service_role` ─────────────────
-- RLS activo y **ninguna política**: `service_role` se salta el RLS, y cualquier otro rol que
-- llegara a tener permiso no vería ni una fila. Los permisos se quitan todos y se da solo lo que
-- toca: leer y escribir a `service_role`, sin `truncate` (que no pasa por el RLS ni por los
-- disparadores de fila: vaciar lo hace Facundo como `postgres`, sección 6.3)
alter table public.consultoria_consultores   enable row level security;
alter table public.consultoria_clientes      enable row level security;
alter table public.consultoria_companias     enable row level security;
alter table public.consultoria_liquidaciones enable row level security;
alter table public.consultoria_herramientas  enable row level security;
alter table public.consultoria_extornos      enable row level security;
alter table public.consultoria_hucha         enable row level security;
alter table public.consultoria_cuenta        enable row level security;
alter table public.consultoria_cierres       enable row level security;
alter table public.consultoria_niveles       enable row level security;
alter table public.consultoria_ajustes       enable row level security;

revoke all on table
  public.consultoria_consultores, public.consultoria_clientes, public.consultoria_companias,
  public.consultoria_liquidaciones, public.consultoria_herramientas, public.consultoria_extornos,
  public.consultoria_hucha, public.consultoria_cuenta, public.consultoria_cierres,
  public.consultoria_niveles, public.consultoria_ajustes
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table
  public.consultoria_clientes, public.consultoria_companias,
  public.consultoria_liquidaciones, public.consultoria_herramientas, public.consultoria_extornos,
  public.consultoria_hucha, public.consultoria_cuenta, public.consultoria_cierres,
  public.consultoria_niveles, public.consultoria_ajustes
  to service_role;
-- El consultor: el panel y los scripts solo lo leen, y la copia lo crea (con `id`, `nombre` y
-- `creado_en`). `fuente_desde` (el cambio, sección 6.4) solo lo cambia Facundo como `postgres`
grant select, insert, delete on table public.consultoria_consultores to service_role;
grant update (nombre) on table public.consultoria_consultores to service_role;

-- ───────────────── Lo cobrado no cambia por debajo ─────────────────
-- Errores P0001 con un mensaje en español que dice cuál, y que el panel enseña tal cual. Valen
-- también para la clave secreta y los scripts: `service_role` se salta el RLS, no los disparadores.
--
-- Herramientas:
-- - No se borra una que ya se cobró. Una prevista que se cae, sí
-- - De una cobrada no se cambian unidades, €/unidad, porcentajes ni mes de cobro. Sí su estado (a
--   anulada), la fecha de anulación, las notas y lo que hacen las funciones de las liquidaciones
-- - Una con extorno no sale de anulada, ni pierde la liquidación en que se cobró: el extorno solo
--   existe porque se cobró. Si dejara de estar cobrada, su comisión dejaría de contar y su extorno
--   no. Hay que quitar antes el extorno
-- - Su liquidación es la de su mes (al crear o cambiar, también al importar): si tiene
--   `liquidacion_id`, el mes de esa liquidación tiene que ser el de `fecha_cobro`
create or replace function public.consultoria_proteger_herramienta()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_mes date;
begin
  if tg_op = 'DELETE' then
    if old.liquidacion_id is not null then
      raise exception 'La herramienta «%» ya se cobró: deshaz antes la liquidación', old.producto
        using errcode = 'P0001';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.liquidacion_id is not null and (
         new.unidades     is distinct from old.unidades
      or new.valor_unidad is distinct from old.valor_unidad
      or new.pct_hucha    is distinct from old.pct_hucha
      or new.pct_irpf     is distinct from old.pct_irpf
      or new.fecha_cobro  is distinct from old.fecha_cobro
    ) then
      raise exception 'La herramienta «%» ya se cobró: sus unidades, su €/unidad, sus porcentajes y su mes de cobro no se cambian. Deshaz antes la liquidación', old.producto
        using errcode = 'P0001';
    end if;

    if (old.estado = 'anulada' and new.estado <> 'anulada')
       or (old.liquidacion_id is not null and new.liquidacion_id is null) then
      if exists (select 1 from public.consultoria_extornos e where e.herramienta_id = old.id) then
        if old.estado = 'anulada' and new.estado <> 'anulada' then
          raise exception 'La herramienta «%» tiene un extorno: quítalo antes de sacarla de anulada', old.producto
            using errcode = 'P0001';
        end if;
        raise exception 'La herramienta «%» tiene un extorno: quítalo antes de deshacer la liquidación en que se cobró', old.producto
          using errcode = 'P0001';
      end if;
    end if;
  end if;

  -- Al crear o cambiar: su liquidación, la de su mes
  if new.liquidacion_id is not null then
    select q.mes into v_mes from public.consultoria_liquidaciones q where q.id = new.liquidacion_id;
    if v_mes is not null
       and v_mes <> make_date(extract(year from new.fecha_cobro)::int, extract(month from new.fecha_cobro)::int, 1) then
      raise exception 'La herramienta «%» se cobra en %, y esa liquidación es de %: no puede ir en ella', new.producto,
        to_char(new.fecha_cobro, 'YYYY-MM'), to_char(v_mes, 'YYYY-MM')
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists consultoria_herramienta_protegida on public.consultoria_herramientas;
create trigger consultoria_herramienta_protegida
  before insert or update or delete on public.consultoria_herramientas
  for each row execute function public.consultoria_proteger_herramienta();

-- Extornos:
-- - Solo de una herramienta anulada que se cobró
-- - Si su resto ya se aplicó en una liquidación, no se borra ni se cambian su herramienta, su
--   importe, su reparto, el IRPF del resto ni su mes. Sí su fecha, el IRPF de la parte de la hucha y
--   las notas, y lo que hacen las funciones de las liquidaciones (enlazarlo o desenlazarlo)
-- - Su liquidación es la de su mes: si tiene `liquidacion_id`, el mes de esa liquidación tiene que
--   ser el de `resto_cobro`
create or replace function public.consultoria_proteger_extorno()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_producto    text;
  v_estado      text;
  v_liquidacion uuid;
  v_mes         date;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    if old.liquidacion_id is not null then
      select h.producto into v_producto from public.consultoria_herramientas h where h.id = old.herramienta_id;
      if tg_op = 'DELETE' then
        raise exception 'El resto del extorno de «%» ya se aplicó en una liquidación: deshaz antes esa liquidación', v_producto
          using errcode = 'P0001';
      end if;
      if new.herramienta_id is distinct from old.herramienta_id
         or new.importe     is distinct from old.importe
         or new.de_hucha    is distinct from old.de_hucha
         or new.irpf_resto  is distinct from old.irpf_resto
         or new.resto_cobro is distinct from old.resto_cobro then
        raise exception 'El resto del extorno de «%» ya se aplicó en una liquidación: su importe, su reparto y su mes no se cambian. Deshaz antes esa liquidación', v_producto
          using errcode = 'P0001';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  select h.producto, h.estado, h.liquidacion_id into v_producto, v_estado, v_liquidacion
    from public.consultoria_herramientas h
   where h.id = new.herramienta_id;
  if v_estado is distinct from 'anulada' then
    raise exception 'La herramienta «%» no está anulada: no hay extorno', v_producto using errcode = 'P0001';
  end if;
  if v_liquidacion is null then
    raise exception 'La herramienta «%» no se llegó a cobrar: no hay extorno', v_producto using errcode = 'P0001';
  end if;

  if new.liquidacion_id is not null then
    select q.mes into v_mes from public.consultoria_liquidaciones q where q.id = new.liquidacion_id;
    if v_mes is not null
       and v_mes <> make_date(extract(year from new.resto_cobro)::int, extract(month from new.resto_cobro)::int, 1) then
      raise exception 'El resto del extorno de «%» se espera en %, y esa liquidación es de %: no puede ir en ella', v_producto,
        to_char(new.resto_cobro, 'YYYY-MM'), to_char(v_mes, 'YYYY-MM')
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists consultoria_extorno_protegido on public.consultoria_extornos;
create trigger consultoria_extorno_protegido
  before insert or update or delete on public.consultoria_extornos
  for each row execute function public.consultoria_proteger_extorno();

-- Cargos de la cuenta: uno ya aplicado en una liquidación no se borra ni se le cambian el importe ni
-- la fecha. Sí el concepto, y que las funciones de las liquidaciones pongan o quiten su liquidación
create or replace function public.consultoria_proteger_cargo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.liquidacion_id is not null then
    if tg_op = 'DELETE' then
      raise exception 'El cargo «%» ya se aplicó en una liquidación: deshaz antes esa liquidación', old.concepto
        using errcode = 'P0001';
    end if;
    if new.importe is distinct from old.importe or new.fecha is distinct from old.fecha then
      raise exception 'El cargo «%» ya se aplicó en una liquidación: su importe y su fecha no se cambian. Deshaz antes esa liquidación', old.concepto
        using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists consultoria_cargo_protegido on public.consultoria_cuenta;
create trigger consultoria_cargo_protegido
  before update or delete on public.consultoria_cuenta
  for each row execute function public.consultoria_proteger_cargo();

-- Liquidaciones (la 0015 de FSM-Finance): el mes de una liquidación con líneas no se cambia, porque
-- sus líneas quedarían colgadas de un mes que no es el suyo. Para moverla: deshacerla, cambiar el
-- mes de cobro de sus líneas y volver a marcarla. Los cargos de la cuenta no cuentan: no tienen mes
create or replace function public.consultoria_proteger_liquidacion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.mes is distinct from old.mes and (
       exists (select 1 from public.consultoria_herramientas h where h.liquidacion_id = old.id)
    or exists (select 1 from public.consultoria_extornos e where e.liquidacion_id = old.id)) then
    raise exception 'La liquidación de % ya tiene líneas: su mes no se cambia. Deshazla, cambia el mes de cobro de sus líneas y vuelve a marcarla', to_char(old.mes, 'YYYY-MM')
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists consultoria_liquidacion_protegida on public.consultoria_liquidaciones;
create trigger consultoria_liquidacion_protegida
  before update of mes on public.consultoria_liquidaciones
  for each row execute function public.consultoria_proteger_liquidacion();

-- Aportaciones extraordinarias (la 0016 de FSM-Finance). Salta al crear una herramienta y al cambiar
-- su enlace o su cliente, que son lo único que puede romper estas reglas:
-- - la madre existe, es del mismo consultor (también lo exige la FK) y del mismo cliente
-- - la madre no es a su vez una aportación: un solo nivel
-- - una herramienta con aportaciones no pasa a ser aportación de otra, ni cambia de cliente (sus
--   aportaciones se quedarían en otro cliente)
-- Cambiar el enlace no toca dinero: se permite también en una cobrada (el disparador de las
-- herramientas no mira `aportacion_de`). Con los permisos de quien llama, que aquí es siempre
-- `service_role` y lo ve todo
create or replace function public.consultoria_proteger_aportacion()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_cliente  uuid;
  v_abuela   uuid;
  v_producto text;
begin
  if new.aportacion_de is not null then
    select h.cliente_id, h.aportacion_de, h.producto
      into v_cliente, v_abuela, v_producto
      from public.consultoria_herramientas h
     where h.id = new.aportacion_de
       and h.consultor_id = new.consultor_id;
    if not found then
      raise exception 'No encuentro la herramienta de la que «%» es aportación extraordinaria', new.producto
        using errcode = 'P0001';
    end if;
    if v_cliente is distinct from new.cliente_id then
      raise exception 'La aportación extraordinaria «%» tiene que ser del mismo cliente que la herramienta de la que cuelga («%»)', new.producto, v_producto
        using errcode = 'P0001';
    end if;
    if v_abuela is not null then
      raise exception 'La herramienta «%» ya es una aportación extraordinaria: «%» tiene que colgar de la herramienta, no de otra aportación (un solo nivel)', v_producto, new.producto
        using errcode = 'P0001';
    end if;
    if tg_op = 'UPDATE' and exists (
         select 1 from public.consultoria_herramientas a where a.aportacion_de = new.id) then
      raise exception 'La herramienta «%» tiene aportaciones extraordinarias: no puede ser a su vez aportación de otra. Desengancha antes las suyas', new.producto
        using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.cliente_id is distinct from old.cliente_id and exists (
       select 1 from public.consultoria_herramientas a where a.aportacion_de = old.id) then
    raise exception 'La herramienta «%» tiene aportaciones extraordinarias: no cambia de cliente mientras las tenga. Desengánchalas antes', old.producto
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- `update of`: solo cuando la petición toca el enlace o el cliente («Ha llegado» y deshacerlo no
-- los tocan, así que no lo hacen saltar)
drop trigger if exists consultoria_herramienta_aportacion on public.consultoria_herramientas;
create trigger consultoria_herramienta_aportacion
  before insert or update of aportacion_de, cliente_id on public.consultoria_herramientas
  for each row execute function public.consultoria_proteger_aportacion();

-- Nadie las llama desde fuera: solo los disparadores, que no necesitan el permiso
revoke execute on function public.consultoria_proteger_herramienta() from public, anon, authenticated, service_role;
revoke execute on function public.consultoria_proteger_extorno() from public, anon, authenticated, service_role;
revoke execute on function public.consultoria_proteger_cargo() from public, anon, authenticated, service_role;
revoke execute on function public.consultoria_proteger_liquidacion() from public, anon, authenticated, service_role;
revoke execute on function public.consultoria_proteger_aportacion() from public, anon, authenticated, service_role;

-- ───────────────── Vistas ─────────────────
-- Todas con security_invoker: heredan los permisos y el RLS de quien pregunta (hoy, solo
-- `service_role`). A la liquidación la apuntan tres tablas (herramientas, extornos y cuenta): al
-- incrustar con PostgREST entre ellas hay que nombrar la relación (PGRST201). Mejor leer por aquí

-- Cada comisión que entra en una liquidación: las herramientas con unidades que cobrar (la firma de
-- una sobre recibo o sobre saldo no es una línea: no se cobra de una vez) y que cuentan (una anulada
-- que ya se cobró sigue en la suya). Solo comisiones: los restos de los extornos son cargos de la
-- cuenta. `irpf` y `neto` por fila son orientativos; `pct_irpf` es para el IRPF sobre el total.
-- `aportacion_de`, la última (como la dejó la 0016): la línea de una APEX se rotula «TopPlan · APEX»
-- en «Ha llegado» y en el detalle del mes
create or replace view public.consultoria_lineas
with (security_invoker = on) as
  select h.consultor_id,
         h.id                          as herramienta_id,
         h.cliente_id,
         c.nombre                      as cliente,
         h.compania,
         h.producto,
         make_date(extract(year from h.fecha_cobro)::int, extract(month from h.fecha_cobro)::int, 1) as mes,
         h.fecha_cobro,
         h.estado,
         h.liquidacion_id,
         h.liquidacion_id is not null  as cobrada,
         h.estado = 'prevista'         as prevista,
         h.unidades,
         h.bruto,
         h.hucha,
         h.pct_irpf,
         h.irpf,
         h.neto,
         h.aportacion_de
    from public.consultoria_herramientas h
    join public.consultoria_clientes c on c.id = h.cliente_id
   where h.unidades > 0
     and (h.estado <> 'anulada' or h.liquidacion_id is not null);

-- La cuenta de comisiones: cada cargo o abono de `consultoria_cuenta` (sin mes: entra en la
-- liquidación en que se marque) y el resto de cada extorno que la hucha no cubre, como cargo
-- (`−resto + irpf_resto`) previsto para el mes de `resto_cobro`
create or replace view public.consultoria_cuenta_movimientos
with (security_invoker = on) as
  select k.consultor_id,
         k.fecha,
         k.concepto,
         k.importe,
         k.liquidacion_id,
         k.liquidacion_id is not null  as aplicado,
         null::date                    as mes_previsto,
         k.id                          as cargo_id,
         null::uuid                    as extorno_id,
         null::text                    as cliente
    from public.consultoria_cuenta k
  union all
  select e.consultor_id,
         e.fecha,
         'Extorno: ' || h.producto,
         -e.resto + e.irpf_resto,
         e.liquidacion_id,
         e.liquidacion_id is not null,
         make_date(extract(year from e.resto_cobro)::int, extract(month from e.resto_cobro)::int, 1),
         null::uuid,
         e.id,
         c.nombre
    from public.consultoria_extornos e
    join public.consultoria_herramientas h on h.id = e.herramienta_id
    join public.consultoria_clientes c on c.id = h.cliente_id
   where e.importe > e.de_hucha;

-- Un mes por fila, como la liquidación de OVB: comisión, RC (la hucha), comisión neta e IRPF, de lo
-- cobrado y de lo pendiente, y los cargos. El IRPF va **sobre el total**: primero se agrupa por
-- (mes, cobrada, % de IRPF) y se redondea el IRPF de cada grupo (normalmente uno: el 15 %); después,
-- por mes. `full join` con las liquidaciones y con los cargos previstos, para que salga también un
-- mes que llegó sin ninguna comisión (solo con cargos, o con todo pasado al siguiente) o que solo
-- tiene un resto de extorno previsto: si no, no se vería ni se podría deshacer.
-- Saldo anterior e importe a pagar no están aquí: dependen de todas las liquidaciones anteriores
-- (si sale negativo, no hay transferencia y pasa a la siguiente), y los calcula
-- `cuentaDeComisiones()` de `reglas.ts` sobre estas filas en orden. Sigue contando líneas: el
-- recuento «4 herramientas y 1 APEX» lo hace `recuentoDelMes()` de `reglas.ts`
create or replace view public.consultoria_liquidaciones_por_mes
with (security_invoker = on) as
  select consultor_id,
         mes,
         coalesce(l.herramientas, 0)        as herramientas,
         coalesce(l.previstas, 0)           as previstas,
         coalesce(l.unidades, 0)            as unidades,
         coalesce(l.comision_cobrada, 0)    as comision_cobrada,
         coalesce(l.rc_cobrada, 0)          as rc_cobrada,
         coalesce(l.neta_cobrada, 0)        as neta_cobrada,
         coalesce(l.irpf_cobrado, 0)        as irpf_cobrado,
         coalesce(l.comision_pendiente, 0)  as comision_pendiente,
         coalesce(l.rc_pendiente, 0)        as rc_pendiente,
         coalesce(l.neta_pendiente, 0)      as neta_pendiente,
         coalesce(l.irpf_pendiente, 0)      as irpf_pendiente,
         coalesce(l.neto_previsto, 0)       as neto_previsto,
         coalesce(a.cargos, 0)              as cargos_aplicados,
         coalesce(p.cargos, 0)              as cargos_previstos,
         q.id                               as liquidacion_id,
         q.numero,
         q.fecha,
         q.importe_recibido
    from (
      select consultor_id,
             mes,
             sum(herramientas)::bigint                          as herramientas,
             sum(previstas)::bigint                             as previstas,
             sum(unidades)                                      as unidades,
             sum(comision) filter (where cobrada)               as comision_cobrada,
             sum(rc)       filter (where cobrada)               as rc_cobrada,
             sum(neta)     filter (where cobrada)               as neta_cobrada,
             sum(irpf)     filter (where cobrada)               as irpf_cobrado,
             sum(comision) filter (where not cobrada)           as comision_pendiente,
             sum(rc)       filter (where not cobrada)           as rc_pendiente,
             sum(neta)     filter (where not cobrada)           as neta_pendiente,
             sum(irpf)     filter (where not cobrada)           as irpf_pendiente,
             sum(neto_previsto) filter (where not cobrada)      as neto_previsto
        from (
          select consultor_id,
                 mes,
                 cobrada,
                 pct_irpf,
                 count(*)                                       as herramientas,
                 count(*) filter (where prevista)               as previstas,
                 sum(unidades)                                  as unidades,
                 sum(bruto)                                     as comision,
                 sum(hucha)                                     as rc,
                 sum(bruto - hucha)                             as neta,
                 round(sum(bruto - hucha) * pct_irpf / 100, 2)  as irpf,
                 sum(neto) filter (where prevista)              as neto_previsto
            from public.consultoria_lineas
           group by consultor_id, mes, cobrada, pct_irpf
        ) g
       group by consultor_id, mes
    ) l
    full join public.consultoria_liquidaciones q using (consultor_id, mes)
    full join (
      select consultor_id, mes_previsto as mes, sum(importe) as cargos
        from public.consultoria_cuenta_movimientos
       where mes_previsto is not null and not aplicado
       group by consultor_id, mes_previsto
    ) p using (consultor_id, mes)
    left join (
      select liquidacion_id, sum(importe) as cargos
        from public.consultoria_cuenta_movimientos
       where liquidacion_id is not null
       group by liquidacion_id
    ) a on a.liquidacion_id = q.id;

-- El libro de la hucha, con signo: la reserva de cada liquidación (el día de la liquidación), lo que
-- sale por la parte que cubre cada extorno (el día del extorno) y lo apuntado a mano. El saldo es la
-- suma de `importe` (hasta un día, si se pide): lo hace `saldoDeHucha()` de `reglas.ts`. Puede
-- quedar negativo; no se impide, se avisa
create or replace view public.consultoria_hucha_movimientos
with (security_invoker = on) as
  select q.consultor_id,
         q.fecha,
         'liquidacion'::text           as tipo,
         coalesce(sum(h.hucha), 0)     as importe,
         0::numeric(12,2)              as irpf,
         q.id                          as liquidacion_id,
         null::uuid                    as extorno_id,
         null::uuid                    as movimiento_id,
         null::text                    as cliente,
         q.notas
    from public.consultoria_liquidaciones q
    left join public.consultoria_herramientas h on h.liquidacion_id = q.id
   group by q.id
  union all
  select e.consultor_id,
         e.fecha,
         'extorno'::text,
         -e.de_hucha,
         e.irpf_hucha,
         null::uuid,
         e.id,
         null::uuid,
         c.nombre,
         e.notas
    from public.consultoria_extornos e
    join public.consultoria_herramientas h on h.id = e.herramienta_id
    join public.consultoria_clientes c on c.id = h.cliente_id
   where e.de_hucha > 0
  union all
  select m.consultor_id,
         m.fecha,
         m.tipo,
         m.importe,
         m.irpf,
         null::uuid,
         null::uuid,
         m.id,
         null::text,
         m.notas
    from public.consultoria_hucha m;

-- Cada cliente con lo suyo (como la dejó la 0016): herramientas no anuladas, previstas, aportación
-- mensual y única (de las no anuladas que la tienen: en lo importado del histórico puede faltar) y lo
-- generado: la comisión bruta de sus herramientas que cuentan (como en `consultoria_lineas`) menos el
-- importe de sus extornos, salga de la hucha o de la cuenta. Lo generado es el bruto: la hucha es
-- suya y el IRPF, una retención. Una línea con 0 unidades para el nivel (un recibo más de una
-- comisión sobre recibo o sobre saldo) suma en lo generado, pero no es una herramienta más; y una
-- APEX enlazada tampoco (es parte de su herramienta), aunque suma en la aportación única y en lo
-- generado
create or replace view public.consultoria_clientes_resumen
with (security_invoker = on) as
  select c.id,
         c.consultor_id,
         c.nombre,
         c.referencia,
         c.proxima_revision,
         c.notas,
         c.creado_en,
         coalesce(h.herramientas, 0)                              as herramientas,
         coalesce(h.previstas, 0)                                 as previstas,
         coalesce(h.aportacion_mensual, 0)                        as aportacion_mensual,
         coalesce(h.aportacion_unica, 0)                          as aportacion_unica,
         coalesce(h.bruto, 0) - coalesce(e.extornado, 0)          as generado_bruto
    from public.consultoria_clientes c
    left join (
      select cliente_id,
             count(*) filter (where estado <> 'anulada' and coalesce(unidades_nivel, unidades) > 0 and aportacion_de is null) as herramientas,
             count(*) filter (where estado = 'prevista' and coalesce(unidades_nivel, unidades) > 0 and aportacion_de is null) as previstas,
             sum(aportacion) filter (where periodicidad = 'mensual' and estado <> 'anulada' and coalesce(unidades_nivel, unidades) > 0) as aportacion_mensual,
             sum(aportacion) filter (where periodicidad = 'unica' and estado <> 'anulada' and coalesce(unidades_nivel, unidades) > 0)   as aportacion_unica,
             sum(bruto) filter (where estado <> 'anulada' or liquidacion_id is not null)     as bruto
        from public.consultoria_herramientas
       group by cliente_id
    ) h on h.cliente_id = c.id
    left join (
      select hx.cliente_id, sum(ex.importe) as extornado
        from public.consultoria_extornos ex
        join public.consultoria_herramientas hx on hx.id = ex.herramienta_id
       group by hx.cliente_id
    ) e on e.cliente_id = c.id;

revoke all on table
  public.consultoria_lineas, public.consultoria_cuenta_movimientos, public.consultoria_liquidaciones_por_mes,
  public.consultoria_hucha_movimientos, public.consultoria_clientes_resumen
  from public, anon, authenticated, service_role;
grant select on table
  public.consultoria_lineas, public.consultoria_cuenta_movimientos, public.consultoria_liquidaciones_por_mes,
  public.consultoria_hucha_movimientos, public.consultoria_clientes_resumen
  to service_role;

-- ───────────────── «Ha llegado» ─────────────────
-- Marca un mes como cobrado, todo en una transacción y con los permisos de quien llama
-- (`service_role`, que se salta el RLS: por eso cada sentencia filtra por `consultor_id`):
-- 1. Si `p_consultor` es nulo o no está en `consultoria_consultores`, 42501 («No hay consultor»).
--    Con la clave secreta `auth.uid()` es nulo: el panel manda el consultor que ha leído de la base.
--    Si el motivo pasa de 200 caracteres, error
-- 2. Crea la liquidación del mes con su fecha, número e importe recibido (23505 si ya estaba)
-- 3. Las herramientas de `p_entraron` (suyas, con cobro estimado en ese mes, sin liquidar, no
--    anuladas y con unidades que cobrar) pasan a cobrada. Si alguna no lo es, error y no se hace nada
-- 4. Las demás líneas de ese mes sin liquidar y no anuladas pasan al mes siguiente, con la línea
--    «AAAA-MM-DD — No entró en la liquidación de <mes>: <motivo>» al final de sus notas (el día es
--    el de la liquidación). Si no caben, se queda la línea nueva y se recorta lo viejo
-- 5. Los extornos de `p_extornos` (con resto previsto en ese mes y sin aplicar) se enlazan; los demás
--    de ese mes pasan al siguiente, con la misma línea y el mismo recorte
-- 6. Los cargos de `p_cargos` (de `consultoria_cuenta`, suyos y sin aplicar; si no, error) se
--    enlazan; los que no se marquen siguen sin aplicar
-- La reserva del mes entra sola en la hucha: sale de la liquidación. Devuelve su id
create or replace function public.consultoria_liquidar_mes(
  p_consultor        uuid,
  p_mes              date,
  p_fecha            date,
  p_entraron         uuid[],
  p_extornos         uuid[],
  p_cargos           uuid[]  default '{}',
  p_numero           integer default null,
  p_importe_recibido numeric default null,
  p_motivo           text    default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_yo        uuid := p_consultor;
  v_mes       date;
  v_siguiente date;   -- día 1 del mes siguiente
  v_cobro_sig date;   -- último día del mes siguiente
  v_entraron  uuid[];
  v_extornos  uuid[];
  v_cargos    uuid[];
  v_motivo    text := nullif(btrim(p_motivo), '');
  v_linea     text;
  v_id        uuid;
  v_n         integer;
begin
  if v_yo is null or not exists (select 1 from public.consultoria_consultores k where k.id = v_yo) then
    raise exception 'No hay consultor' using errcode = '42501';
  end if;
  if p_mes is null or p_fecha is null then
    raise exception 'Faltan el mes o la fecha de la liquidación' using errcode = 'P0001';
  end if;
  if char_length(v_motivo) > 200 then
    raise exception 'El motivo es demasiado largo: 200 caracteres como mucho' using errcode = 'P0001';
  end if;

  v_mes       := make_date(extract(year from p_mes)::int, extract(month from p_mes)::int, 1);
  v_siguiente := (v_mes + interval '1 month')::date;
  v_cobro_sig := (v_mes + interval '2 months')::date - 1;
  v_entraron  := array(select distinct x from unnest(coalesce(p_entraron, '{}'::uuid[])) as x where x is not null);
  v_extornos  := array(select distinct x from unnest(coalesce(p_extornos, '{}'::uuid[])) as x where x is not null);
  v_cargos    := array(select distinct x from unnest(coalesce(p_cargos, '{}'::uuid[])) as x where x is not null);
  v_linea     := to_char(p_fecha, 'YYYY-MM-DD') || ' — No entró en la liquidación de '
                 || (array['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
                           'septiembre', 'octubre', 'noviembre', 'diciembre'])[extract(month from v_mes)::int]
                 || ' de ' || extract(year from v_mes)::int::text
                 || coalesce(': ' || v_motivo, '');

  -- 2. La liquidación: una por mes
  if exists (select 1 from public.consultoria_liquidaciones q where q.consultor_id = v_yo and q.mes = v_mes) then
    raise exception 'Ese mes ya está marcado como cobrado' using errcode = '23505';
  end if;
  insert into public.consultoria_liquidaciones (consultor_id, mes, fecha, numero, importe_recibido)
  values (v_yo, v_mes, p_fecha, p_numero, p_importe_recibido)
  returning id into v_id;

  -- 3. Las que han entrado. Solo líneas, como en `consultoria_lineas`: la firma de una sobre recibo
  -- o sobre saldo (`unidades` 0) no se cobra de una vez
  update public.consultoria_herramientas
     set estado = 'cobrada', liquidacion_id = v_id
   where id = any (v_entraron)
     and consultor_id = v_yo
     and fecha_cobro >= v_mes and fecha_cobro < v_siguiente
     and liquidacion_id is null
     and estado <> 'anulada'
     and unidades > 0;
  get diagnostics v_n = row_count;
  if v_n <> cardinality(v_entraron) then
    raise exception 'Alguna de las herramientas marcadas no se cobra ese mes, no tiene nada que cobrar, está anulada o ya se cobró. No se ha guardado nada'
      using errcode = 'P0001';
  end if;

  -- 4. Las demás líneas del mes, al siguiente. Las firmas sin unidades que cobrar se quedan donde
  -- están: no salen en «Ha llegado», y si no, pasarían de mes en mes con una línea más en sus notas
  update public.consultoria_herramientas
     set fecha_cobro = v_cobro_sig,
         notas = left(coalesce(notas || E'\n', ''), 500 - char_length(v_linea)) || v_linea
   where consultor_id = v_yo
     and fecha_cobro >= v_mes and fecha_cobro < v_siguiente
     and liquidacion_id is null
     and estado <> 'anulada'
     and unidades > 0;

  -- 5. Los restos de extornos: los marcados se enlazan, los demás pasan al mes siguiente
  update public.consultoria_extornos
     set liquidacion_id = v_id
   where id = any (v_extornos)
     and consultor_id = v_yo
     and resto_cobro >= v_mes and resto_cobro < v_siguiente
     and liquidacion_id is null;
  get diagnostics v_n = row_count;
  if v_n <> cardinality(v_extornos) then
    raise exception 'Alguno de los extornos marcados no se espera ese mes o ya se aplicó. No se ha guardado nada'
      using errcode = 'P0001';
  end if;

  update public.consultoria_extornos
     set resto_cobro = v_cobro_sig,
         notas = left(coalesce(notas || E'\n', ''), 500 - char_length(v_linea)) || v_linea
   where consultor_id = v_yo
     and resto_cobro >= v_mes and resto_cobro < v_siguiente
     and liquidacion_id is null;

  -- 6. Los cargos y abonos marcados se aplican; los demás siguen sin aplicar
  update public.consultoria_cuenta
     set liquidacion_id = v_id
   where id = any (v_cargos)
     and consultor_id = v_yo
     and liquidacion_id is null;
  get diagnostics v_n = row_count;
  if v_n <> cardinality(v_cargos) then
    raise exception 'Alguno de los cargos marcados ya se aplicó en otra liquidación. No se ha guardado nada'
      using errcode = 'P0001';
  end if;

  return v_id;
end;
$$;

revoke execute on function public.consultoria_liquidar_mes(uuid, date, date, uuid[], uuid[], uuid[], integer, numeric, text)
  from public, anon, authenticated;
grant execute on function public.consultoria_liquidar_mes(uuid, date, date, uuid[], uuid[], uuid[], integer, numeric, text)
  to service_role;

-- ───────────────── Deshacer «Ha llegado» ─────────────────
-- Por si se marcó por error. Primero desenlaza sus extornos y sus cargos (mientras sus herramientas
-- siguen cobradas); después sus herramientas vuelven a confirmada sin liquidación (las anuladas se
-- quedan anuladas) y se borra la fila; con ella, su reserva sale de la hucha. Lo que se pasó al mes
-- siguiente se queda allí. Si una de sus herramientas tiene extorno, no se deshace (lo para su
-- disparador, diciendo cuál): hay que quitar antes el extorno, y si su resto ya se aplicó en otra
-- liquidación, deshacer antes esa. El consultor, como en «Ha llegado»
create or replace function public.consultoria_deshacer_liquidacion(p_consultor uuid, p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_yo uuid := p_consultor;
  v_id uuid;
begin
  if v_yo is null or not exists (select 1 from public.consultoria_consultores k where k.id = v_yo) then
    raise exception 'No hay consultor' using errcode = '42501';
  end if;

  select q.id into v_id
    from public.consultoria_liquidaciones q
   where q.id = p_id and q.consultor_id = v_yo
     for update;
  if v_id is null then
    raise exception 'Esa liquidación no existe' using errcode = 'P0002';
  end if;

  update public.consultoria_extornos
     set liquidacion_id = null
   where liquidacion_id = v_id and consultor_id = v_yo;

  update public.consultoria_cuenta
     set liquidacion_id = null
   where liquidacion_id = v_id and consultor_id = v_yo;

  update public.consultoria_herramientas
     set liquidacion_id = null,
         estado = case when estado = 'anulada' then 'anulada' else 'confirmada' end
   where liquidacion_id = v_id and consultor_id = v_yo;

  delete from public.consultoria_liquidaciones
   where id = v_id and consultor_id = v_yo;
end;
$$;

revoke execute on function public.consultoria_deshacer_liquidacion(uuid, uuid) from public, anon, authenticated;
grant execute on function public.consultoria_deshacer_liquidacion(uuid, uuid) to service_role;
