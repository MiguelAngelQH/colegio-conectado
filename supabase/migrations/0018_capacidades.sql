-- Notas por capacidad: el docente califica cada capacidad de la competencia y el logro de la
-- competencia (nivel_logro) se calcula en la app con la regla del registro auxiliar del colegio.
-- Se guardan en la misma nota: {"1": "B", "2": "A", ...} (número de capacidad en el CNEB).
create or replace function capacidades_validas(j jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(j) = 'object'
    and not exists (select 1 from jsonb_each_text(j) e where e.key !~ '^\d{1,2}$' or e.value not in ('AD','A','B','C'))
$$;

alter table calificacion add column if not exists capacidades jsonb not null default '{}'::jsonb;
alter table calificacion drop constraint if exists calificacion_capacidades_validas;
alter table calificacion add constraint calificacion_capacidades_validas check (capacidades_validas(capacidades));
