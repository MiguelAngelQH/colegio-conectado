-- Datos del colegio editables por la dirección, incluida la insignia.
-- La insignia se guarda como imagen pequeña (PNG o JPEG en data URL, máx. ~300 KB) dentro de la fila:
-- así se sincroniza con lo demás y está disponible sin conexión para la app y los PDF.

alter table colegio
  add column codigo_local text not null default '',
  add column dre text not null default '',
  add column provincia text not null default '',
  add column direccion text not null default '',
  add column telefono text not null default '',
  add column correo text not null default '',
  add column lema text not null default '',
  add column insignia text;

alter table colegio add constraint colegio_codigo_modular_formato
  check (codigo_modular = '' or codigo_modular ~ '^[0-9]{7}$') not valid;
alter table colegio add constraint colegio_codigo_local_formato
  check (codigo_local = '' or codigo_local ~ '^[0-9]{6}$');
alter table colegio add constraint colegio_insignia_valida
  check (insignia is null or (insignia ~ '^data:image/(png|jpeg);base64,' and length(insignia) <= 400000));
alter table colegio add constraint colegio_nombre_no_vacio check (length(btrim(nombre)) > 0) not valid;
