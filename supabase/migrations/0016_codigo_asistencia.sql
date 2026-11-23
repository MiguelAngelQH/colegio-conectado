-- Código de 6 dígitos para marcar asistencia sin cámara (igual que codigoCorto() en qr.ts).
-- El docente lo muestra bajo el QR; cambia con él cada 15 s.

-- Primeros 4 bytes del HMAC del QR como entero, módulo 1 000 000.
create or replace function codigo_qr(secreto text, sesion uuid, ventana bigint) returns text
language sql immutable as $$
  select lpad((
    (get_byte(h, 0)::bigint << 24) + (get_byte(h, 1) << 16) + (get_byte(h, 2) << 8) + get_byte(h, 3)
  ) % 1000000 || '', 6, '0')
  from (select hmac_sha256(convert_to(secreto, 'UTF8'), convert_to(sesion::text || '.' || ventana::text, 'UTF8')) as h) x
$$;

-- El estudiante ve las sesiones de asistencia de su sección: para escribir el código necesita
-- saber qué clase está abierta (antes solo veía las sesiones en las que ya tenía marca).
create or replace function mis_secciones_de_estudiante() returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.seccion_id from matricula m join estudiante e on e.id = m.estudiante_id
  where e.usuario_id = auth.uid() and not e.eliminado and not m.eliminado and m.estado = 'matriculado'
$$;

drop policy if exists leer on asistencia_sesion;
create policy leer on asistencia_sesion for select to authenticated using (
  del_colegio(colegio_id) and (
    es_gestion() or tengo_rol('auxiliar','ugel') or seccion_id in (select mis_secciones())
    or seccion_id in (select mis_secciones_de_estudiante())
    or exists (select 1 from asistencia a where a.sesion_id = asistencia_sesion.id and puedo_ver_estudiante(a.estudiante_id))
  )
);

-- La marca acepta el QR (firma) o el código escrito (6 dígitos, buscado en la ventana del
-- estudiante y en las 4 anteriores). Lo demás es igual que en la migración 0007.
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
  v_valida boolean := false;
  w bigint;
  motivos text[] := '{}';
begin
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
    raise exception 'La clase todavía no se sincroniza' using errcode = '23503';
  end if;

  if partes[4] ~ '^\d{6}$' then
    for w in reverse v_ventana .. v_ventana - 4 loop
      if codigo_qr(v_secreto, new.sesion_id, w) = partes[4] then
        v_ventana := w;
        v_valida := true;
        exit;
      end if;
    end loop;
    if not v_valida then
      raise exception 'El código no es correcto o ya cambió' using errcode = 'P0001';
    end if;
  elsif firma_qr(v_secreto, new.sesion_id, v_ventana) <> partes[4] then
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
