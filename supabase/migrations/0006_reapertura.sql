-- Reapertura de periodos: el director debe indicar el motivo (queda en la fila y en la auditoría).
alter table periodo add column if not exists motivo_reapertura text;

create or replace function validar_reapertura_periodo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.estado = 'cerrado' and new.estado = 'abierto' then
    if coalesce(btrim(new.motivo_reapertura), '') = '' or new.motivo_reapertura is not distinct from old.motivo_reapertura then
      raise exception 'Para reabrir el % indique el motivo.', new.nombre using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create trigger validar_reapertura_periodo before update on periodo
for each row execute function validar_reapertura_periodo();
