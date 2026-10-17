-- Permisos por rol con Row Level Security.
-- Principio: cada persona solo puede leer y escribir lo que le corresponde. La app no decide
-- permisos: aunque alguien modifique el cliente, la base de datos no le devuelve ni le acepta
-- más de lo permitido. No hay DELETE: se usa borrado lógico (eliminado = true).

-- ---------------------------------------------------------------- funciones de apoyo
-- security definer: leen las tablas de permisos sin quedar sujetas a RLS (evita recursión).

create or replace function mi_colegio() returns uuid
language sql stable security definer set search_path = public as $$
  select colegio_id from usuario where id = auth.uid() and activo and not eliminado
$$;

create or replace function tengo_rol(variadic r text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select roles && r from usuario where id = auth.uid() and activo and not eliminado), false)
$$;

create or replace function es_gestion() returns boolean
language sql stable as $$ select tengo_rol('director','subdirector') $$;

create or replace function es_personal() returns boolean
language sql stable as $$ select tengo_rol('director','subdirector','docente','tutor','auxiliar') $$;

-- Secciones en las que el usuario enseña o es tutor.
create or replace function mis_secciones() returns setof uuid
language sql stable security definer set search_path = public as $$
  select seccion_id from docente_asignacion where docente_id = auth.uid() and not eliminado
  union
  select id from seccion where tutor_id = auth.uid() and not eliminado
$$;

-- Estudiantes propios: el estudiante mismo o los hijos del apoderado.
create or replace function mis_estudiantes() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from estudiante where usuario_id = auth.uid() and not eliminado
  union
  select ea.estudiante_id
  from estudiante_apoderado ea join apoderado a on a.id = ea.apoderado_id
  where a.usuario_id = auth.uid() and not ea.eliminado and not a.eliminado
$$;

-- ¿Puede el usuario ver los datos de este estudiante?
create or replace function puedo_ver_estudiante(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    tengo_rol('director','subdirector','auxiliar','ugel')
    or e in (select mis_estudiantes())
    or exists (
      select 1 from matricula m
      where m.estudiante_id = e and not m.eliminado and m.seccion_id in (select mis_secciones())
    )
$$;

-- ¿Puede el docente calificar esta competencia en esta sección?
create or replace function puedo_calificar(s uuid, c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select es_gestion() or exists (
    select 1 from docente_asignacion da join competencia co on co.area_id = da.area_id
    where da.docente_id = auth.uid() and da.seccion_id = s and co.id = c and not da.eliminado
  )
$$;

-- ---------------------------------------------------------------- privilegios base
revoke all on all tables in schema public from anon;
grant select, insert, update on all tables in schema public to authenticated;
revoke insert, update on auditoria from authenticated;

do $$
declare t text;
begin
  foreach t in array tablas_sync() || array['auditoria'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Atajo: misma institución.
create or replace function del_colegio(c uuid) returns boolean
language sql stable as $$ select c = mi_colegio() $$;

-- ---------------------------------------------------------------- tablas de configuración
-- Todo el colegio las lee; solo dirección las escribe.
do $$
declare t text;
begin
  foreach t in array array['anio_escolar','periodo','grado','seccion','docente_asignacion'] loop
    execute format('create policy leer on %I for select to authenticated using (del_colegio(colegio_id))', t);
    execute format('create policy crear on %I for insert to authenticated with check (del_colegio(colegio_id) and es_gestion())', t);
    execute format('create policy editar on %I for update to authenticated using (del_colegio(colegio_id) and es_gestion()) with check (del_colegio(colegio_id) and es_gestion())', t);
  end loop;
end $$;

create policy leer on colegio for select to authenticated using (id = mi_colegio());
create policy editar on colegio for update to authenticated
  using (id = mi_colegio() and es_gestion()) with check (id = mi_colegio() and es_gestion());

-- Catálogo CNEB (colegio_id null) visible para todos; talleres propios solo del colegio.
do $$
declare t text;
begin
  foreach t in array array['area','competencia'] loop
    execute format('create policy leer on %I for select to authenticated using (colegio_id is null or del_colegio(colegio_id))', t);
    execute format('create policy crear on %I for insert to authenticated with check (del_colegio(colegio_id) and es_gestion())', t);
    execute format('create policy editar on %I for update to authenticated using (del_colegio(colegio_id) and es_gestion()) with check (del_colegio(colegio_id) and es_gestion())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- usuarios
-- Cada uno ve su fila; el personal y la UGEL ven a todos los del colegio; estudiantes y
-- apoderados ven solo al personal (nombres de docentes), no a otras familias.
create policy leer on usuario for select to authenticated using (
  id = auth.uid()
  or (del_colegio(colegio_id) and (es_personal() or tengo_rol('ugel')
      or roles && array['director','subdirector','docente','tutor','auxiliar']))
);
create policy crear on usuario for insert to authenticated with check (del_colegio(colegio_id) and es_gestion());
create policy editar on usuario for update to authenticated
  using (del_colegio(colegio_id) and es_gestion()) with check (del_colegio(colegio_id) and es_gestion());

-- ---------------------------------------------------------------- estudiantes y familias
create policy leer on estudiante for select to authenticated using (del_colegio(colegio_id) and puedo_ver_estudiante(id));
create policy leer on matricula for select to authenticated using (del_colegio(colegio_id) and puedo_ver_estudiante(estudiante_id));
create policy leer on estudiante_apoderado for select to authenticated using (del_colegio(colegio_id) and puedo_ver_estudiante(estudiante_id));
create policy leer on apoderado for select to authenticated using (
  del_colegio(colegio_id) and (usuario_id = auth.uid() or es_personal() or tengo_rol('ugel'))
);
do $$
declare t text;
begin
  foreach t in array array['estudiante','matricula','apoderado','estudiante_apoderado'] loop
    execute format('create policy crear on %I for insert to authenticated with check (del_colegio(colegio_id) and es_gestion())', t);
    execute format('create policy editar on %I for update to authenticated using (del_colegio(colegio_id) and es_gestion()) with check (del_colegio(colegio_id) and es_gestion())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- calificaciones
create policy leer on calificacion for select to authenticated
  using (del_colegio(colegio_id) and puedo_ver_estudiante(estudiante_id));
create policy crear on calificacion for insert to authenticated
  with check (del_colegio(colegio_id) and puedo_calificar(seccion_id, competencia_id));
create policy editar on calificacion for update to authenticated
  using (del_colegio(colegio_id) and puedo_calificar(seccion_id, competencia_id))
  with check (del_colegio(colegio_id) and puedo_calificar(seccion_id, competencia_id));

-- ---------------------------------------------------------------- asistencia
create policy leer on asistencia_sesion for select to authenticated
  using (del_colegio(colegio_id) and (es_gestion() or tengo_rol('auxiliar','ugel') or seccion_id in (select mis_secciones())));
create policy crear on asistencia_sesion for insert to authenticated
  with check (del_colegio(colegio_id) and (es_gestion() or tengo_rol('auxiliar') or seccion_id in (select mis_secciones())));
create policy editar on asistencia_sesion for update to authenticated
  using (del_colegio(colegio_id) and (es_gestion() or docente_id = auth.uid()))
  with check (del_colegio(colegio_id) and (es_gestion() or docente_id = auth.uid()));

create policy leer on asistencia for select to authenticated
  using (del_colegio(colegio_id) and puedo_ver_estudiante(estudiante_id));
create policy crear on asistencia for insert to authenticated
  with check (del_colegio(colegio_id) and es_personal() and puedo_ver_estudiante(estudiante_id));
create policy editar on asistencia for update to authenticated
  using (del_colegio(colegio_id) and es_personal() and puedo_ver_estudiante(estudiante_id))
  with check (del_colegio(colegio_id) and es_personal() and puedo_ver_estudiante(estudiante_id));
-- La marca del estudiante por QR se agrega en la migración de asistencia mediante una función que valida el token.

-- ---------------------------------------------------------------- seguimiento
create policy leer on observacion for select to authenticated
  using (del_colegio(colegio_id) and puedo_ver_estudiante(estudiante_id));
create policy crear on observacion for insert to authenticated
  with check (del_colegio(colegio_id) and es_personal() and autor_id = auth.uid() and puedo_ver_estudiante(estudiante_id));
create policy editar on observacion for update to authenticated
  using (del_colegio(colegio_id) and autor_id = auth.uid()) with check (del_colegio(colegio_id) and autor_id = auth.uid());

create policy leer on sesion_tutoria for select to authenticated
  using (del_colegio(colegio_id) and (es_gestion() or tengo_rol('ugel') or seccion_id in (select mis_secciones())));
create policy crear on sesion_tutoria for insert to authenticated
  with check (del_colegio(colegio_id) and (es_gestion() or (tutor_id = auth.uid() and seccion_id in (select mis_secciones()))));
create policy editar on sesion_tutoria for update to authenticated
  using (del_colegio(colegio_id) and (es_gestion() or tutor_id = auth.uid()))
  with check (del_colegio(colegio_id) and (es_gestion() or tutor_id = auth.uid()));

create policy leer on incidencia for select to authenticated
  using (del_colegio(colegio_id) and (tengo_rol('director','subdirector','auxiliar','ugel')
         or reportado_por = auth.uid()
         or (estudiante_id is not null and tengo_rol('tutor') and puedo_ver_estudiante(estudiante_id))));
create policy crear on incidencia for insert to authenticated
  with check (del_colegio(colegio_id) and es_personal() and reportado_por = auth.uid());
create policy editar on incidencia for update to authenticated
  using (del_colegio(colegio_id) and (es_gestion() or reportado_por = auth.uid()))
  with check (del_colegio(colegio_id) and (es_gestion() or reportado_por = auth.uid()));

create policy leer on comunicado for select to authenticated using (
  del_colegio(colegio_id) and (
    destino = 'todos' or es_personal() or tengo_rol('ugel')
    or seccion_id in (select m.seccion_id from matricula m where m.estudiante_id in (select mis_estudiantes()) and not m.eliminado)
  )
);
create policy crear on comunicado for insert to authenticated
  with check (del_colegio(colegio_id) and autor_id = auth.uid()
              and (es_gestion() or (tengo_rol('tutor') and seccion_id in (select mis_secciones()))));
create policy editar on comunicado for update to authenticated
  using (del_colegio(colegio_id) and autor_id = auth.uid()) with check (del_colegio(colegio_id) and autor_id = auth.uid());

create policy leer on observacion_monitoreo for select to authenticated
  using (del_colegio(colegio_id) and tengo_rol('ugel','director','subdirector'));
create policy crear on observacion_monitoreo for insert to authenticated
  with check (del_colegio(colegio_id) and tengo_rol('ugel') and autor_id = auth.uid());
-- El director solo cambia el estado a "atendida"; la UGEL puede corregir su texto.
create policy editar on observacion_monitoreo for update to authenticated
  using (del_colegio(colegio_id) and tengo_rol('ugel','director','subdirector'))
  with check (del_colegio(colegio_id) and tengo_rol('ugel','director','subdirector'));

-- ---------------------------------------------------------------- auditoría
create policy leer on auditoria for select to authenticated
  using (del_colegio(colegio_id) and tengo_rol('director','subdirector','ugel'));
