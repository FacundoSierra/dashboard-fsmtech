-- Las comisiones recurrentes de los seguros que se cobran por recibo (REQ-002: sección 4 de
-- docs/specs/req-002-comisiones-recurrentes.md; ADR-004). **Solo en `fsmtech`, después de la 0001.**
--
-- Qué es, en llano: un seguro que se cobra por recibo (el RC Integral) se apunta una sola vez, como
-- una **serie**: cada cuánto cobra (cada trimestre o cada semestre natural) y cuántas unidades cobra
-- cada cuota. Cada cuota es una fila más de `consultoria_herramientas`, colgada de su herramienta, y
-- la crea una función que copia la herramienta. Como son filas, «Ha llegado», «Deshacer», lo que «no
-- ha entrado», las previsiones, la hucha y el IRPF las tratan como a cualquier otra línea.
--
-- Qué añade (solo añade):
-- 1. **Cuatro columnas al final de `consultoria_herramientas`**, nulas en todo lo que ya hay:
--    - en la herramienta (la serie): `cuotas_cada_meses` (3 trimestral, 6 semestral; nula = no es
--      recurrente) y `unidades_cuota` (lo que cobra cada cuota: el RC, 1,52);
--    - en cada cuota: `cuota_de` (su herramienta) y `cuota_periodo` (el día 1 de su trimestre o
--      semestre natural: `2026-07-01` es julio-septiembre)
-- 2. **Las reglas de la base**: las restricciones `consultoria_herramientas_serie` y
--    `consultoria_herramientas_cuota`, la FK de la cuota a su herramienta
--    (`consultoria_herramientas_cuota_fk`, compuesta y `on delete restrict`, como la de las APEX) y el
--    índice único `consultoria_herramientas_cuota_unica`: una cuota por periodo, aunque se programe
--    dos veces
-- 3. **El disparador `consultoria_herramienta_cuota`** (`consultoria_proteger_cuota()`): una cuota
--    cuelga de una serie suya, del mismo cliente; una cuota cobrada no cambia de serie ni de periodo;
--    una serie con cuotas no deja de serlo ni cambia de cliente
-- 4. **La función `consultoria_programar_cuotas(p_consultor, p_herramienta, p_periodos, p_cobros,
--    p_pct_irpf)`**, solo para `service_role`: crea las cuotas que le pasan y devuelve cuántas ha
--    creado (0 si ya estaban todas). **La regla de cobro no está aquí**: la calcula
--    `lib/consultoria/reglas.ts` (`cuotasQueFaltan`), y la función solo comprueba que lo que recibe
--    tiene sentido. Así la regla vive en un solo sitio y el panel y los scripts no pueden armar
--    cuotas distintas
-- 5. **`cuota_de` y `cuota_periodo` al final de la vista `consultoria_lineas`**
--
-- Qué no cambia:
-- - **«Ha llegado» (`consultoria_liquidar_mes`) y «Deshacer» (`consultoria_deshacer_liquidacion`)
--   no están en este archivo**: ni una línea. Una cuota es una línea con `unidades > 0`, así que entra,
--   pasa al mes siguiente con su motivo y vuelve a «confirmada» al deshacer, como cualquier otra. Sus
--   `update` no tocan las columnas que vigila el disparador nuevo, así que no lo hacen saltar
-- - **Ningún dato**: las columnas nuevas nacen nulas («no es recurrente»). El RC Integral pasa a ser
--   una serie desde la pantalla, después de publicar el código (sección 8 de la spec)
-- - **RLS y permisos**: no hay tablas nuevas. RLS sigue activo y sin políticas en las once, y los
--   `grant` de tabla de `service_role` cubren las columnas nuevas
-- - **El código publicado hoy** sigue funcionando igual: lee y escribe las columnas por su nombre, no
--   las nuevas, y la vista conserva sus 19 columnas, con dos más al final. Por eso esta migración va
--   **antes** que el código
--
-- Se puede ejecutar más de una vez sin estropear nada (`add column if not exists`, restricciones en
-- bloques que miran si ya están, `create … if not exists`, `create or replace`, `drop trigger if
-- exists`; los `revoke` y `grant` dejan lo mismo). Ojo: si una restricción ya existe, volver a
-- ejecutarla no la cambia; para corregir una ya creada hace falta otra migración (la 0003).
--
-- ───────────────── Lo que tiene que hacer Facundo ─────────────────
-- 1. Abre el editor SQL del proyecto **`fsmtech`** (no el de FSM-Finance), pega este archivo entero y
--    ejecútalo. Tiene que salir «Success. No rows returned». Si sale «Esta es la base de FSM-Finance»
--    (es la base equivocada) o «Falta la 0001», se ha parado antes de cambiar nada. Si la ejecutas
--    otra vez, también sale «Success» (como mucho, avisos de que las columnas y el índice ya existen)
-- 2. (Opcional) Si quieres ver que «Ha llegado» y «Deshacer» no cambian, ejecuta las dos consultas
--    del 0 de abajo **antes y después**: tienen que salir iguales
-- 3. Ejecuta las comprobaciones de abajo **una a una**: cada consulta y cada bloque `do`, por
--    separado (selecciónalo y ejecútalo: el editor solo enseña el resultado de lo último que se
--    ejecuta). Compara con su «Esperado». Las de 1 y 2 solo leen. Las de 3, 4 y 5 son bloques `do`
--    que **acaban en un error rojo a propósito**: el mensaje del error enseña el resultado y, al
--    fallar, no se guarda nada. Usan el consultor que ya hay (y crean uno de prueba si no hubiera),
--    crean dentro el cliente «Prueba» y la compañía PLU si falta, y usan meses de 2099 y 2100 para no
--    mezclarse con datos de verdad
-- 4. Abre `/consultoria` en el panel publicado: tiene que estar **igual que antes**, también octubre.
--    La cuota de octubre del RC aparece después, al convertirlo en serie desde la pantalla (F3)
--
-- Comprobaciones:
/*
-- 0. (Opcional, antes y después de ejecutarla) Lo que no tiene que cambiar
select p.proname, md5(pg_get_functiondef(p.oid)) as huella
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('consultoria_liquidar_mes', 'consultoria_deshacer_liquidacion',
                     'consultoria_proteger_herramienta', 'consultoria_proteger_aportacion')
 order by 1;
select count(*) as herramientas from public.consultoria_herramientas;
-- Esperado: las mismas cuatro huellas y el mismo número de herramientas antes y después

-- 1. Lo que añade
select attname as columna, format_type(atttypid, atttypmod) as tipo
  from pg_attribute
 where attrelid = 'public.consultoria_herramientas'::regclass and attnum > 0 and not attisdropped
 order by attnum desc
 limit 5;
-- Esperado (de la última hacia atrás): cuota_periodo date · cuota_de uuid · unidades_cuota numeric(10,2)
--           · cuotas_cada_meses smallint · aportacion_de uuid

select count(*) as herramientas,
       count(*) filter (where cuotas_cada_meses is not null or unidades_cuota is not null
                           or cuota_de is not null or cuota_periodo is not null) as con_algo_nuevo
  from public.consultoria_herramientas;
-- Esperado: las de siempre · 0 (no trae datos)

select conname, pg_get_constraintdef(oid) as definicion
  from pg_constraint
 where conrelid = 'public.consultoria_herramientas'::regclass
   and conname in ('consultoria_herramientas_serie', 'consultoria_herramientas_cuota', 'consultoria_herramientas_cuota_fk')
 order by 1;
-- Esperado: tres filas. La _cuota y la _serie, dos CHECK; la _cuota_fk,
--   FOREIGN KEY (cuota_de, consultor_id) REFERENCES consultoria_herramientas(id, consultor_id) ON DELETE RESTRICT

select indexname, indexdef from pg_indexes
 where schemaname = 'public' and indexname = 'consultoria_herramientas_cuota_unica';
-- Esperado: CREATE UNIQUE INDEX consultoria_herramientas_cuota_unica ON public.consultoria_herramientas
--   USING btree (cuota_de, cuota_periodo), sin WHERE

select tgname, pg_get_triggerdef(oid) as definicion
  from pg_trigger
 where tgrelid = 'public.consultoria_herramientas'::regclass and not tgisinternal
 order by 1;
-- Esperado: tres. consultoria_herramienta_aportacion y consultoria_herramienta_protegida, como estaban,
--   y consultoria_herramienta_cuota: BEFORE INSERT OR UPDATE OF cuota_de, cuota_periodo, cliente_id,
--   cuotas_cada_meses … FOR EACH ROW EXECUTE FUNCTION consultoria_proteger_cuota()

select attnum, attname
  from pg_attribute
 where attrelid = 'public.consultoria_lineas'::regclass and attnum > 0 and not attisdropped
 order by attnum;
-- Esperado: 21 columnas. Las 19 de antes, de consultor_id (1) a aportacion_de (19), y al final
--   cuota_de (20) y cuota_periodo (21)

-- 2. Permisos
select p.proname, pg_get_function_identity_arguments(p.oid) as argumentos,
       has_function_privilege('public', p.oid, 'execute')        as public,
       has_function_privilege('anon', p.oid, 'execute')          as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('service_role', p.oid, 'execute')  as service_role
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.proname like 'consultoria%'
 order by 1;
-- Esperado: consultoria_deshacer_liquidacion, consultoria_liquidar_mes y la nueva
--   consultoria_programar_cuotas (p_consultor uuid, p_herramienta uuid, p_periodos date[],
--   p_cobros date[], p_pct_irpf numeric): false · false · false · true.
--   Las seis consultoria_proteger_* (aportacion, cargo, cuota, extorno, herramienta y liquidacion):
--   false · false · false · false

select c.relname, pg_get_userbyid(a.grantee) as rol, a.privilege_type
  from pg_class c, aclexplode(c.relacl) a
 where c.relnamespace = 'public'::regnamespace and c.relname like 'consultoria%' and c.relkind in ('r', 'v')
   and pg_get_userbyid(a.grantee) not in ('postgres', 'service_role');
-- Esperado: ninguna fila, como en la 0001

select reloptions from pg_class where oid = 'public.consultoria_lineas'::regclass;
-- Esperado: {security_invoker=on}

select has_table_privilege('service_role', 'public.consultoria_lineas', 'select')                   as sr_lee_lineas,
       has_column_privilege('service_role', 'public.consultoria_herramientas', 'cuota_de', 'insert') as sr_escribe_cuota_de;
-- Esperado: true · true

-- 3. Como el panel (service_role): una serie de prueba, sus cuotas, «Ha llegado», «Deshacer» y lo
-- que la base para. La serie: PLU, sobre recibo, 0 u para cobrar y 37 para el nivel, trimestral con
-- 1,52 por cuota, 2 €/u, sin hucha, IRPF 15, efecto 2099-04-01
do $$
declare
  v_yo uuid; v_cli uuid; v_cli2 uuid; v_serie uuid; v_normal uuid; v_c1 uuid; v_liq uuid;
  r0a text; r0b text; r1 integer; r2 integer; r3 text; r4 text; r4b text; r5 text; r5b integer;
  r6a text; r6b text; r7a text; r7b text; r8a text; r8b text; r8c text; r8d text;
  r9a text; r9b text; r10a text; r10b text; r11 text; r12a text; r12b text;
begin
  set local role service_role;
  select id into v_yo from public.consultoria_consultores;
  if v_yo is null then
    insert into public.consultoria_consultores (id, nombre) values (gen_random_uuid(), 'Prueba') returning id into v_yo;
  end if;
  insert into public.consultoria_companias (consultor_id, codigo, nombre, regla, calendario, meses_hasta_cobro)
  values (v_yo, 'PLU', 'Plus Ultra', 'sin_calendario', null, 1)
  on conflict do nothing;
  insert into public.consultoria_clientes (consultor_id, nombre) values (v_yo, 'Prueba') returning id into v_cli;
  insert into public.consultoria_clientes (consultor_id, nombre) values (v_yo, 'Prueba B') returning id into v_cli2;

  insert into public.consultoria_herramientas
    (consultor_id, cliente_id, compania, producto, tipo_comision, unidades, unidades_nivel, valor_unidad,
     pct_hucha, pct_irpf, mes_produccion, fecha_efecto, fecha_cobro, estado, cuotas_cada_meses, unidades_cuota)
  values (v_yo, v_cli, 'PLU', 'Prueba RC', 'sobre_recibo', 0, 37, 2.00, 0, 15,
          '2099-03-01', '2099-04-01', '2099-07-31', 'confirmada', 3, 1.52)
  returning id into v_serie;

  -- 0. Sin consultor, o con una herramienta que no existe
  begin
    perform public.consultoria_programar_cuotas(null, v_serie, '{}'::date[], '{}'::date[], 15);
    r0a := 'NO LO HA PARADO';
  exception when insufficient_privilege then get stacked diagnostics r0a = message_text;
  end;
  begin
    perform public.consultoria_programar_cuotas(v_yo, gen_random_uuid(), '{}'::date[], '{}'::date[], 15);
    r0b := 'NO LO HA PARADO';
  exception when no_data_found then get stacked diagnostics r0b = message_text;
  end;

  -- 1 y 2. Abril-junio, julio-septiembre y octubre-diciembre; y otra vez
  r1 := public.consultoria_programar_cuotas(v_yo, v_serie,
          array['2099-04-01', '2099-07-01', '2099-10-01']::date[],
          array['2099-07-31', '2099-10-31', '2100-01-31']::date[], 15);
  r2 := public.consultoria_programar_cuotas(v_yo, v_serie,
          array['2099-04-01', '2099-07-01', '2099-10-01']::date[],
          array['2099-07-31', '2099-10-31', '2100-01-31']::date[], 15);

  -- 3. Una cuota: bruto · hucha · irpf · neto, su estado, lo del nivel y su cobro
  select id, concat_ws(' · ', bruto, hucha, irpf, neto) || ', ' || estado || ', nivel ' || unidades_nivel
             || ', cobro ' || to_char(fecha_cobro, 'YYYY-MM-DD')
    into v_c1, r3
    from public.consultoria_herramientas
   where cuota_de = v_serie and cuota_periodo = '2099-04-01';

  -- 4. «Ha llegado» de julio con esa cuota; cobrada no cambia de periodo; «Deshacer»
  v_liq := public.consultoria_liquidar_mes(p_consultor => v_yo, p_mes => '2099-07-01', p_fecha => '2099-07-28',
             p_entraron => array[v_c1], p_extornos => '{}'::uuid[]);
  select estado into r4 from public.consultoria_herramientas where id = v_c1;
  begin
    update public.consultoria_herramientas set cuota_periodo = '2100-07-01' where id = v_c1;
    r4b := 'NO LO HA PARADO';
  exception when raise_exception then get stacked diagnostics r4b = message_text;
  end;
  perform public.consultoria_deshacer_liquidacion(v_yo, v_liq);
  select r4 || ', al deshacer: ' || estado into r4 from public.consultoria_herramientas where id = v_c1;

  -- 5. «Ha llegado» de octubre sin su cuota: pasa al mes siguiente y conserva su periodo. Programar
  -- otra vez las tres no la duplica ni para: ya está guardada
  v_liq := public.consultoria_liquidar_mes(p_consultor => v_yo, p_mes => '2099-10-01', p_fecha => '2099-10-28',
             p_entraron => '{}'::uuid[], p_extornos => '{}'::uuid[], p_motivo => 'prueba');
  select 'pasa al ' || to_char(fecha_cobro, 'YYYY-MM-DD') || ', periodo ' || to_char(cuota_periodo, 'YYYY-MM-DD')
    into r5
    from public.consultoria_herramientas
   where cuota_de = v_serie and cuota_periodo = '2099-07-01';
  r5b := public.consultoria_programar_cuotas(v_yo, v_serie,
           array['2099-04-01', '2099-07-01', '2099-10-01']::date[],
           array['2099-07-31', '2099-10-31', '2100-01-31']::date[], 15);

  -- 6. Una cuota nueva cuyo mes ya está liquidado (abril de 2100, vacío); un periodo que no es de su serie
  perform public.consultoria_liquidar_mes(p_consultor => v_yo, p_mes => '2100-04-01', p_fecha => '2100-04-28',
            p_entraron => '{}'::uuid[], p_extornos => '{}'::uuid[]);
  begin
    perform public.consultoria_programar_cuotas(v_yo, v_serie,
              array['2099-04-01', '2099-07-01', '2099-10-01', '2100-01-01']::date[],
              array['2099-07-31', '2099-10-31', '2100-01-31', '2100-04-30']::date[], 15);
    r6a := 'NO LO HA PARADO';
  exception when raise_exception then get stacked diagnostics r6a = message_text;
  end;
  begin
    perform public.consultoria_programar_cuotas(v_yo, v_serie, array['2099-05-01']::date[], array['2099-08-31']::date[], 15);
    r6b := 'NO LO HA PARADO';
  exception when raise_exception then get stacked diagnostics r6b = message_text;
  end;

  -- 7. Una cuota con unidades_nivel nula (nula = «las de unidades»); una cuota sin periodo
  begin
    insert into public.consultoria_herramientas
      (consultor_id, cliente_id, compania, producto, tipo_comision, unidades, unidades_nivel, valor_unidad,
       pct_hucha, pct_irpf, mes_produccion, fecha_efecto, fecha_cobro, estado, cuota_de, cuota_periodo)
    values (v_yo, v_cli, 'PLU', 'Prueba RC', 'sobre_recibo', 1.52, null, 2.00, 0, 15,
            '2099-03-01', '2099-04-01', '2100-10-31', 'confirmada', v_serie, '2100-07-01');
    r7a := 'ENTRA';
  exception when check_violation then get stacked diagnostics r7a = constraint_name; r7a := 'parado por ' || r7a;
  end;
  begin
    insert into public.consultoria_herramientas
      (consultor_id, cliente_id, compania, producto, tipo_comision, unidades, unidades_nivel, valor_unidad,
       pct_hucha, pct_irpf, mes_produccion, fecha_efecto, fecha_cobro, estado, cuota_de, cuota_periodo)
    values (v_yo, v_cli, 'PLU', 'Prueba RC', 'sobre_recibo', 1.52, 0, 2.00, 0, 15,
            '2099-03-01', '2099-04-01', '2100-10-31', 'confirmada', v_serie, null);
    r7b := 'ENTRA';
  exception when check_violation then get stacked diagnostics r7b = constraint_name; r7b := 'parado por ' || r7b;
  end;

  -- 8. Series que no lo son: sin unidades por cuota; unidades por cuota sin cada cuánto; cada mes; anualizada
  begin
    insert into public.consultoria_herramientas
      (consultor_id, cliente_id, compania, producto, tipo_comision, unidades, unidades_nivel, valor_unidad,
       pct_hucha, pct_irpf, mes_produccion, fecha_efecto, fecha_cobro, estado, cuotas_cada_meses, unidades_cuota)
    values (v_yo, v_cli, 'PLU', 'Prueba RC', 'sobre_recibo', 0, 37, 2.00, 0, 15,
            '2099-03-01', '2099-04-01', '2099-07-31', 'confirmada', 3, null);
    r8a := 'ENTRA';
  exception when check_violation then get stacked diagnostics r8a = constraint_name; r8a := 'parado por ' || r8a;
  end;
  begin
    insert into public.consultoria_herramientas
      (consultor_id, cliente_id, compania, producto, tipo_comision, unidades, unidades_nivel, valor_unidad,
       pct_hucha, pct_irpf, mes_produccion, fecha_efecto, fecha_cobro, estado, cuotas_cada_meses, unidades_cuota)
    values (v_yo, v_cli, 'PLU', 'Prueba RC', 'sobre_recibo', 0, 37, 2.00, 0, 15,
            '2099-03-01', '2099-04-01', '2099-07-31', 'confirmada', null, 1.52);
    r8b := 'ENTRA';
  exception when check_violation then get stacked diagnostics r8b = constraint_name; r8b := 'parado por ' || r8b;
  end;
  begin
    insert into public.consultoria_herramientas
      (consultor_id, cliente_id, compania, producto, tipo_comision, unidades, unidades_nivel, valor_unidad,
       pct_hucha, pct_irpf, mes_produccion, fecha_efecto, fecha_cobro, estado, cuotas_cada_meses, unidades_cuota)
    values (v_yo, v_cli, 'PLU', 'Prueba RC', 'sobre_recibo', 0, 37, 2.00, 0, 15,
            '2099-03-01', '2099-04-01', '2099-07-31', 'confirmada', 1, 1.52);
    r8c := 'ENTRA';
  exception when check_violation then get stacked diagnostics r8c = constraint_name; r8c := 'parado por ' || r8c;
  end;
  begin
    insert into public.consultoria_herramientas
      (consultor_id, cliente_id, compania, producto, tipo_comision, unidades, unidades_nivel, valor_unidad,
       pct_hucha, pct_irpf, mes_produccion, fecha_efecto, fecha_cobro, estado, cuotas_cada_meses, unidades_cuota)
    values (v_yo, v_cli, 'PLU', 'Prueba RC', 'anualizada', 0, 37, 2.00, 0, 15,
            '2099-03-01', '2099-04-01', '2099-07-31', 'confirmada', 3, 1.52);
    r8d := 'ENTRA';
  exception when check_violation then get stacked diagnostics r8d = constraint_name; r8d := 'parado por ' || r8d;
  end;

  -- 9. Una cuota de una herramienta que no es una serie: a mano (el disparador) y con la función
  insert into public.consultoria_herramientas
    (consultor_id, cliente_id, compania, producto, tipo_comision, unidades, valor_unidad, pct_hucha, pct_irpf,
     mes_produccion, fecha_efecto, fecha_cobro, estado)
  values (v_yo, v_cli, 'PLU', 'Prueba', 'anualizada', 10, 2.00, 0, 15, '2099-03-01', '2099-04-01', '2099-05-31', 'confirmada')
  returning id into v_normal;
  begin
    insert into public.consultoria_herramientas
      (consultor_id, cliente_id, compania, producto, tipo_comision, unidades, unidades_nivel, valor_unidad,
       pct_hucha, pct_irpf, mes_produccion, fecha_efecto, fecha_cobro, estado, cuota_de, cuota_periodo)
    values (v_yo, v_cli, 'PLU', 'Prueba', 'anualizada', 1.52, 0, 2.00, 0, 15,
            '2099-03-01', '2099-04-01', '2099-07-31', 'confirmada', v_normal, '2099-04-01');
    r9a := 'NO LO HA PARADO';
  exception when raise_exception then get stacked diagnostics r9a = message_text;
  end;
  begin
    perform public.consultoria_programar_cuotas(v_yo, v_normal, array['2099-04-01']::date[], array['2099-07-31']::date[], 15);
    r9b := 'NO LO HA PARADO';
  exception when raise_exception then get stacked diagnostics r9b = message_text;
  end;

  -- 10. A una serie con cuotas: quitarle la serie; cambiarla de cliente
  begin
    update public.consultoria_herramientas set cuotas_cada_meses = null, unidades_cuota = null where id = v_serie;
    r10a := 'NO LO HA PARADO';
  exception when raise_exception then get stacked diagnostics r10a = message_text;
  end;
  begin
    update public.consultoria_herramientas set cliente_id = v_cli2 where id = v_serie;
    r10b := 'NO LO HA PARADO';
  exception when raise_exception then get stacked diagnostics r10b = message_text;
  end;

  -- 11. Borrar una serie con cuotas
  begin
    delete from public.consultoria_herramientas where id = v_serie;
    r11 := 'NO LO HA PARADO';
  exception when foreign_key_violation then get stacked diagnostics r11 = constraint_name; r11 := '23503 ' || r11;
  end;

  -- 12. Anularla y programar: con la función y a mano
  update public.consultoria_herramientas set estado = 'anulada', anulada_el = '2099-11-15' where id = v_serie;
  begin
    perform public.consultoria_programar_cuotas(v_yo, v_serie, array['2100-07-01']::date[], array['2100-10-31']::date[], 15);
    r12a := 'NO LO HA PARADO';
  exception when raise_exception then get stacked diagnostics r12a = message_text;
  end;
  begin
    insert into public.consultoria_herramientas
      (consultor_id, cliente_id, compania, producto, tipo_comision, unidades, unidades_nivel, valor_unidad,
       pct_hucha, pct_irpf, mes_produccion, fecha_efecto, fecha_cobro, estado, cuota_de, cuota_periodo)
    values (v_yo, v_cli, 'PLU', 'Prueba RC', 'sobre_recibo', 1.52, 0, 2.00, 0, 15,
            '2099-03-01', '2099-04-01', '2100-10-31', 'confirmada', v_serie, '2100-07-01');
    r12b := 'NO LO HA PARADO';
  exception when raise_exception then get stacked diagnostics r12b = message_text;
  end;

  raise exception 'Prueba deshecha, no se ha guardado nada. 0. sin consultor: «%» · una que no existe: «%» || 1. programadas: % · 2. otra vez: % || 3. la de abril-junio: % || 4. «Ha llegado»: % · cambiar el periodo de una cobrada: «%» || 5. no entró en octubre: % · programar otra vez: % || 6. su mes ya liquidado: «%» · un periodo que no es de su serie: «%» || 7. cuota sin nivel: % · cuota sin periodo: % || 8. serie sin unidades por cuota: % · unidades por cuota sin serie: % · cada mes: % · anualizada: % || 9. cuota de una que no es serie: «%» · con la función: «%» || 10. quitarle la serie: «%» · cambiarla de cliente: «%» || 11. borrarla: % || 12. anulada, con la función: «%» · a mano: «%»',
    r0a, r0b, r1, r2, r3, r4, r4b, r5, r5b, r6a, r6b, r7a, r7b, r8a, r8b, r8c, r8d, r9a, r9b, r10a, r10b, r11, r12a, r12b;
end $$;
-- Esperado: Prueba deshecha, no se ha guardado nada.
--    0. sin consultor: «No hay consultor» · una que no existe: «Esa herramienta no existe»
-- || 1. programadas: 3 · 2. otra vez: 0
-- || 3. la de abril-junio: 3.04 · 0.00 · 0.46 · 2.58, confirmada, nivel 0.00, cobro 2099-07-31
-- || 4. «Ha llegado»: cobrada, al deshacer: confirmada
--       · cambiar el periodo de una cobrada: «La cuota de «Prueba RC» ya se cobró: no cambia de herramienta ni de periodo. Deshaz antes la liquidación»
-- || 5. no entró en octubre: pasa al 2099-11-30, periodo 2099-07-01 · programar otra vez: 0
-- || 6. su mes ya liquidado: «La cuota de enero-marzo de 2100 de «Prueba RC» se cobraría en abril de 2100, y esa liquidación ya llegó»
--       · un periodo que no es de su serie: «El 2099-05-01 no empieza un trimestre natural: no es un periodo de «Prueba RC»»
-- || 7. cuota sin nivel: parado por consultoria_herramientas_cuota · cuota sin periodo: parado por consultoria_herramientas_cuota
-- || 8. serie sin unidades por cuota, unidades por cuota sin serie, cada mes y anualizada: las cuatro, parado por consultoria_herramientas_serie
-- || 9. cuota de una que no es serie: «La herramienta «Prueba» no se cobra en cuotas: no puede tener cuotas»
--       · con la función: «La herramienta «Prueba» no se cobra en cuotas»
-- || 10. quitarle la serie: «La herramienta «Prueba RC» tiene cuotas: anúlala para cortar las que faltan»
--       · cambiarla de cliente: «La herramienta «Prueba RC» tiene cuotas: no cambia de cliente mientras las tenga»
-- || 11. borrarla: 23503 consultoria_herramientas_cuota_fk
-- || 12. anulada, con la función y a mano: las dos, «La herramienta «Prueba RC» está anulada: no se programan más cuotas»

-- 4. anon y authenticated no ejecutan la función (lo que tendría quien se hiciera con la clave publicable)
do $$
declare
  v_yo  uuid := (select id from public.consultoria_consultores limit 1);
  v_rol text;
  v_msg text;
  r     text;
begin
  foreach v_rol in array array['anon', 'authenticated'] loop
    execute format('set local role %I', v_rol);
    begin
      perform public.consultoria_programar_cuotas(v_yo, gen_random_uuid(), '{}'::date[], '{}'::date[], 15);
      r := concat_ws(' | ', r, v_rol || ': ENTRA');
    exception
      when insufficient_privilege then
        get stacked diagnostics v_msg = message_text;
        r := concat_ws(' | ', r, v_rol || ': rechazado (' || v_msg || ')');
      when others then
        get stacked diagnostics v_msg = message_text;
        r := concat_ws(' | ', r, v_rol || ': NO LO PARAN LOS PERMISOS (' || v_msg || ')');
    end;
    reset role;
  end loop;
  raise exception 'Prueba deshecha, no se ha guardado nada. %', r;
end $$;
-- Esperado: anon: rechazado (permission denied for function consultoria_programar_cuotas)
--         | authenticated: rechazado (permission denied for function consultoria_programar_cuotas)
-- Si en vez de eso sale «No hay consultor» o «permission denied for table …», la función se puede
-- ejecutar desde fuera: hay que parar y revisar los permisos

-- 5. El RC de antes (sección 8 de la spec, el paso F3, ensayado): una herramienta sobre recibo que ya
-- cobró su primera cuota en julio pasa a ser una serie sin tocar lo cobrado; se programan las
-- siguientes; octubre sale con una herramienta como la del TopPlan (90 u, 10 % de hucha) y la cuota;
-- y el plan B (borrar sus cuotas sin cobrar y quitarle la serie) funciona
do $$
declare
  v_yo uuid; v_cli uuid; v_rc uuid; v_liq uuid;
  r_conv text; r1 integer; r2 integer; r_mes text; r_planb text;
begin
  set local role service_role;
  select id into v_yo from public.consultoria_consultores;
  if v_yo is null then
    insert into public.consultoria_consultores (id, nombre) values (gen_random_uuid(), 'Prueba') returning id into v_yo;
  end if;
  insert into public.consultoria_companias (consultor_id, codigo, nombre, regla, calendario, meses_hasta_cobro)
  values (v_yo, 'PLU', 'Plus Ultra', 'sin_calendario', null, 1)
  on conflict do nothing;
  insert into public.consultoria_clientes (consultor_id, nombre) values (v_yo, 'Prueba') returning id into v_cli;

  -- Como el RC: 1,52 u para cobrar (su primera cuota, la de abril-junio) y 37 para el nivel
  insert into public.consultoria_herramientas
    (consultor_id, cliente_id, compania, producto, tipo_comision, unidades, unidades_nivel, valor_unidad,
     pct_hucha, pct_irpf, mes_produccion, fecha_efecto, fecha_cobro, estado)
  values (v_yo, v_cli, 'PLU', 'Prueba RC', 'sobre_recibo', 1.52, 37, 2.00, 0, 15,
          '2099-05-01', '2099-06-01', '2099-07-31', 'confirmada')
  returning id into v_rc;
  insert into public.consultoria_herramientas
    (consultor_id, cliente_id, compania, producto, aportacion, unidades, valor_unidad, pct_hucha, pct_irpf,
     mes_produccion, fecha_efecto, fecha_cobro, estado)
  values (v_yo, v_cli, 'PLU', 'Prueba', 100, 90, 2.00, 10, 15, '2099-09-01', '2099-10-01', '2099-10-31', 'confirmada');
  v_liq := public.consultoria_liquidar_mes(p_consultor => v_yo, p_mes => '2099-07-01', p_fecha => '2099-07-29',
             p_entraron => array[v_rc], p_extornos => '{}'::uuid[]);

  -- «Cambiar»: trimestral con 1,52 por cuota; lo demás, con los mismos valores (como lo manda la pantalla)
  update public.consultoria_herramientas
     set cuotas_cada_meses = 3, unidades_cuota = 1.52,
         unidades = 1.52, valor_unidad = 2.00, pct_hucha = 0, pct_irpf = 15, fecha_cobro = '2099-07-31'
   where id = v_rc;
  select estado || case when liquidacion_id = v_liq then ', en su liquidación' else ', FUERA DE SU LIQUIDACIÓN' end
    into r_conv
    from public.consultoria_herramientas where id = v_rc;

  -- Abril-junio es la propia firma: no se programa ni se comprueba (aunque julio ya esté liquidado)
  r1 := public.consultoria_programar_cuotas(v_yo, v_rc,
          array['2099-04-01', '2099-07-01', '2099-10-01', '2100-01-01']::date[],
          array['2099-07-31', '2099-10-31', '2100-01-31', '2100-04-30']::date[], 15);
  r2 := public.consultoria_programar_cuotas(v_yo, v_rc,
          array['2099-04-01', '2099-07-01', '2099-10-01', '2100-01-01']::date[],
          array['2099-07-31', '2099-10-31', '2100-01-31', '2100-04-30']::date[], 15);

  select concat_ws(' · ', comision_pendiente, rc_pendiente, neta_pendiente, irpf_pendiente)
         || ' → ' || (neta_pendiente - irpf_pendiente)
    into r_mes
    from public.consultoria_liquidaciones_por_mes
   where consultor_id = v_yo and mes = '2099-10-01';

  -- Plan B: borrar sus cuotas sin cobrar y quitarle la serie
  delete from public.consultoria_herramientas where cuota_de = v_rc and liquidacion_id is null;
  update public.consultoria_herramientas set cuotas_cada_meses = null, unidades_cuota = null where id = v_rc;
  select case when h.cuotas_cada_meses is null and h.unidades_cuota is null then 'sin serie' else 'SIGUE SIENDO SERIE' end
         || ', ' || (select count(*) from public.consultoria_herramientas c where c.cuota_de = v_rc) || ' cuotas, '
         || h.estado
    into r_planb
    from public.consultoria_herramientas h where h.id = v_rc;

  raise exception 'Prueba deshecha, no se ha guardado nada. Pasa a serie: % | programadas: % | otra vez: % | octubre: % | plan B: %',
    r_conv, r1, r2, r_mes, r_planb;
end $$;
-- Esperado: Prueba deshecha, no se ha guardado nada. Pasa a serie: cobrada, en su liquidación
--   | programadas: 3 | otra vez: 0 | octubre: 183.04 · 18.00 · 165.04 · 24.76 → 140.28
--   | plan B: sin serie, 0 cuotas, cobrada
-- (Octubre es la cuenta de la n.º 6: comisión, RC, neta e IRPF sobre el total, y lo que queda)
*/

-- ───────────────── Solo en `fsmtech`, y después de la 0001 ─────────────────
-- Si la base tiene `perfiles`, es la de FSM-Finance; si no tiene las herramientas, falta la 0001. En
-- los dos casos se para antes de cambiar nada
do $$
begin
  if to_regclass('public.perfiles') is not null then
    raise exception 'Esta es la base de FSM-Finance: la 0002 es solo para fsmtech. No se ha cambiado nada';
  end if;
  if to_regclass('public.consultoria_herramientas') is null then
    raise exception 'Falta la 0001: ejecútala antes que la 0002. No se ha cambiado nada';
  end if;
end $$;

-- ───────────────── Las columnas de la serie y de la cuota ─────────────────
-- Al final de la tabla, detrás de `aportacion_de`, y nulas en todo lo que ya hay. En una cuota, el
-- resto de columnas sale de su herramienta (la función de abajo): `aportacion` nula (así no suma dos
-- veces), `unidades` = `unidades_cuota`, `unidades_nivel` **0** (nunca nula: nula querría decir «las
-- de `unidades`») y el IRPF de Ajustes del momento
alter table public.consultoria_herramientas
  add column if not exists cuotas_cada_meses smallint,        -- la serie: 3 (trimestral) o 6 (semestral); nula = no es recurrente
  add column if not exists unidades_cuota    numeric(10,2),   -- la serie: lo que cobra cada cuota
  add column if not exists cuota_de          uuid,            -- la cuota: la herramienta de la que es cuota; nula en las demás
  add column if not exists cuota_periodo     date;            -- la cuota: día 1 de su trimestre o semestre natural

-- ───────────────── Una cuota por periodo ─────────────────
-- Es el árbitro del `on conflict` de `consultoria_programar_cuotas`: programar dos veces no duplica.
-- Sin predicado, para que `on conflict (cuota_de, cuota_periodo)` lo encuentre solo: los NULL son
-- distintos en un índice único (lo de serie en Postgres), así que las filas que no son cuotas (las
-- dos nulas) no chocan entre sí. Sirve también de índice para la FK de abajo y para buscar las
-- cuotas de una serie
create unique index if not exists consultoria_herramientas_cuota_unica
  on public.consultoria_herramientas (cuota_de, cuota_periodo);

-- ───────────────── Las restricciones ─────────────────
-- **Un `check` que da NULL deja pasar la fila.** Por eso cada condición está escrita para no dar nunca
-- NULL: la primera mitad solo usa `is null`; la segunda empieza por `is not null` de las columnas que
-- pueden ser nulas (si una lo es, esa mitad es falsa, no nula: falso AND lo que sea es falso) y lo
-- demás compara columnas `not null` o con `coalesce`. Comprobado en el bloque 3 de arriba (7 y 8).
-- En bloques que miran `pg_constraint`, para poder repetir la migración
do $$
begin
  -- La serie: las dos columnas o ninguna. Cada trimestre o cada semestre (los recibos mensuales no
  -- son recurrentes: van anualizados, de una vez; los anuales no entran), con unidades por cuota, solo
  -- en una comisión sobre recibo o sobre saldo, y ni una APEX ni una cuota son una serie
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.consultoria_herramientas'::regclass
                    and conname = 'consultoria_herramientas_serie') then
    alter table public.consultoria_herramientas
      add constraint consultoria_herramientas_serie check (
        (cuotas_cada_meses is null and unidades_cuota is null)
        or (cuotas_cada_meses is not null and unidades_cuota is not null
            and cuotas_cada_meses in (3, 6)
            and unidades_cuota > 0
            and tipo_comision in ('sobre_recibo', 'sobre_saldo')
            and aportacion_de is null
            and cuota_de is null)
      );
  end if;

  -- La cuota: su herramienta y su periodo, o ninguno. Nunca de sí misma ni una APEX, 0 para el nivel
  -- (con `coalesce`: una `unidades_nivel` nula no pasa), con unidades que cobrar y su periodo en día 1
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.consultoria_herramientas'::regclass
                    and conname = 'consultoria_herramientas_cuota') then
    alter table public.consultoria_herramientas
      add constraint consultoria_herramientas_cuota check (
        (cuota_de is null and cuota_periodo is null)
        or (cuota_de is not null and cuota_periodo is not null
            and cuota_de <> id
            and aportacion_de is null
            and coalesce(unidades_nivel, -1) = 0
            and unidades > 0
            and extract(day from cuota_periodo) = 1)
      );
  end if;

  -- Compuesta, como la de las APEX: una cuota nunca cuelga de una herramienta de otro consultor.
  -- `on delete restrict`: una herramienta con cuotas no se borra (se borran antes sus cuotas)
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.consultoria_herramientas'::regclass
                    and conname = 'consultoria_herramientas_cuota_fk') then
    alter table public.consultoria_herramientas
      add constraint consultoria_herramientas_cuota_fk
      foreign key (cuota_de, consultor_id)
      references public.consultoria_herramientas (id, consultor_id) on delete restrict;
  end if;
end $$;

-- ───────────────── Lo que no se puede hacer con una serie y sus cuotas ─────────────────
-- Errores P0001 con un mensaje en español, que el panel enseña tal cual: dicen el producto, **nunca
-- el cliente**. Salta al crear una herramienta y al cambiar lo único que puede romper estas reglas
-- (`update of`): «Ha llegado», «Deshacer», anular y cambiar unidades o notas no lo hacen saltar.
-- - **Una cuota**: su herramienta existe, es del mismo consultor (también lo exige la FK) y del mismo
--   cliente, no es a su vez una cuota y es una serie. Al crearla, o al colgarla de otra, su
--   herramienta no puede estar anulada
-- - **Una cobrada** no cambia de herramienta ni de periodo, ni pasa a ser una cuota
-- - **Una serie con cuotas** no deja de serlo (para cortarla, se anula; para deshacerla, se borran
--   antes sus cuotas) ni cambia de cliente, como pasa con las APEX
-- Con los permisos de quien llama, que aquí es siempre `service_role` (o `postgres`) y lo ve todo
create or replace function public.consultoria_proteger_cuota()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_cliente  uuid;
  v_cada     smallint;
  v_madre    uuid;
  v_estado   text;
  v_producto text;
begin
  if new.cuota_de is not null then
    select h.cliente_id, h.cuotas_cada_meses, h.cuota_de, h.estado, h.producto
      into v_cliente, v_cada, v_madre, v_estado, v_producto
      from public.consultoria_herramientas h
     where h.id = new.cuota_de
       and h.consultor_id = new.consultor_id;
    if not found then
      raise exception 'No encuentro la herramienta de la que «%» es cuota', new.producto
        using errcode = 'P0001';
    end if;
    if v_cliente is distinct from new.cliente_id then
      raise exception 'La cuota de «%» tiene que ser del mismo cliente que su herramienta', v_producto
        using errcode = 'P0001';
    end if;
    if v_madre is not null then
      raise exception 'La herramienta «%» ya es una cuota: una cuota cuelga de su serie, no de otra cuota', v_producto
        using errcode = 'P0001';
    end if;
    if v_cada is null then
      raise exception 'La herramienta «%» no se cobra en cuotas: no puede tener cuotas', v_producto
        using errcode = 'P0001';
    end if;
    if v_estado = 'anulada' then
      if tg_op = 'INSERT' then
        raise exception 'La herramienta «%» está anulada: no se programan más cuotas', v_producto
          using errcode = 'P0001';
      elsif new.cuota_de is distinct from old.cuota_de then
        raise exception 'La herramienta «%» está anulada: no se programan más cuotas', v_producto
          using errcode = 'P0001';
      end if;
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if old.liquidacion_id is not null
       and (new.cuota_de is distinct from old.cuota_de or new.cuota_periodo is distinct from old.cuota_periodo) then
      if old.cuota_de is not null then
        raise exception 'La cuota de «%» ya se cobró: no cambia de herramienta ni de periodo. Deshaz antes la liquidación', old.producto
          using errcode = 'P0001';
      end if;
      raise exception 'La herramienta «%» ya se cobró: no pasa a ser una cuota. Deshaz antes la liquidación', old.producto
        using errcode = 'P0001';
    end if;

    if old.cuotas_cada_meses is not null and new.cuotas_cada_meses is null and exists (
         select 1 from public.consultoria_herramientas c where c.cuota_de = old.id) then
      raise exception 'La herramienta «%» tiene cuotas: anúlala para cortar las que faltan', old.producto
        using errcode = 'P0001';
    end if;

    if new.cliente_id is distinct from old.cliente_id and exists (
         select 1 from public.consultoria_herramientas c where c.cuota_de = old.id) then
      raise exception 'La herramienta «%» tiene cuotas: no cambia de cliente mientras las tenga', old.producto
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists consultoria_herramienta_cuota on public.consultoria_herramientas;
create trigger consultoria_herramienta_cuota
  before insert or update of cuota_de, cuota_periodo, cliente_id, cuotas_cada_meses on public.consultoria_herramientas
  for each row execute function public.consultoria_proteger_cuota();

-- Nadie la llama desde fuera: solo el disparador, que no necesita el permiso
revoke execute on function public.consultoria_proteger_cuota() from public, anon, authenticated, service_role;

-- ───────────────── Programar las cuotas de una serie ─────────────────
-- La llaman el panel (al apuntar o cambiar una serie, después de «Ha llegado» y con el botón de la
-- herramienta) y el script de la firma. Con los permisos de quien llama (`service_role`, que se salta
-- el RLS: por eso cada sentencia filtra por `consultor_id`), todo en una transacción:
-- 1. Si `p_consultor` es nulo o no está en `consultoria_consultores`, 42501 («No hay consultor»), como
--    en «Ha llegado»
-- 2. Lee la herramienta `for update`, así que dos llamadas a la vez van una detrás de otra. Si no está,
--    P0002; si no es una serie o está anulada, P0001
-- 3. Comprueba lo que recibe (P0001 si algo falla), **sin repetir la regla**, que es de `reglas.ts`:
--    - las dos listas, igual de largas, sin vacíos y sin periodos repetidos; el IRPF, de 0 a 100;
--    - cada periodo, día 1 de un trimestre o semestre natural de su serie, y no anterior al que
--      contiene el efecto;
--    - cada cobro, el último día de un mes y no antes del mes siguiente al final de su periodo;
--    - **de las que aún no están guardadas** (ni son la propia firma), ningún cobro en un mes que ya
--      tiene liquidación. Las ya guardadas no se comprueban: se las salta el `on conflict`, aunque
--      «no ha entrado» las haya movido de mes
-- 4. Inserta las cuotas copiando la herramienta. Deja fuera el periodo que ya cubre la propia
--    herramienta (la que tiene unidades para cobrar: el RC de antes cobró la de abril-junio) y salta
--    las que ya estaban (`on conflict do nothing`). Los disparadores de siempre siguen saltando
-- 5. Devuelve cuántas ha creado: 0 si ya estaban todas
create or replace function public.consultoria_programar_cuotas(
  p_consultor   uuid,
  p_herramienta uuid,
  p_periodos    date[],
  p_cobros      date[],
  p_pct_irpf    numeric
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_yo      uuid := p_consultor;
  v_h       public.consultoria_herramientas%rowtype;
  v_cada    integer;
  v_nombre  text;   -- «trimestre» o «semestre»
  v_primero date;   -- el día 1 del periodo que contiene el efecto
  v_meses   constant text[] := array['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
                                     'septiembre', 'octubre', 'noviembre', 'diciembre'];
  v_periodo date;
  v_cobro   date;
  v_texto   text;   -- «abril-junio de 2026»
  v_n       integer;
begin
  -- 1. El consultor
  if v_yo is null or not exists (select 1 from public.consultoria_consultores k where k.id = v_yo) then
    raise exception 'No hay consultor' using errcode = '42501';
  end if;

  -- 2. La herramienta, bloqueada hasta el final
  select h.* into v_h
    from public.consultoria_herramientas h
   where h.id = p_herramienta and h.consultor_id = v_yo
     for update;
  if not found then
    raise exception 'Esa herramienta no existe' using errcode = 'P0002';
  end if;
  if v_h.cuotas_cada_meses is null then
    raise exception 'La herramienta «%» no se cobra en cuotas', v_h.producto using errcode = 'P0001';
  end if;
  if v_h.estado = 'anulada' then
    raise exception 'La herramienta «%» está anulada: no se programan más cuotas', v_h.producto using errcode = 'P0001';
  end if;

  v_cada    := v_h.cuotas_cada_meses;
  v_nombre  := case v_cada when 3 then 'trimestre' else 'semestre' end;
  v_primero := make_date(extract(year from v_h.fecha_efecto)::int,
                         (extract(month from v_h.fecha_efecto)::int - 1) / v_cada * v_cada + 1, 1);

  -- 3. Lo que llega
  if p_periodos is null or p_cobros is null then
    raise exception 'Faltan las cuotas que programar' using errcode = 'P0001';
  end if;
  if cardinality(p_periodos) <> cardinality(p_cobros) then
    raise exception 'Cada cuota lleva su periodo y su cobro: las dos listas tienen que ser igual de largas' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(p_periodos) as x where x is null)
     or exists (select 1 from unnest(p_cobros) as x where x is null) then
    raise exception 'Hay una cuota sin periodo o sin cobro' using errcode = 'P0001';
  end if;
  if (select count(distinct x) from unnest(p_periodos) as x) <> cardinality(p_periodos) then
    raise exception 'Hay un periodo repetido: cada cuota se programa una vez' using errcode = 'P0001';
  end if;
  if p_pct_irpf is null or p_pct_irpf < 0 or p_pct_irpf > 100 then
    raise exception 'El IRPF va de 0 a 100' using errcode = 'P0001';
  end if;

  for v_periodo, v_cobro in
    select c.periodo, c.cobro from unnest(p_periodos, p_cobros) as c(periodo, cobro)
  loop
    if extract(day from v_periodo) <> 1 or (extract(month from v_periodo)::int - 1) % v_cada <> 0 then
      raise exception 'El % no empieza un % natural: no es un periodo de «%»',
        to_char(v_periodo, 'YYYY-MM-DD'), v_nombre, v_h.producto
        using errcode = 'P0001';
    end if;
    v_texto := v_meses[extract(month from v_periodo)::int] || '-'
               || v_meses[extract(month from v_periodo)::int + v_cada - 1]
               || ' de ' || extract(year from v_periodo)::int::text;
    if v_periodo < v_primero then
      raise exception 'La cuota de % es anterior al efecto de «%» (%)', v_texto, v_h.producto,
        to_char(v_h.fecha_efecto, 'YYYY-MM-DD')
        using errcode = 'P0001';
    end if;
    if extract(day from v_cobro + 1) <> 1 then
      raise exception 'El cobro de la cuota de % tiene que ser el último día de un mes', v_texto
        using errcode = 'P0001';
    end if;
    if v_cobro < (v_periodo + make_interval(months => v_cada))::date then
      raise exception 'La cuota de % no se cobra en % de %: se cobra cuando ha acabado su %', v_texto,
        v_meses[extract(month from v_cobro)::int], extract(year from v_cobro)::int::text, v_nombre
        using errcode = 'P0001';
    end if;
    if not (v_h.unidades > 0 and v_periodo = v_primero)
       and not exists (select 1 from public.consultoria_herramientas c
                        where c.cuota_de = v_h.id and c.cuota_periodo = v_periodo and c.consultor_id = v_yo)
       and exists (select 1 from public.consultoria_liquidaciones q
                    where q.consultor_id = v_yo
                      and q.mes = make_date(extract(year from v_cobro)::int, extract(month from v_cobro)::int, 1)) then
      raise exception 'La cuota de % de «%» se cobraría en % de %, y esa liquidación ya llegó', v_texto, v_h.producto,
        v_meses[extract(month from v_cobro)::int], extract(year from v_cobro)::int::text
        using errcode = 'P0001';
    end if;
  end loop;

  -- 4. Las cuotas, copiando la herramienta. `estado`: prevista si lo está su herramienta; si no,
  -- confirmada. `notas`, `origen` y la serie (`cuotas_cada_meses`, `unidades_cuota`), nulos: `origen`
  -- tiene su índice único y una cuota no es una serie
  insert into public.consultoria_herramientas
    (consultor_id, cliente_id, compania, producto, pago, periodicidad, tipo_comision, duracion_anios, propio,
     aportacion, unidades, unidades_nivel, valor_unidad, pct_hucha, pct_irpf, fecha_confirmacion,
     mes_produccion, fecha_efecto, fecha_cobro, estado, fechas_provisionales, notas, origen,
     cuota_de, cuota_periodo)
  select v_yo, v_h.cliente_id, v_h.compania, v_h.producto, v_h.pago, v_h.periodicidad, v_h.tipo_comision,
         v_h.duracion_anios, v_h.propio,
         null, v_h.unidades_cuota, 0, v_h.valor_unidad, v_h.pct_hucha, p_pct_irpf, v_h.fecha_confirmacion,
         v_h.mes_produccion, v_h.fecha_efecto, c.cobro,
         case when v_h.estado = 'prevista' then 'prevista' else 'confirmada' end,
         v_h.fechas_provisionales, null, null,
         v_h.id, c.periodo
    from unnest(p_periodos, p_cobros) as c(periodo, cobro)
   where not (v_h.unidades > 0 and c.periodo = v_primero)
   order by c.periodo
  on conflict (cuota_de, cuota_periodo) do nothing;

  -- 5. Las que ha creado
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.consultoria_programar_cuotas(uuid, uuid, date[], date[], numeric)
  from public, anon, authenticated;
grant execute on function public.consultoria_programar_cuotas(uuid, uuid, date[], date[], numeric)
  to service_role;

-- ───────────────── La vista de las líneas, con la cuota ─────────────────
-- La misma que en la 0001, con `cuota_de` y `cuota_periodo` al final: la línea de una cuota se rotula
-- «RC Integral · cuota jul-sep» en «Ha llegado» y en el detalle del mes, y el recuento la cuenta como
-- cuota y no como herramienta. `create or replace view` solo deja añadir columnas al final, y conserva
-- el dueño y los permisos; pero las opciones del `with (…)` se toman de este comando (si faltaran, se
-- quedaría sin `security_invoker`), así que se vuelve a escribir. Los `revoke` y `grant` dejan lo
-- mismo que la 0001
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
         h.aportacion_de,
         h.cuota_de,
         h.cuota_periodo
    from public.consultoria_herramientas h
    join public.consultoria_clientes c on c.id = h.cliente_id
   where h.unidades > 0
     and (h.estado <> 'anulada' or h.liquidacion_id is not null);

-- `create or replace view` conserva los permisos de la 0001: no se le quitan a service_role,
-- para que el panel no se quede sin la vista ni un instante si el editor no lo ejecuta todo de una vez
revoke all on table public.consultoria_lineas from public, anon, authenticated;
grant select on table public.consultoria_lineas to service_role;

-- ───────────────── Que PostgREST vea lo nuevo ─────────────────
-- Supabase lo recarga solo con su disparador de DDL; esto lo pide por si acaso
notify pgrst, 'reload schema';
