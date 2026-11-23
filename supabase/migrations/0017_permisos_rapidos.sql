-- Lectura rápida con muchos datos: las políticas llamaban a puedo_ver_estudiante() fila por fila
-- (unos 2 ms cada una) y la sincronización de miles de notas y asistencias superaba el tiempo
-- límite. Ahora la lista de estudiantes visibles se calcula una sola vez por consulta.
-- Las reglas de acceso son las mismas.

create or replace function estudiantes_visibles() returns setof uuid
language sql stable security definer set search_path = public as $$
  select e.id from estudiante e
  where e.colegio_id = mi_colegio() and tengo_rol('director','subdirector','auxiliar','ugel')
  union
  select mis_estudiantes()
  union
  select m.estudiante_id from matricula m
  where not m.eliminado and m.seccion_id in (select mis_secciones())
$$;

-- Toda política de lectura que use puedo_ver_estudiante(x) pasa a "x in (select estudiantes_visibles())".
do $$
declare
  p record;
  nueva text;
begin
  for p in
    select schemaname, tablename, policyname, qual from pg_policies
    where schemaname = 'public' and cmd = 'SELECT' and qual like '%puedo_ver_estudiante(%'
      and tablename <> 'asistencia_sesion'
  loop
    nueva := regexp_replace(p.qual, 'puedo_ver_estudiante\(([a-z_.]+)\)', '(\1 in (select estudiantes_visibles()))', 'g');
    execute format('alter policy %I on %I.%I using (%s)', p.policyname, p.schemaname, p.tablename, nueva);
  end loop;
end $$;

create index if not exists asistencia_sesion_estudiante on asistencia (sesion_id, estudiante_id);

drop policy if exists leer on asistencia_sesion;
create policy leer on asistencia_sesion for select to authenticated using (
  del_colegio(colegio_id) and (
    es_gestion() or tengo_rol('auxiliar','ugel') or seccion_id in (select mis_secciones())
    or seccion_id in (select mis_secciones_de_estudiante())
    or id in (select a.sesion_id from asistencia a where a.estudiante_id in (select estudiantes_visibles()))
  )
);
