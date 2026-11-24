-- Listas de cotejo por sesión de aprendizaje (como las hojas S17..S32 del registro del colegio).
-- Cada sesión tiene criterios de evaluación ligados a una competencia y capacidad; el docente
-- califica a cada estudiante por criterio y luego consolida todo en el registro de notas.
create table lista_cotejo (
  id uuid primary key,
  colegio_id uuid not null references colegio (id),
  seccion_id uuid not null references seccion (id),
  area_id uuid not null references area (id),
  periodo_id uuid not null references periodo (id),
  docente_id uuid not null references usuario (id),
  numero int,
  titulo text not null check (length(btrim(titulo)) between 1 and 300),
  experiencia text,
  evidencia text,
  fecha date not null,
  -- [{"competencia_id": "...", "capacidad": 1, "texto": "..."}]
  criterios jsonb not null default '[]'::jsonb check (jsonb_typeof(criterios) = 'array'),
  -- {"<estudiante_id>": {"0": "A", "1": "B"}}  (índice del criterio -> nivel)
  notas jsonb not null default '{}'::jsonb check (jsonb_typeof(notas) = 'object')
);
select preparar_tabla_sync('lista_cotejo'::regclass);
create index lista_cotejo_curso on lista_cotejo (seccion_id, area_id, periodo_id);
create index lista_cotejo_colegio_idx on lista_cotejo (colegio_id);
alter table lista_cotejo enable row level security;
grant select, insert, update on lista_cotejo to authenticated;

-- La ve la dirección y quien enseña en la sección; la escribe el docente del área (o la dirección).
create policy leer on lista_cotejo for select to authenticated using (
  del_colegio(colegio_id) and (es_gestion() or docente_id = auth.uid() or seccion_id in (select mis_secciones()))
);
create policy crear on lista_cotejo for insert to authenticated with check (
  del_colegio(colegio_id) and docente_id = auth.uid() and (
    es_gestion() or exists (
      select 1 from docente_asignacion da
      where da.docente_id = auth.uid() and da.seccion_id = lista_cotejo.seccion_id and da.area_id = lista_cotejo.area_id and not da.eliminado
    )
  )
);
create policy editar on lista_cotejo for update to authenticated
  using (del_colegio(colegio_id) and (es_gestion() or docente_id = auth.uid()))
  with check (del_colegio(colegio_id) and (es_gestion() or docente_id = auth.uid()));

create trigger auditoria after insert or update on lista_cotejo for each row execute function registrar_auditoria();

create or replace function tablas_sync() returns text[]
language sql immutable as $$
  select array[
    'colegio','usuario','anio_escolar','periodo','grado','seccion','area','competencia',
    'docente_asignacion','estudiante','matricula','apoderado','estudiante_apoderado',
    'calificacion','asistencia_sesion','asistencia_secreto','asistencia','justificacion','observacion','sesion_tutoria',
    'entrevista','incidencia','incidencia_accion','comunicado','comunicado_lectura','evidencia',
    'observacion_monitoreo','solicitud_tutoria','informe_tutor','lista_cotejo'
  ]
$$;
