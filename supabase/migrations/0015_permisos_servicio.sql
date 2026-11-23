-- Las funciones de cuentas (crear-usuario, gestionar-cuenta, acceso-por-correo) trabajan con el
-- rol de servicio. Los proyectos nuevos de Supabase ya no le dan permisos sobre las tablas creadas
-- por migraciones, así que se otorgan aquí (también para las tablas que se creen después).
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
