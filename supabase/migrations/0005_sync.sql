-- Funciones de sincronización usadas por app/src/sync/transporte-supabase.ts.
-- Ambas son SECURITY INVOKER: se ejecutan con los permisos del usuario, así que RLS decide
-- qué puede leer y escribir cada uno.

-- Recibe un lote de cambios [{ref, tabla, parche}] y devuelve [{ref, estado, motivo?}].
-- Cada cambio se aplica por separado: si uno falla, los demás siguen.
-- El parche solo trae los campos modificados; el resto de la fila no se toca (fusión por campo).
create or replace function sync_push(cambios jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  c jsonb;
  v_tabla text;
  v_parche jsonb;
  v_id uuid;
  v_existe boolean;
  v_cols text[];
  v_sql text;
  v_n int;
  v_res jsonb := '[]'::jsonb;
  v_estado text;
  v_motivo text;
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida' using errcode = '28000';
  end if;
  if jsonb_typeof(cambios) <> 'array' or jsonb_array_length(cambios) > 500 then
    raise exception 'Lote inválido (máximo 500 cambios)' using errcode = '22023';
  end if;

  for c in select * from jsonb_array_elements(cambios) loop
    v_estado := 'ok';
    v_motivo := null;
    begin
      v_tabla := c->>'tabla';
      v_parche := (c->'parche') - 'updated_at' - 'updated_by';
      if not (v_tabla = any (tablas_sync())) then
        raise exception 'Tabla no permitida: %', v_tabla using errcode = '42501';
      end if;
      v_id := (v_parche->>'id')::uuid;
      if v_id is null then
        raise exception 'Cambio sin id' using errcode = '22023';
      end if;

      -- Solo columnas reales de la tabla (se ignoran claves desconocidas).
      select array_agg(column_name::text order by ordinal_position) into v_cols
      from information_schema.columns
      where table_schema = 'public' and table_name = v_tabla
        and column_name::text in (select jsonb_object_keys(v_parche))
        and column_name not in ('id','updated_at','updated_by');

      execute format('select exists (select 1 from %I where id = $1)', v_tabla) into v_existe using v_id;

      if not v_existe then
        -- Solo las columnas enviadas: las demás toman su valor por defecto.
        select string_agg(format('%I', col), ', ') into v_sql from unnest(array['id'] || coalesce(v_cols, '{}')) col;
        execute format('insert into %I (%s) select %s from jsonb_populate_record(null::%I, $1)', v_tabla, v_sql, v_sql, v_tabla)
          using v_parche;
      elsif v_cols is not null then
        select string_agg(format('%I = r.%I', col, col), ', ') into v_sql from unnest(v_cols) col;
        execute format(
          'update %I t set %s from jsonb_populate_record(null::%I, $1) r where t.id = $2',
          v_tabla, v_sql, v_tabla
        ) using v_parche, v_id;
        get diagnostics v_n = row_count;
        if v_n = 0 then
          raise exception 'Sin permiso para modificar este registro' using errcode = '42501';
        end if;
      end if;
    exception
      when insufficient_privilege then
        v_estado := 'rechazado'; v_motivo := 'Sin permiso para este cambio';
      when unique_violation then
        v_estado := 'rechazado'; v_motivo := 'Ya existe un registro igual';
      when foreign_key_violation then
        -- Puede faltar una fila relacionada que llega en otro lote: se reintenta luego.
        v_estado := 'reintentar'; v_motivo := 'Falta información relacionada';
      when check_violation or not_null_violation or invalid_text_representation then
        v_estado := 'rechazado'; v_motivo := 'Datos inválidos: ' || sqlerrm;
      when raise_exception then
        v_estado := 'rechazado'; v_motivo := sqlerrm;
      when others then
        if sqlstate = '42501' or sqlerrm like '%row-level security%' then
          v_estado := 'rechazado'; v_motivo := 'Sin permiso para este cambio';
        else
          v_estado := 'reintentar'; v_motivo := sqlerrm;
        end if;
    end;
    v_res := v_res || jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object('ref', c->'ref', 'estado', v_estado, 'motivo', v_motivo))
    );
  end loop;
  return v_res;
end $$;

-- Devuelve las filas visibles para el usuario modificadas después del cursor.
-- Cursor compuesto "updated_at|id": aunque miles de filas tengan la misma hora (importación
-- masiva), la paginación siempre avanza y no se salta ninguna.
-- Al terminar, el cursor queda 60 s antes del inicio de la consulta: una transacción que se
-- confirmó tarde igual llega en la próxima sincronización. Reenviar una fila es inofensivo.
create or replace function sync_pull(desde text default null, limite int default 1000) returns jsonb
language plpgsql security invoker stable set search_path = public as $$
declare
  t text;
  v_inicio timestamptz := clock_timestamp();
  v_ts timestamptz := '-infinity';
  v_id uuid := '00000000-0000-0000-0000-000000000000';
  v_filas jsonb;
  v_n int;
  v_ult_ts timestamptz;
  v_ult_id uuid;
  v_corte_ts timestamptz := null;
  v_corte_id uuid := null;
  v_res jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida' using errcode = '28000';
  end if;
  limite := least(greatest(limite, 1), 5000);
  if desde is not null and desde <> '' then
    v_ts := split_part(desde, '|', 1)::timestamptz;
    v_id := coalesce(nullif(split_part(desde, '|', 2), '')::uuid, v_id);
  end if;

  foreach t in array tablas_sync() loop
    execute format(
      'with x as (select * from %I where (updated_at, id) > ($1, $2) order by updated_at, id limit $3)
       select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at, x.id), ''[]''::jsonb), count(*),
              (select updated_at from x order by updated_at desc, id desc limit 1),
              (select id from x order by updated_at desc, id desc limit 1)
       from x',
      t
    ) into v_filas, v_n, v_ult_ts, v_ult_id using v_ts, v_id, limite;
    if v_n > 0 then
      v_res := v_res || jsonb_build_object(t, v_filas);
    end if;
    if v_n = limite and (v_corte_ts is null or (v_ult_ts, v_ult_id) < (v_corte_ts, v_corte_id)) then
      -- Tabla cortada: la próxima página sigue desde su última fila entregada.
      v_corte_ts := v_ult_ts;
      v_corte_id := v_ult_id;
    end if;
  end loop;

  return jsonb_build_object(
    'filas', v_res,
    'cursor', case
      when v_corte_ts is not null then v_corte_ts::text || '|' || v_corte_id::text
      else (v_inicio - interval '60 seconds')::text || '|'
    end,
    'hay_mas', v_corte_ts is not null
  );
end $$;

revoke all on function sync_push(jsonb) from public, anon;
revoke all on function sync_pull(text, int) from public, anon;
grant execute on function sync_push(jsonb) to authenticated;
grant execute on function sync_pull(text, int) to authenticated;
