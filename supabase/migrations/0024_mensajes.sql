-- Mensajes directos entre el personal (docente, tutor, dirección) y la familia de un estudiante.
-- Una conversación = (estudiante, persona del personal). Solo la leen sus participantes.

create or replace function soy_apoderado_de(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from estudiante_apoderado ea join apoderado a on a.id = ea.apoderado_id
    where ea.estudiante_id = e and a.usuario_id = auth.uid() and not ea.eliminado and not a.eliminado
  )
$$;

create table mensaje (
  id uuid primary key,
  colegio_id uuid not null references colegio (id),
  estudiante_id uuid not null references estudiante (id),
  personal_id uuid not null references usuario (id),   -- el docente/tutor/director de la conversación
  autor_id uuid not null references usuario (id),
  texto text not null check (length(btrim(texto)) between 1 and 2000),
  enviado_en timestamptz not null default now(),
  leido_en timestamptz
);
select preparar_tabla_sync('mensaje'::regclass);
create index mensaje_conversacion on mensaje (estudiante_id, personal_id);
create index mensaje_colegio_idx on mensaje (colegio_id);
alter table mensaje enable row level security;
grant select, insert, update on mensaje to authenticated;

create policy leer on mensaje for select to authenticated using (
  del_colegio(colegio_id) and (personal_id = auth.uid() or soy_apoderado_de(estudiante_id))
);
create policy crear on mensaje for insert to authenticated with check (
  del_colegio(colegio_id) and autor_id = auth.uid() and leido_en is null and (
    (personal_id = auth.uid() and es_personal() and estudiante_id in (select estudiantes_visibles()))
    or soy_apoderado_de(estudiante_id)
  )
);
-- Solo se actualiza para marcarlo como leído (lo marca quien lo recibe).
create policy editar on mensaje for update to authenticated
  using (del_colegio(colegio_id) and autor_id <> auth.uid() and (personal_id = auth.uid() or soy_apoderado_de(estudiante_id)))
  with check (del_colegio(colegio_id));

create or replace function proteger_mensaje() returns trigger
language plpgsql as $$
begin
  if new.texto <> old.texto or new.autor_id <> old.autor_id or new.estudiante_id <> old.estudiante_id or new.personal_id <> old.personal_id or new.enviado_en <> old.enviado_en then
    raise exception 'Un mensaje enviado no se puede modificar' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger proteger_mensaje before update on mensaje for each row execute function proteger_mensaje();
create trigger auditoria after insert or update on mensaje for each row execute function registrar_auditoria();

create or replace function tablas_sync() returns text[]
language sql immutable as $$
  select array[
    'colegio','usuario','anio_escolar','periodo','grado','seccion','area','competencia',
    'docente_asignacion','estudiante','matricula','apoderado','estudiante_apoderado',
    'calificacion','asistencia_sesion','asistencia_secreto','asistencia','justificacion','observacion','sesion_tutoria',
    'entrevista','incidencia','incidencia_accion','comunicado','comunicado_lectura','evidencia',
    'observacion_monitoreo','solicitud_tutoria','informe_tutor','lista_cotejo','horario_clase','tarea','evento','mensaje'
  ]
$$;
