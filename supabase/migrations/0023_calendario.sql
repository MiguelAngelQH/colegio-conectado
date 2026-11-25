-- Calendario escolar: exámenes, reuniones, actividades y días sin clases.
-- La dirección publica para todo el colegio o una sección; el docente, para sus secciones.
create table evento (
  id uuid primary key,
  colegio_id uuid not null references colegio (id),
  autor_id uuid not null references usuario (id),
  seccion_id uuid references seccion (id),          -- null = todo el colegio
  tipo text not null check (tipo in ('examen','reunion','actividad','sin_clases','otro')),
  titulo text not null check (length(btrim(titulo)) between 1 and 200),
  descripcion text,
  fecha date not null,
  fecha_fin date,
  hora text check (hora is null or hora ~ '^\d{2}:\d{2}$'),
  check (fecha_fin is null or fecha_fin >= fecha)
);
select preparar_tabla_sync('evento'::regclass);
create index evento_fecha on evento (colegio_id, fecha);
alter table evento enable row level security;
grant select, insert, update on evento to authenticated;

create policy leer on evento for select to authenticated using (
  del_colegio(colegio_id) and (
    seccion_id is null or es_personal() or tengo_rol('ugel') or seccion_id in (select mis_secciones_familia())
  )
);
create policy crear on evento for insert to authenticated with check (
  del_colegio(colegio_id) and autor_id = auth.uid() and (
    es_gestion() or (seccion_id is not null and seccion_id in (select mis_secciones()))
  )
);
create policy editar on evento for update to authenticated
  using (del_colegio(colegio_id) and (es_gestion() or autor_id = auth.uid()))
  with check (del_colegio(colegio_id) and (es_gestion() or (autor_id = auth.uid() and seccion_id is not null and seccion_id in (select mis_secciones()))));
create trigger auditoria after insert or update on evento for each row execute function registrar_auditoria();

create or replace function tablas_sync() returns text[]
language sql immutable as $$
  select array[
    'colegio','usuario','anio_escolar','periodo','grado','seccion','area','competencia',
    'docente_asignacion','estudiante','matricula','apoderado','estudiante_apoderado',
    'calificacion','asistencia_sesion','asistencia_secreto','asistencia','justificacion','observacion','sesion_tutoria',
    'entrevista','incidencia','incidencia_accion','comunicado','comunicado_lectura','evidencia',
    'observacion_monitoreo','solicitud_tutoria','informe_tutor','lista_cotejo','horario_clase','tarea','evento'
  ]
$$;
