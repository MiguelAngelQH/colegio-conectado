-- Cada colegio decide si registra tardanzas. Si no (como en su registro de control A/F/J),
-- la lista de asistencia solo ofrece Presente, Falta y Justificada.
alter table colegio add column if not exists usa_tardanza boolean not null default true;
