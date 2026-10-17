-- Tutoría (entrevistas), seguimiento de incidencias, lectura de comunicados y evidencias.

-- ---------------------------------------------------------------- apoyo
-- ¿Es el usuario tutor(a) de la sección donde está matriculado el estudiante?
create or replace function soy_tutor_de(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from matricula m join seccion s on s.id = m.seccion_id
    where m.estudiante_id = e and not m.eliminado and s.tutor_id = auth.uid() and not s.eliminado
  )
$$;

-- ---------------------------------------------------------------- entrevistas
create table entrevista (
  id uuid primary key,
  colegio_id uuid not null references colegio (id),
  estudiante_id uuid not null references estudiante (id),
  apoderado_id uuid references apoderado (id),
  tutor_id uuid not null references usuario (id),
  fecha date not null,
  motivo text not null,
  acuerdos text,
  asistio boolean not null default true
);

-- ---------------------------------------------------------------- seguimiento de incidencias
create table incidencia_accion (
  id uuid primary key,
  colegio_id uuid not null references colegio (id),
  incidencia_id uuid not null references incidencia (id),
  autor_id uuid not null references usuario (id),
  fecha date not null,
  texto text not null
);

alter table incidencia add column if not exists requiere_siseve boolean not null default false;

-- ---------------------------------------------------------------- lectura de comunicados
-- El id lo genera el cliente a partir de (comunicado, usuario): una fila por persona.
create table comunicado_lectura (
  id uuid primary key,
  colegio_id uuid not null references colegio (id),
  comunicado_id uuid not null references comunicado (id),
  usuario_id uuid not null references usuario (id),
  leido_en timestamptz not null,
  unique (comunicado_id, usuario_id)
);

-- ---------------------------------------------------------------- evidencias
-- La fila se sincroniza como cualquier otra; el archivo va a Storage cuando hay conexión
-- (ruta queda null hasta que se sube desde el equipo de quien lo adjuntó).
create table evidencia (
  id uuid primary key,
  colegio_id uuid not null references colegio (id),
  entidad text not null check (entidad in ('observacion','calificacion','incidencia','sesion_tutoria','entrevista')),
  entidad_id uuid not null,
  estudiante_id uuid references estudiante (id),
  autor_id uuid not null references usuario (id),
  nombre text not null,
  tipo text not null,
  bytes int not null check (bytes > 0 and bytes <= 10485760),
  ruta text,
  descripcion text
);
create index evidencia_entidad on evidencia (entidad, entidad_id);

do $$
declare t text;
begin
  foreach t in array array['entrevista','incidencia_accion','comunicado_lectura','evidencia'] loop
    perform preparar_tabla_sync(t::regclass);
    execute format('create index if not exists %I on %I (colegio_id)', t || '_colegio_idx', t);
    execute format('alter table %I enable row level security', t);
    execute format('grant select, insert, update on %I to authenticated', t);
  end loop;
end $$;

create or replace function tablas_sync() returns text[]
language sql immutable as $$
  select array[
    'colegio','usuario','anio_escolar','periodo','grado','seccion','area','competencia',
    'docente_asignacion','estudiante','matricula','apoderado','estudiante_apoderado',
    'calificacion','asistencia_sesion','asistencia_secreto','asistencia','observacion','sesion_tutoria',
    'entrevista','incidencia','incidencia_accion','comunicado','comunicado_lectura','evidencia',
    'observacion_monitoreo'
  ]
$$;

-- ---------------------------------------------------------------- permisos
-- Entrevistas: información sensible de la familia. Solo el tutor del estudiante, la dirección y la UGEL.
create policy leer on entrevista for select to authenticated
  using (del_colegio(colegio_id) and (es_gestion() or tengo_rol('ugel') or soy_tutor_de(estudiante_id)));
create policy crear on entrevista for insert to authenticated
  with check (del_colegio(colegio_id) and tutor_id = auth.uid() and (es_gestion() or soy_tutor_de(estudiante_id)));
create policy editar on entrevista for update to authenticated
  using (del_colegio(colegio_id) and (es_gestion() or tutor_id = auth.uid()))
  with check (del_colegio(colegio_id) and (es_gestion() or tutor_id = auth.uid()));

-- Acciones de seguimiento: quien puede ver la incidencia ve su seguimiento (la subconsulta respeta RLS).
create policy leer on incidencia_accion for select to authenticated
  using (del_colegio(colegio_id) and exists (select 1 from incidencia i where i.id = incidencia_id));
create policy crear on incidencia_accion for insert to authenticated
  with check (del_colegio(colegio_id) and autor_id = auth.uid() and es_personal()
              and exists (select 1 from incidencia i where i.id = incidencia_id));
create policy editar on incidencia_accion for update to authenticated
  using (del_colegio(colegio_id) and autor_id = auth.uid()) with check (del_colegio(colegio_id) and autor_id = auth.uid());

-- Lecturas: cada uno registra la suya; el autor del comunicado y la dirección ven quién leyó.
create policy leer on comunicado_lectura for select to authenticated using (
  del_colegio(colegio_id) and (
    usuario_id = auth.uid() or es_gestion()
    or exists (select 1 from comunicado c where c.id = comunicado_id and c.autor_id = auth.uid())
  )
);
create policy crear on comunicado_lectura for insert to authenticated
  with check (del_colegio(colegio_id) and usuario_id = auth.uid() and exists (select 1 from comunicado c where c.id = comunicado_id));
create policy editar on comunicado_lectura for update to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- Evidencias: el personal y la UGEL; la familia solo las académicas de su hijo (no las de convivencia).
create policy leer on evidencia for select to authenticated using (
  del_colegio(colegio_id) and (
    (es_personal() and (estudiante_id is null or puedo_ver_estudiante(estudiante_id)))
    or tengo_rol('ugel')
    or (estudiante_id in (select mis_estudiantes()) and entidad in ('observacion','calificacion'))
  )
);
create policy crear on evidencia for insert to authenticated
  with check (del_colegio(colegio_id) and autor_id = auth.uid() and es_personal());
create policy editar on evidencia for update to authenticated
  using (del_colegio(colegio_id) and autor_id = auth.uid()) with check (del_colegio(colegio_id) and autor_id = auth.uid());

-- ---------------------------------------------------------------- almacenamiento (Supabase Storage)
-- Solo existe en Supabase (no en las pruebas locales). Bucket privado; ruta = <colegio_id>/<evidencia_id>.<ext>.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('evidencias', 'evidencias', false, 10485760)
    on conflict (id) do nothing;

    execute $p$
      create policy evidencias_subir on storage.objects for insert to authenticated
      with check (bucket_id = 'evidencias' and (storage.foldername(name))[1] = mi_colegio()::text and es_personal())
    $p$;
    execute $p$
      create policy evidencias_reemplazar on storage.objects for update to authenticated
      using (bucket_id = 'evidencias' and owner = auth.uid())
    $p$;
    -- Se puede descargar el archivo si se puede ver la fila de evidencia que lo referencia.
    execute $p$
      create policy evidencias_leer on storage.objects for select to authenticated
      using (bucket_id = 'evidencias' and exists (select 1 from public.evidencia e where e.ruta = name))
    $p$;
  end if;
end $$;
