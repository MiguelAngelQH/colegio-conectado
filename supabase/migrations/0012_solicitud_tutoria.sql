-- Pedidos de ayuda al tutor. El estudiante o su apoderado pide conversar; el tutor de la sección responde,
-- agenda una cita y, al atender, registra la entrevista. Mismas reglas que app/src/dominio/solicitudes.ts.
--
-- Privacidad: el pedido lo ven quien lo hizo y el tutor. La familia NO ve lo que pidió el estudiante (el
-- problema puede ser familiar). Si el motivo es acoso entre compañeros, también lo ve la dirección
-- (protocolo de convivencia y reporte al SíseVe).

create table solicitud_tutoria (
  id uuid primary key,
  colegio_id uuid not null references colegio (id),
  estudiante_id uuid not null references estudiante (id),
  solicitante_id uuid not null references usuario (id),
  tutor_id uuid references usuario (id),
  motivo text not null check (motivo in ('estudios','personal','companeros','familia','vocacional','otro')),
  mensaje text not null check (length(btrim(mensaje)) between 1 and 1000),
  modalidad text not null default 'presencial' check (modalidad in ('presencial','app')),
  estado text not null default 'enviada' check (estado in ('enviada','vista','agendada','atendida','cancelada')),
  cita timestamptz,
  respuesta text,
  entrevista_id uuid references entrevista (id),
  creada_en timestamptz not null default now()
);
select preparar_tabla_sync('solicitud_tutoria'::regclass);
create index solicitud_tutoria_colegio_idx on solicitud_tutoria (colegio_id);
create index solicitud_tutoria_tutor_idx on solicitud_tutoria (tutor_id);
create index solicitud_tutoria_solicitante_idx on solicitud_tutoria (solicitante_id);
alter table solicitud_tutoria enable row level security;
grant select, insert, update on solicitud_tutoria to authenticated;

create or replace function tablas_sync() returns text[]
language sql immutable as $$
  select array[
    'colegio','usuario','anio_escolar','periodo','grado','seccion','area','competencia',
    'docente_asignacion','estudiante','matricula','apoderado','estudiante_apoderado',
    'calificacion','asistencia_sesion','asistencia_secreto','asistencia','justificacion','observacion','sesion_tutoria',
    'entrevista','incidencia','incidencia_accion','comunicado','comunicado_lectura','evidencia',
    'observacion_monitoreo','solicitud_tutoria'
  ]
$$;

create policy leer on solicitud_tutoria for select to authenticated using (
  del_colegio(colegio_id) and (solicitante_id = auth.uid() or tutor_id = auth.uid() or (motivo = 'companeros' and es_gestion()))
);
create policy crear on solicitud_tutoria for insert to authenticated with check (
  del_colegio(colegio_id) and solicitante_id = auth.uid() and estudiante_id in (select mis_estudiantes())
);
create policy editar on solicitud_tutoria for update to authenticated
  using (del_colegio(colegio_id) and (solicitante_id = auth.uid() or tutor_id = auth.uid() or (motivo = 'companeros' and es_gestion())))
  with check (del_colegio(colegio_id) and (solicitante_id = auth.uid() or tutor_id = auth.uid() or (motivo = 'companeros' and es_gestion())));

-- Tutor de la sección del estudiante en el año activo.
create or replace function tutor_del_estudiante(e uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select s.tutor_id
  from matricula m join seccion s on s.id = m.seccion_id join anio_escolar a on a.id = m.anio_id
  where m.estudiante_id = e and m.estado = 'matriculado' and not m.eliminado and not s.eliminado and a.activo
  limit 1
$$;

create or replace function validar_solicitud_tutoria() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  abiertas int;
  atiende boolean;
begin
  if auth.uid() is null then return new; end if; -- administración (clave de servicio)

  if tg_op = 'INSERT' then
    new.tutor_id := tutor_del_estudiante(new.estudiante_id);
    if new.tutor_id is null then
      raise exception 'Tu sección aún no tiene tutor asignado. Comunícate con la dirección.' using errcode = 'P0001';
    end if;
    select count(*) into abiertas from solicitud_tutoria
      where solicitante_id = new.solicitante_id and estado in ('enviada','vista','agendada') and not eliminado;
    if abiertas >= 2 then
      raise exception 'Ya tienes 2 pedidos abiertos. Espera a que tu tutor los atienda o cancela uno.' using errcode = 'P0001';
    end if;
    new.mensaje := btrim(new.mensaje);
    new.estado := 'enviada';
    new.cita := null;
    new.respuesta := null;
    new.entrevista_id := null;
    new.eliminado := false;
    new.creada_en := least(coalesce(new.creada_en, now()), now());
    return new;
  end if;

  if (new.estudiante_id, new.solicitante_id, new.tutor_id, new.motivo, new.mensaje, new.modalidad, new.creada_en)
     is distinct from (old.estudiante_id, old.solicitante_id, old.tutor_id, old.motivo, old.mensaje, old.modalidad, old.creada_en) then
    raise exception 'El pedido ya enviado no se puede modificar.' using errcode = 'P0001';
  end if;
  if new.eliminado is distinct from old.eliminado then
    raise exception 'Los pedidos no se borran: se cancelan o se atienden.' using errcode = 'P0001';
  end if;
  if old.estado in ('atendida','cancelada') then
    if (new.estado, new.cita, new.respuesta, new.entrevista_id) is distinct from (old.estado, old.cita, old.respuesta, old.entrevista_id) then
      raise exception 'El pedido ya está cerrado.' using errcode = 'P0001';
    end if;
    return new;
  end if;

  atiende := old.tutor_id = auth.uid() or (old.motivo = 'companeros' and es_gestion());
  if atiende then
    if new.estado = 'enviada' and old.estado <> 'enviada' then
      raise exception 'Estado no válido.' using errcode = 'P0001';
    end if;
    if new.estado = 'agendada' and new.cita is null then
      raise exception 'Indique la fecha y hora de la cita.' using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- Quien pidió solo puede cancelar.
  if new.estado <> 'cancelada' or (new.cita, new.respuesta, new.entrevista_id) is distinct from (old.cita, old.respuesta, old.entrevista_id) then
    raise exception 'Solo puedes cancelar tu pedido; el tutor es quien responde.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger validar_solicitud_tutoria before insert or update on solicitud_tutoria
for each row execute function validar_solicitud_tutoria();

create trigger auditoria after insert or update on solicitud_tutoria for each row execute function registrar_auditoria();
