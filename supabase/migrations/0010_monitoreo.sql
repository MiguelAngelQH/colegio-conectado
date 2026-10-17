-- Observaciones de monitoreo de la UGEL con respuesta de la dirección.
alter table observacion_monitoreo add column if not exists categoria text not null default 'gestion'
  check (categoria in ('pedagogica','gestion','convivencia','asistencia','infraestructura'));
alter table observacion_monitoreo add column if not exists respuesta text;
alter table observacion_monitoreo add column if not exists respondido_en timestamptz;

-- La dirección solo puede responder y marcar como atendida; el texto y la categoría son de la UGEL.
create or replace function validar_monitoreo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tengo_rol('ugel') or auth.uid() is null then
    return new;
  end if;
  if new.texto is distinct from old.texto or new.categoria is distinct from old.categoria
     or new.fecha is distinct from old.fecha or new.autor_id is distinct from old.autor_id then
    raise exception 'Solo la UGEL puede modificar su observación' using errcode = 'P0001';
  end if;
  if new.respuesta is distinct from old.respuesta then
    new.respondido_en := clock_timestamp();
  end if;
  return new;
end $$;

create trigger validar_monitoreo before update on observacion_monitoreo
for each row execute function validar_monitoreo();
