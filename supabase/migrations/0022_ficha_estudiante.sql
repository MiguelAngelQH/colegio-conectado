-- Ficha completa del estudiante: contacto de emergencia, salud, seguro, NEE y datos familiares.
-- La edita la dirección; la ven quienes ya pueden ver al estudiante (su tutor, sus docentes y su familia).
alter table estudiante
  add column if not exists direccion text,
  add column if not exists contacto_emergencia text,
  add column if not exists telefono_emergencia text,
  add column if not exists seguro text check (seguro in ('SIS','EsSalud','Privado','Ninguno')),
  add column if not exists salud text,
  add column if not exists nee text,
  add column if not exists lengua_materna text,
  add column if not exists vive_con text;
