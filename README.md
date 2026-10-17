# Colegio Conectado

Aplicación de gestión escolar para colegios públicos del Perú: notas por competencias (CNEB), asistencia con QR,
tutoría, seguimiento para padres y supervisión de la UGEL. Funciona sin internet y sincroniza cuando hay señal.

- `app/` – PWA (React + TypeScript + Vite + Tailwind). Sin variables de Supabase funciona en **modo demo**.
- `supabase/migrations/` – esquema Postgres, permisos por rol (RLS), auditoría y funciones de sincronización.

## Desarrollo

```bash
cd app
npm install
npm run dev        # http://localhost:5173 (modo demo)
npm test           # motor de sincronización + SQL sobre Postgres (PGlite)
npm run build
```

Para usar un servidor real copie `app/.env.example` a `app/.env` y complete `VITE_SUPABASE_URL` y
`VITE_SUPABASE_ANON_KEY`; luego aplique las migraciones de `supabase/migrations` en orden.

El catálogo del CNEB se genera con `node app/scripts/generar-cneb.mjs` (crea `app/src/data/cneb.json` y
`supabase/migrations/0004_cneb.sql`).
