# Colegio Conectado

Aplicación de gestión escolar para colegios públicos del Perú: notas por competencias (CNEB), asistencia con QR,
tutoría, convivencia, portal de familias y supervisión de la UGEL. Funciona sin internet y sincroniza cuando hay señal.

- `app/` – PWA (React + TypeScript + Vite + Tailwind) y APK Android (Capacitor, carpeta `app/android`).
  Al programar sin variables de Supabase funciona en **modo demo** (datos de ejemplo en el navegador y cuentas de
  prueba con la contraseña `Colegio2026`).
- `supabase/migrations/` – esquema Postgres, permisos por rol (RLS), auditoría, reglas y funciones de sincronización.
- `supabase/functions/crear-usuario/` – Edge Function para que la dirección cree cuentas.

## Desarrollo

```bash
cd app
npm install
npm run dev        # http://localhost:5173 (modo demo)
npm test           # dominio, motor de sincronización y SQL sobre Postgres (PGlite)
npm run build      # versión para publicar: exige las variables de Supabase en app/.env
npm run build:demo # versión de demostración para presentaciones (sin servidor)
```

## Ingreso y cuentas

- Cada persona ingresa con su **DNI** (o su correo, si lo registró) y una contraseña. Las cuentas las crea la
  dirección: personal desde *Configuración › Personal*; estudiantes y apoderados desde la ficha del estudiante o
  para toda una sección (*Cuentas de la sección*, con tarjetas de acceso en PDF para imprimir).
- La cuenta nueva recibe una contraseña temporal y debe elegir una propia en su primer ingreso. Si la olvida, la
  dirección la restablece. Desactivar una cuenta cierra su acceso; su historial se conserva.
- En Supabase Auth cada cuenta usa un correo interno derivado del DNI (`<dni>@dni.colegio.invalid`, dominio
  reservado que nunca recibe correos). El DNI de una cuenta no se cambia desde la app.

## Puesta en producción

1. **Supabase:** cree un proyecto y ejecute en orden los archivos de `supabase/migrations/` (SQL Editor o
   `supabase db push`). Despliegue las funciones:
   ```bash
   supabase functions deploy crear-usuario
   supabase functions deploy gestionar-cuenta
   supabase functions deploy acceso-por-correo --no-verify-jwt
   ```
2. **Primer director:** en Supabase Auth cree un usuario con correo `<DNI>@dni.colegio.invalid` (por ejemplo
   `45678912@dni.colegio.invalid`), una contraseña y "Auto Confirm User". Luego su perfil con SQL:
   ```sql
   insert into colegio (id, colegio_id, nombre, codigo_modular, ugel) values ('<uuid>', '<uuid>', 'I.E. ...', '0000000', 'UGEL ...');
   insert into usuario (id, colegio_id, nombres, apellidos, dni, email, roles)
     values ('<id-auth>', '<uuid>', 'Nombre', 'Apellidos', '45678912', 'director@correo.pe', '{director}');
   ```
   El director ingresa con su DNI y crea al resto de cuentas desde la app. La cuenta de la UGEL se crea igual que la
   del director, con el rol `{ugel}`.
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
