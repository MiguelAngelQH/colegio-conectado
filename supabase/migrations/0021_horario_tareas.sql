-- Horario de clases por sección y tareas que el docente deja a su sección.

-- Secciones de la familia: la del estudiante que ingresa y las de los hijos del apoderado.
create or replace function mis_secciones_familia() returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.seccion_id from matricula m
  where not m.eliminado and m.estado = 'matriculado' and m.estudiante_id in (
    select e.id from estudiante e where e.usuario_id = auth.uid() and not e.eliminado
    union
    select ea.estudiante_id from estudiante_apoderado ea join apoderado a on a.id = ea.apoderado_id
    where a.usuario_id = auth.uid() and not ea.eliminado and not a.eliminado
  )
$$;

-- ---------------------------------------------------------------- horario
create table horario_clase (
  id uuid primary key,
  colegio_id uuid not null references colegio (id),
  seccion_id uuid not null references seccion (id),
  dia int not null check (dia between 1 and 5),
  inicio text not null check (inicio ~ '^\d{2}:\d{2}$'),
  fin text not null check (fin ~ '^\d{2}:\d{2}$'),
  area_id uuid references area (id),
  docente_id uuid references usuario (id),
  detalle text
);
select preparar_tabla_sync('horario_clase'::regclass);
create index horario_clase_seccion on horario_clase (seccion_id);
create index horario_clase_colegio_idx on horario_clase (colegio_id);
alter table horario_clase enable row level security;
grant select, insert, update on horario_clase to authenticated;
-- El horario lo ve todo el colegio; lo arma la dirección.
create policy leer on horario_clase for select to authenticated using (del_colegio(colegio_id));
create policy crear on horario_clase for insert to authenticated with check (del_colegio(colegio_id) and es_gestion());
create policy editar on horario_clase for update to authenticated
  using (del_colegio(colegio_id) and es_gestion()) with check (del_colegio(colegio_id) and es_gestion());
create trigger auditoria after insert or update on horario_clase for each row execute function registrar_auditoria();

-- ---------------------------------------------------------------- tareas
create table tarea (
  id uuid primary key,
  colegio_id uuid not null references colegio (id),
  seccion_id uuid not null references seccion (id),
  area_id uuid not null references area (id),
  docente_id uuid not null references usuario (id),
  titulo text not null check (length(btrim(titulo)) between 1 and 200),
  descripcion text,
  entrega date not null
);
select preparar_tabla_sync('tarea'::regclass);
create index tarea_seccion on tarea (seccion_id, entrega);
create index tarea_colegio_idx on tarea (colegio_id);
alter table tarea enable row level security;
grant select, insert, update on tarea to authenticated;
-- La ve el personal y la familia de la sección; la deja el docente del área (o la dirección).
create policy leer on tarea for select to authenticated using (
  del_colegio(colegio_id) and (es_personal() or seccion_id in (select mis_secciones_familia()))
);
create policy crear on tarea for insert to authenticated with check (
  del_colegio(colegio_id) and docente_id = auth.uid() and (
    es_gestion() or exists (
      select 1 from docente_asignacion da
      where da.docente_id = auth.uid() and da.seccion_id = tarea.seccion_id and da.area_id = tarea.area_id and not da.eliminado
    )
  )
);
create policy editar on tarea for update to authenticated
  using (del_colegio(colegio_id) and (es_gestion() or docente_id = auth.uid()))
  with check (del_colegio(colegio_id) and (es_gestion() or docente_id = auth.uid()));
create trigger auditoria after insert or update on tarea for each row execute function registrar_auditoria();

create or replace function tablas_sync() returns text[]
language sql immutable as $$
  select array[
    'colegio','usuario','anio_escolar','periodo','grado','seccion','area','competencia',
    'docente_asignacion','estudiante','matricula','apoderado','estudiante_apoderado',
    'calificacion','asistencia_sesion','asistencia_secreto','asistencia','justificacion','observacion','sesion_tutoria',
    'entrevista','incidencia','incidencia_accion','comunicado','comunicado_lectura','evidencia',
    'observacion_monitoreo','solicitud_tutoria','informe_tutor','lista_cotejo','horario_clase','tarea'
  ]
$$;
