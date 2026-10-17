-- Portal de estudiantes y familias. Justificación de inasistencias por el apoderado.

create table justificacion (
  id uuid primary key,
  colegio_id uuid not null references colegio (id),
  asistencia_id uuid not null references asistencia (id),
  estudiante_id uuid not null references estudiante (id),
  solicitante_id uuid not null references usuario (id),
  motivo text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','aprobada','rechazada')),
  revisado_por uuid references usuario (id),
  respuesta text
);
select preparar_tabla_sync('justificacion'::regclass);
create index justificacion_colegio_idx on justificacion (colegio_id);
create index justificacion_estudiante_idx on justificacion (estudiante_id);
alter table justificacion enable row level security;
grant select, insert, update on justificacion to authenticated;

create or replace function tablas_sync() returns text[]
language sql immutable as $$
  select array[
    'colegio','usuario','anio_escolar','periodo','grado','seccion','area','competencia',
    'docente_asignacion','estudiante','matricula','apoderado','estudiante_apoderado',
    'calificacion','asistencia_sesion','asistencia_secreto','asistencia','justificacion','observacion','sesion_tutoria',
    'entrevista','incidencia','incidencia_accion','comunicado','comunicado_lectura','evidencia',
    'observacion_monitoreo'
  ]
$$;

-- La familia ve y crea solicitudes de sus hijos; el personal que ve al estudiante las revisa.
create policy leer on justificacion for select to authenticated using (
  del_colegio(colegio_id) and (
    solicitante_id = auth.uid() or estudiante_id in (select mis_estudiantes())
    or (es_personal() and puedo_ver_estudiante(estudiante_id)) or tengo_rol('ugel')
  )
);
create policy crear on justificacion for insert to authenticated with check (
  del_colegio(colegio_id) and solicitante_id = auth.uid() and tengo_rol('apoderado')
  and estudiante_id in (select mis_estudiantes())
  and exists (select 1 from asistencia a where a.id = asistencia_id and a.estudiante_id = justificacion.estudiante_id)
);
create policy editar on justificacion for update to authenticated using (
  del_colegio(colegio_id) and (solicitante_id = auth.uid() or (es_personal() and puedo_ver_estudiante(estudiante_id)))
) with check (
  del_colegio(colegio_id) and (solicitante_id = auth.uid() or (es_personal() and puedo_ver_estudiante(estudiante_id)))
);

-- Solo el personal decide. La familia puede corregir su motivo mientras está pendiente.
create or replace function validar_justificacion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if es_personal() or auth.uid() is null then
    if new.estado <> 'pendiente' and (tg_op = 'INSERT' or old.estado = 'pendiente') then
      new.revisado_por := auth.uid();
    end if;
    return new;
  end if;
  if new.estado <> 'pendiente' or new.revisado_por is not null or new.respuesta is not null then
    raise exception 'Solo el colegio puede aprobar o rechazar una justificación' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and old.estado <> 'pendiente' then
    raise exception 'La justificación ya fue revisada' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger validar_justificacion before insert or update on justificacion
for each row execute function validar_justificacion();

create trigger auditoria after insert or update on justificacion for each row execute function registrar_auditoria();

-- ---------------------------------------------------------------- documentos de la familia
-- El apoderado puede adjuntar un sustento (certificado médico, constancia) a su justificación.
alter table evidencia drop constraint if exists evidencia_entidad_check;
alter table evidencia add constraint evidencia_entidad_check
  check (entidad in ('observacion','calificacion','incidencia','sesion_tutoria','entrevista','justificacion'));

drop policy if exists crear on evidencia;
create policy crear on evidencia for insert to authenticated with check (
  del_colegio(colegio_id) and autor_id = auth.uid() and (
    es_personal()
    or (entidad = 'justificacion' and tengo_rol('apoderado') and estudiante_id in (select mis_estudiantes())
        and exists (select 1 from justificacion j where j.id = entidad_id and j.solicitante_id = auth.uid()))
  )
);
drop policy if exists leer on evidencia;
create policy leer on evidencia for select to authenticated using (
  del_colegio(colegio_id) and (
    (es_personal() and (estudiante_id is null or puedo_ver_estudiante(estudiante_id)))
    or tengo_rol('ugel')
    or (estudiante_id in (select mis_estudiantes()) and entidad in ('observacion','calificacion','justificacion'))
  )
);

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    drop policy if exists evidencias_subir on storage.objects;
    execute $p$
      create policy evidencias_subir on storage.objects for insert to authenticated
      with check (bucket_id = 'evidencias' and (storage.foldername(name))[1] = mi_colegio()::text
                  and (es_personal() or tengo_rol('apoderado')))
    $p$;
  end if;
end $$;
