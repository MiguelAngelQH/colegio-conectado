-- Cierre del año escolar e historial del estudiante.
--
-- 1. Situación final por matrícula (propuesta por la app, confirmada por la dirección) y resumen de asistencia.
-- 2. Año cerrado: ya no se registran notas ni asistencia de ese año.
-- 3. Informe del tutor para el año siguiente: lo lee solo el personal (nunca la familia ni el estudiante).
-- 4. Acceso por año activo: cada docente ve a sus estudiantes de este año, con TODO su historial.
--    El docente del año pasado deja de verlos.

-- ---------------------------------------------------------------- situación final
alter table matricula
  add column situacion_propuesta text check (situacion_propuesta in ('PRO','RR','PER')),
  add column situacion_final text check (situacion_final in ('PRO','RR','PER')),
  add column situacion_motivo text,
  add column asistencia_resumen jsonb,
  add column resultado_recuperacion text check (resultado_recuperacion in ('PRO','PER'));

-- Solo la dirección fija la situación final; si se aparta de la propuesta debe explicar por qué.
create or replace function validar_situacion_final() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if (new.situacion_propuesta, new.situacion_final, new.situacion_motivo, new.asistencia_resumen, new.resultado_recuperacion)
     is distinct from (old.situacion_propuesta, old.situacion_final, old.situacion_motivo, old.asistencia_resumen, old.resultado_recuperacion)
     and not es_gestion() then
    raise exception 'Solo la dirección registra la situación final.' using errcode = 'P0001';
  end if;
  if new.situacion_final is not null and new.situacion_propuesta is not null and new.situacion_final <> new.situacion_propuesta
     and coalesce(btrim(new.situacion_motivo), '') = '' then
    raise exception 'Indique el motivo para cambiar la situación propuesta.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger validar_situacion_final before update on matricula
for each row execute function validar_situacion_final();

-- ---------------------------------------------------------------- año cerrado
alter table anio_escolar add column cerrado_en timestamptz;

create or replace function anio_cerrado(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select cerrado_en is not null from anio_escolar where id = a), false)
$$;

create or replace function proteger_anio_cerrado() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  anio uuid;
begin
  if auth.uid() is null then return new; end if;
  -- Ramas separadas: cada tabla tiene columnas distintas (un CASE evaluaría todas).
  if tg_table_name = 'calificacion' then
    anio := (select p.anio_id from periodo p where p.id = new.periodo_id);
  elsif tg_table_name = 'asistencia_sesion' then
    anio := (select s.anio_id from seccion s where s.id = new.seccion_id);
  elsif tg_table_name = 'asistencia' then
    anio := (select s.anio_id from asistencia_sesion se join seccion s on s.id = se.seccion_id where se.id = new.sesion_id);
  else
    anio := new.anio_id;
  end if;
  if anio_cerrado(anio) then
    raise exception 'El año escolar ya está cerrado: sus registros no se modifican.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger proteger_anio_cerrado before insert or update on calificacion for each row execute function proteger_anio_cerrado();
create trigger proteger_anio_cerrado before insert or update on asistencia_sesion for each row execute function proteger_anio_cerrado();
create trigger proteger_anio_cerrado before insert or update on asistencia for each row execute function proteger_anio_cerrado();

-- ---------------------------------------------------------------- informe del tutor
create table informe_tutor (
  id uuid primary key,
  colegio_id uuid not null references colegio (id),
  estudiante_id uuid not null references estudiante (id),
  anio_id uuid not null references anio_escolar (id),
  tutor_id uuid not null references usuario (id),
  fortalezas text,
  dificultades text,
  recomendaciones text,
  apoyos text,
  intereses text
);
select preparar_tabla_sync('informe_tutor'::regclass);
create unique index informe_tutor_unico on informe_tutor (estudiante_id, anio_id) where not eliminado;
create index informe_tutor_colegio_idx on informe_tutor (colegio_id);
alter table informe_tutor enable row level security;
grant select, insert, update on informe_tutor to authenticated;

-- Solo el personal que hoy ve al estudiante (y la dirección). Ni la familia ni la UGEL: es un documento interno.
create policy leer on informe_tutor for select to authenticated using (
  del_colegio(colegio_id) and es_personal() and puedo_ver_estudiante(estudiante_id)
);
create policy crear on informe_tutor for insert to authenticated with check (
  del_colegio(colegio_id) and (es_gestion() or (tutor_id = auth.uid() and soy_tutor_de(estudiante_id)))
);
create policy editar on informe_tutor for update to authenticated
  using (del_colegio(colegio_id) and (es_gestion() or tutor_id = auth.uid()))
  with check (del_colegio(colegio_id) and (es_gestion() or tutor_id = auth.uid()));

create trigger proteger_anio_cerrado before insert or update on informe_tutor for each row execute function proteger_anio_cerrado();
create trigger auditoria after insert or update on informe_tutor for each row execute function registrar_auditoria();

create or replace function tablas_sync() returns text[]
language sql immutable as $$
  select array[
    'colegio','usuario','anio_escolar','periodo','grado','seccion','area','competencia',
    'docente_asignacion','estudiante','matricula','apoderado','estudiante_apoderado',
    'calificacion','asistencia_sesion','asistencia_secreto','asistencia','justificacion','observacion','sesion_tutoria',
    'entrevista','incidencia','incidencia_accion','comunicado','comunicado_lectura','evidencia',
    'observacion_monitoreo','solicitud_tutoria','informe_tutor'
  ]
$$;

-- ---------------------------------------------------------------- acceso por año activo
create or replace function anio_activo() returns uuid
language sql stable security definer set search_path = public as $$
  select id from anio_escolar where colegio_id = mi_colegio() and activo and not eliminado limit 1
$$;

-- Secciones del año activo en las que el usuario enseña o es tutor.
create or replace function mis_secciones() returns setof uuid
language sql stable security definer set search_path = public as $$
  select da.seccion_id from docente_asignacion da join seccion s on s.id = da.seccion_id
  where da.docente_id = auth.uid() and not da.eliminado and not s.eliminado and s.anio_id = anio_activo()
  union
  select id from seccion where tutor_id = auth.uid() and not eliminado and anio_id = anio_activo()
$$;

-- ¿Es el usuario tutor(a) de la sección del estudiante en el año activo?
create or replace function soy_tutor_de(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from matricula m join seccion s on s.id = m.seccion_id
    where m.estudiante_id = e and not m.eliminado and s.tutor_id = auth.uid() and not s.eliminado and s.anio_id = anio_activo()
  )
$$;

-- El historial: quien tiene hoy al estudiante ve sus sesiones de asistencia de años anteriores
-- (para poder fechar y resumir su asistencia), además de las de sus propias secciones.
drop policy if exists leer on asistencia_sesion;
create policy leer on asistencia_sesion for select to authenticated using (
  del_colegio(colegio_id) and (
    es_gestion() or tengo_rol('auxiliar','ugel') or seccion_id in (select mis_secciones())
    or exists (select 1 from asistencia a where a.sesion_id = asistencia_sesion.id and puedo_ver_estudiante(a.estudiante_id))
  )
);
