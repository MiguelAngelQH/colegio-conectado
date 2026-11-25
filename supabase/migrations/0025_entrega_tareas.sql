-- Entrega de tareas: el estudiante (o su apoderado) envía un comentario y fotos o archivos;
-- el docente ve quién entregó y la revisa con una devolución.
create table tarea_entrega (
  id uuid primary key,
  colegio_id uuid not null references colegio (id),
  tarea_id uuid not null references tarea (id),
  estudiante_id uuid not null references estudiante (id),
  autor_id uuid not null references usuario (id),
  comentario text,
  entregado_en timestamptz not null default now(),
  estado text not null default 'entregada' check (estado in ('entregada','revisada','devuelta')),
  revision text,
  revisado_por uuid references usuario (id)
);
select preparar_tabla_sync('tarea_entrega'::regclass);
create unique index tarea_entrega_unica on tarea_entrega (tarea_id, estudiante_id) where not eliminado;
create index tarea_entrega_colegio_idx on tarea_entrega (colegio_id);
alter table tarea_entrega enable row level security;
grant select, insert, update on tarea_entrega to authenticated;

create policy leer on tarea_entrega for select to authenticated using (
  del_colegio(colegio_id) and (
    estudiante_id in (select mis_estudiantes())
    or (es_personal() and estudiante_id in (select estudiantes_visibles()))
  )
);
create policy crear on tarea_entrega for insert to authenticated with check (
  del_colegio(colegio_id) and autor_id = auth.uid() and estado = 'entregada'
  and estudiante_id in (select mis_estudiantes())
  and exists (select 1 from tarea t where t.id = tarea_id and t.seccion_id in (select mis_secciones_familia()) and not t.eliminado)
);
create policy editar on tarea_entrega for update to authenticated
  using (del_colegio(colegio_id) and (estudiante_id in (select mis_estudiantes()) or (es_personal() and estudiante_id in (select estudiantes_visibles()))))
  with check (del_colegio(colegio_id));

-- La familia solo cambia su comentario (y puede volver a entregar si se la devolvieron);
-- el personal solo revisa (estado y devolución).
create or replace function proteger_entrega() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.tarea_id <> old.tarea_id or new.estudiante_id <> old.estudiante_id then
    raise exception 'La entrega no puede cambiar de tarea ni de estudiante' using errcode = 'P0001';
  end if;
  if es_personal() then
    if new.comentario is distinct from old.comentario or new.entregado_en <> old.entregado_en then
      raise exception 'Solo la familia modifica su entrega' using errcode = 'P0001';
    end if;
    new.revisado_por := auth.uid();
  else
    if new.revision is distinct from old.revision or (new.estado <> old.estado and not (old.estado = 'devuelta' and new.estado = 'entregada')) then
      raise exception 'Solo el docente revisa la entrega' using errcode = 'P0001';
    end if;
    if old.estado = 'revisada' then
      raise exception 'La entrega ya fue revisada' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger proteger_entrega before update on tarea_entrega for each row execute function proteger_entrega();
create trigger auditoria after insert or update on tarea_entrega for each row execute function registrar_auditoria();

-- Fotos y archivos de la entrega: los sube el estudiante o su apoderado (evidencia ligada a la entrega).
alter table evidencia drop constraint if exists evidencia_entidad_check;
alter table evidencia add constraint evidencia_entidad_check
  check (entidad in ('observacion','calificacion','incidencia','sesion_tutoria','entrevista','justificacion','tarea_entrega'));

drop policy if exists crear on evidencia;
create policy crear on evidencia for insert to authenticated with check (
  del_colegio(colegio_id) and autor_id = auth.uid() and (
    es_personal()
    or (entidad = 'justificacion' and tengo_rol('apoderado') and estudiante_id in (select mis_estudiantes())
        and exists (select 1 from justificacion j where j.id = entidad_id and j.solicitante_id = auth.uid()))
    or (entidad = 'tarea_entrega' and estudiante_id in (select mis_estudiantes())
        and exists (select 1 from tarea_entrega te where te.id = entidad_id and te.estudiante_id = evidencia.estudiante_id))
  )
);
drop policy if exists leer on evidencia;
create policy leer on evidencia for select to authenticated using (
  del_colegio(colegio_id) and (
    (es_personal() and (estudiante_id is null or estudiante_id in (select estudiantes_visibles())))
    or tengo_rol('ugel')
    or (estudiante_id in (select mis_estudiantes()) and entidad in ('observacion','calificacion','justificacion','tarea_entrega'))
  )
);

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    drop policy if exists evidencias_subir on storage.objects;
    execute $p$
      create policy evidencias_subir on storage.objects for insert to authenticated
      with check (bucket_id = 'evidencias' and (storage.foldername(name))[1] = mi_colegio()::text
                  and (es_personal() or tengo_rol('apoderado') or tengo_rol('estudiante')))
    $p$;
  end if;
end $$;

create or replace function tablas_sync() returns text[]
language sql immutable as $$
  select array[
    'colegio','usuario','anio_escolar','periodo','grado','seccion','area','competencia',
    'docente_asignacion','estudiante','matricula','apoderado','estudiante_apoderado',
    'calificacion','asistencia_sesion','asistencia_secreto','asistencia','justificacion','observacion','sesion_tutoria',
    'entrevista','incidencia','incidencia_accion','comunicado','comunicado_lectura','evidencia',
    'observacion_monitoreo','solicitud_tutoria','informe_tutor','lista_cotejo','horario_clase','tarea','evento','mensaje','tarea_entrega'
  ]
$$;
