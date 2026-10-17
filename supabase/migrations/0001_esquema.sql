-- Colegio Conectado - esquema principal.
-- Convenciones:
--   * Toda tabla sincronizable tiene: id uuid (lo genera el cliente), colegio_id, updated_at,
--     updated_by y eliminado (borrado lógico, para que el borrado también se sincronice).
--   * updated_at lo pone SIEMPRE el servidor (trigger), nunca se confía en el reloj del celular.
--   * Los nombres coinciden con app/src/db/tipos.ts.


-- ---------------------------------------------------------------- utilidades
create or replace function marcar_cambio() returns trigger
language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  return new;
end $$;

-- Crea los campos comunes y el trigger en una tabla.
create or replace function preparar_tabla_sync(t regclass) returns void
language plpgsql as $$
begin
  execute format('alter table %s add column if not exists updated_at timestamptz not null default clock_timestamp()', t);
  execute format('alter table %s add column if not exists updated_by uuid', t);
  execute format('alter table %s add column if not exists eliminado boolean not null default false', t);
  execute format('create index if not exists %I on %s (updated_at, id)', replace(t::text, '.', '_') || '_sync_idx', t);
  execute format('drop trigger if exists marcar_cambio on %s', t);
  execute format('create trigger marcar_cambio before insert or update on %s for each row execute function marcar_cambio()', t);
end $$;

-- ---------------------------------------------------------------- institución
create table colegio (
  id uuid primary key,
  colegio_id uuid,                -- igual a id (uniformidad para la sincronización)
  nombre text not null,
  codigo_modular text not null default '',
  ugel text not null default '',
  region text not null default '',
  distrito text not null default ''
);

create table usuario (
  id uuid primary key references auth.users (id) on delete cascade,
  colegio_id uuid references colegio (id),
  nombres text not null,
  apellidos text not null,
  dni text,
  email text,
  roles text[] not null default '{}',
  activo boolean not null default true,
  constraint usuario_roles_validos check (
    roles <@ array['ugel','director','subdirector','docente','tutor','auxiliar','estudiante','apoderado']
  )
);

create table anio_escolar (
  id uuid primary key,
  colegio_id uuid not null references colegio (id),
  anio int not null check (anio between 2020 and 2100),
  regimen text not null check (regimen in ('bimestre','trimestre')),
  activo boolean not null default false
);

create table periodo (
  id uuid primary key,
  colegio_id uuid not null references colegio (id),
  anio_id uuid not null references anio_escolar (id),
  numero int not null check (numero between 1 and 4),
  nombre text not null,
  inicio date not null,
  fin date not null,
  estado text not null default 'abierto' check (estado in ('abierto','cerrado')),
  check (fin >= inicio)
);

create table grado (
  id uuid primary key,
  colegio_id uuid not null references colegio (id),
  nivel text not null check (nivel in ('primaria','secundaria')),
  numero int not null,
  nombre text not null
);

create table seccion (
  id uuid primary key,
  colegio_id uuid not null references colegio (id),
  anio_id uuid not null references anio_escolar (id),
  grado_id uuid not null references grado (id),
  letra text not null,
  tutor_id uuid references usuario (id)
);

-- Catálogo CNEB: colegio_id null = oficial. Un colegio puede agregar talleres propios.
create table area (
  id uuid primary key,
  colegio_id uuid references colegio (id),
  nivel text not null check (nivel in ('primaria','secundaria')),
  codigo text not null,
  nombre text not null,
  opcional boolean not null default false,
  orden int not null default 0
);

create table competencia (
  id uuid primary key,
  colegio_id uuid references colegio (id),
  area_id uuid not null references area (id),
  numero int not null,
  nombre text not null,
  orden int not null default 0
);

create table docente_asignacion (
  id uuid primary key,
  colegio_id uuid not null references colegio (id),
  docente_id uuid not null references usuario (id),
  seccion_id uuid not null references seccion (id),
  area_id uuid not null references area (id)
);

-- ---------------------------------------------------------------- estudiantes
create table estudiante (
  id uuid primary key,
  colegio_id uuid not null references colegio (id),
  usuario_id uuid references usuario (id),
  dni text,
  nombres text not null,
  apellidos text not null,
  fecha_nacimiento date,
  sexo text check (sexo in ('M','F')),
  codigo_carne text not null
);
create unique index estudiante_carne_unico on estudiante (colegio_id, codigo_carne);

create table matricula (
  id uuid primary key,
  colegio_id uuid not null references colegio (id),
  anio_id uuid not null references anio_escolar (id),
  seccion_id uuid not null references seccion (id),
  estudiante_id uuid not null references estudiante (id),
  estado text not null default 'matriculado' check (estado in ('matriculado','retirado','trasladado'))
);

create table apoderado (
  id uuid primary key,
  colegio_id uuid not null references colegio (id),
  usuario_id uuid references usuario (id),
  dni text,
  nombres text not null,
  apellidos text not null,
  telefono text
);

create table estudiante_apoderado (
  id uuid primary key,
  colegio_id uuid not null references colegio (id),
  estudiante_id uuid not null references estudiante (id),
  apoderado_id uuid not null references apoderado (id),
  parentesco text not null,
  orden int not null default 1 check (orden between 1 and 3)
);

-- ---------------------------------------------------------------- evaluación
-- El cliente genera el id de forma determinística a partir de (estudiante, competencia, periodo),
-- así dos equipos sin conexión que califican lo mismo producen la misma fila y se fusionan.
create table calificacion (
  id uuid primary key,
  colegio_id uuid not null references colegio (id),
  estudiante_id uuid not null references estudiante (id),
  competencia_id uuid not null references competencia (id),
  periodo_id uuid not null references periodo (id),
  seccion_id uuid not null references seccion (id),
  nivel_logro text check (nivel_logro in ('AD','A','B','C')),
  conclusion text,
  unique (estudiante_id, competencia_id, periodo_id)
);
create index calificacion_seccion_periodo on calificacion (seccion_id, periodo_id);

-- ---------------------------------------------------------------- asistencia
create table asistencia_sesion (
  id uuid primary key,
  colegio_id uuid not null references colegio (id),
  seccion_id uuid not null references seccion (id),
  area_id uuid references area (id),
  docente_id uuid not null references usuario (id),
  fecha date not null,
  modo text not null check (modo in ('manual','carne','qr')),
  secreto_qr text,               -- luego pasa a una tabla propia visible solo para su docente
  estado text not null default 'abierta' check (estado in ('abierta','confirmada'))
);

create table asistencia (
  id uuid primary key,
  colegio_id uuid not null references colegio (id),
  sesion_id uuid not null references asistencia_sesion (id),
  estudiante_id uuid not null references estudiante (id),
  estado text not null check (estado in ('P','T','F','J')),
  origen text not null check (origen in ('manual','carne','qr')),
  marcado_en timestamptz,
  token_qr text,
  por_revisar boolean not null default false,
  unique (sesion_id, estudiante_id)
);

-- ---------------------------------------------------------------- seguimiento
create table observacion (
  id uuid primary key,
  colegio_id uuid not null references colegio (id),
  estudiante_id uuid not null references estudiante (id),
  autor_id uuid not null references usuario (id),
  fecha date not null,
  tipo text not null check (tipo in ('academica','conducta','felicitacion','otra')),
  texto text not null
);

create table sesion_tutoria (
  id uuid primary key,
  colegio_id uuid not null references colegio (id),
  seccion_id uuid not null references seccion (id),
  tutor_id uuid not null references usuario (id),
  fecha date not null,
  tema text not null,
  acuerdos text
);

create table incidencia (
  id uuid primary key,
  colegio_id uuid not null references colegio (id),
  estudiante_id uuid references estudiante (id),
  reportado_por uuid not null references usuario (id),
  fecha date not null,
  tipo text not null,
  descripcion text not null,
  estado text not null default 'abierta' check (estado in ('abierta','en_seguimiento','cerrada')),
  codigo_siseve text
);

create table comunicado (
  id uuid primary key,
  colegio_id uuid not null references colegio (id),
  autor_id uuid not null references usuario (id),
  titulo text not null,
  cuerpo text not null,
  destino text not null check (destino in ('todos','seccion')),
  seccion_id uuid references seccion (id),
  fecha date not null
);

create table observacion_monitoreo (
  id uuid primary key,
  colegio_id uuid not null references colegio (id),
  autor_id uuid not null references usuario (id),
  fecha date not null,
  texto text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','atendida'))
);

-- ---------------------------------------------------------------- campos comunes
-- Lista única de tablas sincronizables (debe coincidir con TABLAS del cliente).
create or replace function tablas_sync() returns text[]
language sql immutable as $$
  select array[
    'colegio','usuario','anio_escolar','periodo','grado','seccion','area','competencia',
    'docente_asignacion','estudiante','matricula','apoderado','estudiante_apoderado',
    'calificacion','asistencia_sesion','asistencia','observacion','sesion_tutoria',
    'incidencia','comunicado','observacion_monitoreo'
  ]
$$;

do $$
declare t text;
begin
  foreach t in array tablas_sync() loop
    perform preparar_tabla_sync(t::regclass);
    execute format('create index if not exists %I on %I (colegio_id)', t || '_colegio_idx', t);
  end loop;
end $$;

-- Índices que dependen de la columna eliminado.
create unique index anio_escolar_unico on anio_escolar (colegio_id, anio) where not eliminado;
create unique index matricula_unica on matricula (anio_id, estudiante_id) where not eliminado;
