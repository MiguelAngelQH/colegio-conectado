-- Reglas de negocio que no dependen del cliente y registro de auditoría.

-- ---------------------------------------------------------------- periodo cerrado
-- Ninguna nota de un periodo cerrado se crea ni se modifica (ni siquiera desde un equipo
-- que estuvo sin conexión cuando se cerró). Para corregir, el director reabre el periodo.
create or replace function validar_calificacion() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record;
begin
  select estado, nombre into p from periodo where id = new.periodo_id;
  if p.estado = 'cerrado' then
    raise exception 'El % está cerrado. Pida al director que lo reabra.', p.nombre
      using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and new.periodo_id <> old.periodo_id then
    raise exception 'No se puede mover una nota a otro periodo.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger validar_calificacion before insert or update on calificacion
for each row execute function validar_calificacion();

-- Al cerrar un periodo, toda calificación B o C debe tener conclusión descriptiva
-- (RVM 094-2020-MINEDU). Se valida aquí y no en cada envío para que el docente pueda
-- sincronizar mientras todavía está escribiendo.
create or replace function validar_cierre_periodo() returns trigger
language plpgsql security definer set search_path = public as $$
declare faltan int;
begin
  if new.estado = 'cerrado' and old.estado <> 'cerrado' then
    select count(*) into faltan
    from calificacion
    where periodo_id = new.id and not eliminado
      and nivel_logro in ('B','C') and coalesce(btrim(conclusion), '') = '';
    if faltan > 0 then
      raise exception 'No se puede cerrar el %: faltan % conclusiones descriptivas en calificaciones B o C.',
        new.nombre, faltan using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create trigger validar_cierre_periodo before update on periodo
for each row execute function validar_cierre_periodo();

-- ---------------------------------------------------------------- auditoría
create table auditoria (
  id bigint generated always as identity primary key,
  colegio_id uuid,
  tabla text not null,
  fila_id uuid not null,
  usuario_id uuid,
  momento timestamptz not null default clock_timestamp(),
  operacion text not null,
  antes jsonb,
  despues jsonb
);
create index auditoria_fila on auditoria (tabla, fila_id);
create index auditoria_colegio_momento on auditoria (colegio_id, momento desc);

create or replace function registrar_auditoria() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  d jsonb := to_jsonb(new);
begin
  -- No registrar si solo cambiaron los campos técnicos.
  if a is not null and (a - 'updated_at' - 'updated_by') = (d - 'updated_at' - 'updated_by') then
    return new;
  end if;
  insert into auditoria (colegio_id, tabla, fila_id, usuario_id, operacion, antes, despues)
  values (new.colegio_id, tg_table_name, new.id, auth.uid(), lower(tg_op), a, d);
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['calificacion','asistencia','periodo','matricula','usuario','estudiante','incidencia'] loop
    execute format(
      'create trigger auditoria after insert or update on %I for each row execute function registrar_auditoria()', t);
  end loop;
end $$;
