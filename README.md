# Colegio Conectado

Aplicación de gestión escolar para colegios públicos del Perú: notas por competencias (CNEB), asistencia con QR,
tutoría, convivencia, portal de familias y supervisión de la UGEL. Funciona sin internet y sincroniza cuando hay señal.

- `app/` – PWA (React + TypeScript + Vite + Tailwind) y APK Android (Capacitor, carpeta `app/android`).
  Sin variables de Supabase funciona en **modo demo** (datos de ejemplo guardados en el navegador).
- `supabase/migrations/` – esquema Postgres, permisos por rol (RLS), auditoría, reglas y funciones de sincronización.
- `supabase/functions/crear-usuario/` – Edge Function para que la dirección cree cuentas.

## Desarrollo

```bash
cd app
npm install
npm run dev        # http://localhost:5173 (modo demo)
npm test           # dominio, motor de sincronización y SQL sobre Postgres (PGlite)
npm run build
```

## Puesta en producción

1. **Supabase:** cree un proyecto y ejecute en orden los archivos de `supabase/migrations/` (SQL Editor o
   `supabase db push`). Despliegue la función: `supabase functions deploy crear-usuario`.
2. **Primer director:** cree su usuario en Supabase Auth y luego su perfil con SQL:
   ```sql
   insert into colegio (id, colegio_id, nombre, codigo_modular, ugel) values ('<uuid>', '<uuid>', 'I.E. ...', '0000000', 'UGEL ...');
   insert into usuario (id, colegio_id, nombres, apellidos, roles) values ('<id-auth>', '<uuid>', 'Nombre', 'Apellidos', '{director}');
   ```
   Desde la app, el director crea al resto del personal. La cuenta de la UGEL se crea igual que la del director,
   con el rol `{ugel}`.
3. **Web (PWA):** copie `app/.env.example` a `app/.env`, complete `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`,
   ejecute `npm run build` y publique `app/dist` en cualquier hosting estático con HTTPS (necesario para la cámara).
4. **APK Android:** con el mismo `.env`:
   ```bash
   cd app
   npm run android                     # compila la web y la copia al proyecto Android
   cd android
   gradlew.bat assembleDebug           # APK de prueba en app/build/outputs/apk/debug/
   ```
   Requiere JDK 17 y el SDK de Android (plataforma 34). Para publicar, genere un APK/AAB firmado
   (`gradlew.bat bundleRelease` con su keystore). Los íconos se regeneran con `python scripts/generar-iconos-android.py`.

El catálogo del CNEB se genera con `node app/scripts/generar-cneb.mjs` (crea `app/src/data/cneb.json` y
`supabase/migrations/0004_cneb.sql`).
