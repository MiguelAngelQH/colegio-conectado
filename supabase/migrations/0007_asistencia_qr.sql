-- Asistencia con QR dinámico.
-- Protocolo descrito en app/src/dominio/qr.ts (la lógica de evaluarMarca se replica aquí).

-- ---------------------------------------------------------------- secreto aparte
-- El secreto del QR no puede viajar en asistencia_sesion: esa tabla la leen tutores, auxiliares
-- y la UGEL. Va en su propia tabla, visible solo para quien abrió la sesión y la dirección.
create table asistencia_secreto (
  id uuid primary key,                 -- igual al id de la sesión
  colegio_id uuid not null references colegio (id),
  sesion_id uuid not null unique references asistencia_sesion (id),
  docente_id uuid not null references usuario (id),
  secreto text not null check (length(secreto) >= 16)
);
select preparar_tabla_sync('asistencia_secreto'::regclass);
create index asistencia_secreto_colegio_idx on asistencia_secreto (colegio_id);

alter table asistencia_sesion drop column if exists secreto_qr;
-- Hora (ms, reloj del equipo del docente corregido con la hora del servidor) en que se abrió.
alter table asistencia_sesion add column if not exists abierta_en bigint;

alter table asistencia add column if not exists dispositivo_id text;
alter table asistencia add column if not exists motivo_revision text;

create or replace function tablas_sync() returns text[]
language sql immutable as $$
  select array[
    'colegio','usuario','anio_escolar','periodo','grado','seccion','area','competencia',
    'docente_asignacion','estudiante','matricula','apoderado','estudiante_apoderado',
    'calificacion','asistencia_sesion','asistencia_secreto','asistencia','observacion','sesion_tutoria',
    'incidencia','comunicado','observacion_monitoreo'
  ]
$$;

grant select, insert, update on asistencia_secreto to authenticated;
alter table asistencia_secreto enable row level security;
create policy leer on asistencia_secreto for select to authenticated
  using (del_colegio(colegio_id) and (docente_id = auth.uid() or es_gestion()));
create policy crear on asistencia_secreto for insert to authenticated
  with check (del_colegio(colegio_id) and docente_id = auth.uid());
create policy editar on asistencia_secreto for update to authenticated
  using (del_colegio(colegio_id) and docente_id = auth.uid()) with check (del_colegio(colegio_id) and docente_id = auth.uid());

-- ---------------------------------------------------------------- HMAC-SHA256
-- Implementación propia (RFC 2104) sobre sha256() de Postgres, para no depender de pgcrypto.
create or replace function hmac_sha256(clave bytea, mensaje bytea) returns bytea
language plpgsql immutable strict as $$
declare
  k bytea;
  ipad bytea;
  opad bytea;
  i int;
begin
  if length(clave) > 64 then clave := sha256(clave); end if;
  k := clave || decode(repeat('00', 64 - length(clave)), 'hex');
  ipad := k;
  opad := k;
  for i in 0..63 loop
    ipad := set_byte(ipad, i, get_byte(k, i) # 54);  -- 0x36
    opad := set_byte(opad, i, get_byte(k, i) # 92);  -- 0x5c
  end loop;
  return sha256(opad || sha256(ipad || mensaje));
end $$;

-- Firma del QR: base64url de los primeros 16 bytes del HMAC (igual que en qr.ts).
create or replace function firma_qr(secreto text, sesion uuid, ventana bigint) returns text
language sql immutable as $$
  select rtrim(translate(encode(substring(
    hmac_sha256(convert_to(secreto, 'UTF8'), convert_to(sesion::text || '.' || ventana::text, 'UTF8')) from 1 for 16
  ), 'base64'), '+/', '-_'), '=')
$$;

-- ---------------------------------------------------------------- marca del estudiante
-- El estudiante solo puede crear SU marca, con origen QR. El trigger decide si es válida.
create policy marcar_qr on asistencia for insert to authenticated with check (
  del_colegio(colegio_id) and origen = 'qr' and tengo_rol('estudiante')
  and estudiante_id in (select id from estudiante where usuario_id = auth.uid() and not eliminado)
);

create or replace function validar_marca_qr() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  partes text[];
  v_ventana bigint;
  v_secreto text;
  v_sesion record;
  v_hora_codigo bigint;
  v_marcado bigint;
  v_habitual text;
  v_otro boolean;
  motivos text[] := '{}';
begin
  -- Solo aplica cuando quien escribe no es personal del colegio (es decir, el estudiante).
  if new.origen <> 'qr' or es_personal() or auth.uid() is null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'Tu asistencia de esta clase ya fue registrada' using errcode = 'P0001';
  end if;

  partes := string_to_array(coalesce(new.token_qr, ''), '.');
  if array_length(partes, 1) <> 4 or partes[1] <> 'CC1' or partes[2] <> new.sesion_id::text or partes[3] !~ '^\d{1,12}$' then
    raise exception 'El código no corresponde a esta clase' using errcode = 'P0001';
  end if;
  v_ventana := partes[3]::bigint;

  select s.secreto into v_secreto from asistencia_secreto s where s.sesion_id = new.sesion_id and not s.eliminado;
  if v_secreto is null then
    -- La sesión del docente aún no llegó al servidor: se reintenta más tarde.
    raise exception 'La clase todavía no se sincroniza' using errcode = '23503';
  end if;
  if firma_qr(v_secreto, new.sesion_id, v_ventana) <> partes[4] then
    raise exception 'Código QR no válido' using errcode = 'P0001';
  end if;

  select * into v_sesion from asistencia_sesion where id = new.sesion_id;
  if not exists (
    select 1 from matricula m
    where m.estudiante_id = new.estudiante_id and m.seccion_id = v_sesion.seccion_id and not m.eliminado and m.estado = 'matriculado'
  ) then
    raise exception 'No estás matriculado en esta sección' using errcode = 'P0001';
  end if;

  v_hora_codigo := v_ventana * 15000;
  if v_sesion.abierta_en is not null and (v_hora_codigo < v_sesion.abierta_en - 60000 or v_hora_codigo > v_sesion.abierta_en + 4 * 3600000) then
    raise exception 'El código QR está vencido' using errcode = 'P0001';
  end if;

  v_marcado := (extract(epoch from new.marcado_en) * 1000)::bigint;
  if v_marcado is null or abs(v_marcado - v_hora_codigo) > 60000 then
    motivos := array_append(motivos, 'Escaneó el código fuera de tiempo'::text);
  end if;

  select exists (
    select 1 from asistencia a
    where a.sesion_id = new.sesion_id and a.dispositivo_id = new.dispositivo_id and a.estudiante_id <> new.estudiante_id
  ) into v_otro;
  if new.dispositivo_id is not null and v_otro then
    motivos := array_append(motivos, 'Este celular ya marcó por otro estudiante'::text);
  else
    select a.dispositivo_id into v_habitual from asistencia a
    where a.estudiante_id = new.estudiante_id and a.origen = 'qr' and a.dispositivo_id is not null and not a.por_revisar and not a.eliminado
    order by a.marcado_en desc limit 1;
    if new.dispositivo_id is not null and v_habitual is not null and v_habitual <> new.dispositivo_id then
      motivos := array_append(motivos, 'Usó un celular distinto al habitual'::text);
    end if;
  end if;

  new.estado := 'P';
  new.por_revisar := array_length(motivos, 1) is not null;
  new.motivo_revision := nullif(array_to_string(motivos, '; '), '');
  return new;
end $$;

create trigger validar_marca_qr before insert or update on asistencia
for each row execute function validar_marca_qr();

-- ---------------------------------------------------------------- hora del servidor en el pull
-- Se agrega "hora" (ms) a la respuesta para que cada equipo corrija su reloj.
create or replace function sync_pull_con_hora(desde text default null, limite int default 1000) returns jsonb
language sql security invoker stable set search_path = public as $$
  select sync_pull(desde, limite) || jsonb_build_object('hora', (extract(epoch from clock_timestamp()) * 1000)::bigint)
$$;
revoke all on function sync_pull_con_hora(text, int) from public, anon;
grant execute on function sync_pull_con_hora(text, int) to authenticated;
