-- Acceso con DNI o correo. Cada cuenta ingresa con su DNI (Supabase Auth usa un correo derivado de él,
-- ver supabase/functions/_shared/acceso.ts) y, si lo tiene, también con su correo.
-- Por eso el DNI y el correo de una cuenta deben ser únicos, y el DNI no se cambia desde la app.

-- Formato: 8 dígitos. "not valid" respeta filas antiguas; las nuevas y las editadas sí se validan.
alter table usuario add constraint usuario_dni_formato check (dni is null or dni ~ '^[0-9]{8}$') not valid;

create unique index usuario_dni_unico on usuario (dni) where dni is not null and not eliminado;
create unique index usuario_email_unico on usuario (lower(email)) where email is not null and not eliminado;

-- El DNI es el usuario de ingreso: cambiarlo desde la app dejaría la cuenta sin acceso.
-- Solo la clave de servicio (Edge Functions, administración) puede corregirlo.
create or replace function proteger_dni_usuario() returns trigger
language plpgsql as $$
begin
  if old.dni is not null and new.dni is distinct from old.dni and current_user in ('authenticated', 'anon') then
    raise exception 'El DNI de una cuenta no se puede cambiar desde la app. Pida a la dirección que lo corrija.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger proteger_dni_usuario before update on usuario
  for each row execute function proteger_dni_usuario();
