# AralLoop Campus

AralLoop Campus is a student productivity and study-management application built with HTML, CSS, and JavaScript. The same web codebase can be deployed on the web and packaged for Android with Capacitor. Both clients use the same Supabase backend when connected to the internet.

## Architecture

- Frontend: HTML5, CSS3, JavaScript
- Database: Supabase PostgreSQL
- Authentication: Supabase Auth
- Security: Supabase Row Level Security (RLS)
- Source control: GitHub
- Web deployment target: Cloudflare Pages
- Android packaging: Capacitor + Android Studio
- PWA support: manifest and service worker

## Supabase setup

1. Create a Supabase project.
2. Open the Supabase SQL Editor and run `supabase/schema.sql`.
3. Configure the Authentication site URL and permitted redirect URLs for the deployed web application and any authentication flows used by the Android package.
4. Copy the Supabase Project URL and anon/publishable key into `js/config.js`.
5. Test sign-up, sign-in, CRUD functions, reset, sign-out, and access from a second browser/account.

The Supabase anon/publishable key is intended for client applications. Data protection depends on Row Level Security policies. Never place a Supabase `service_role` key in frontend or Android-packaged web code.

## Web deployment

Push the project to GitHub and connect the repository to Cloudflare Pages. The root web files (`index.html`, `css/`, `js/`, `assets/`, `manifest.json`, and `service-worker.js`) remain the source for the web deployment.

## Android / APK preparation

Android packaging uses Capacitor; it does not rewrite AralLoop as a separate Kotlin or Java application. Install a current Node.js/npm environment, then run:

```bash
npm install
npm run android:add
```

The first command installs Capacitor. The second prepares the `www/` copy of the web assets and creates the generated `android/` project. After the Android project already exists, use:

```bash
npm run android:open
```

This rebuilds the `www/` assets, synchronizes them into Android, and opens the generated project in Android Studio. Use Android Studio to run the application on an emulator or connected Android device and to generate the APK after testing.

Do not manually copy application changes into `www/`; edit the root HTML/CSS/JS files and run `npm run android:sync` or `npm run android:open` so the Android copy is refreshed.

## Shared data behavior

The web deployment and Android package use the same Supabase project. An authenticated user can therefore use the same account and server-stored application data from either client while internet access is available. This version does not implement a separate offline database or offline synchronization system for application records.

## Database design in this version

To preserve the behavior of the existing prototype while using Supabase persistence, each authenticated user's AralLoop application state is stored as JSONB in `app_states`. Account information is stored in `profiles`. This can later be normalized into separate tables per module if required by the course.

## Project structure

- `index.html` - application entry point
- `css/styles.css` - external styles
- `js/config.js` - Supabase public project configuration
- `js/app.js` - application behavior
- `supabase/schema.sql` - database tables and RLS policies
- `manifest.json` / `service-worker.js` - PWA files
- `assets/` - project assets
- `package.json` - Capacitor dependencies and Android helper scripts
- `capacitor.config.json` - Capacitor application configuration
- `scripts/build-web.mjs` - prepares the generated `www/` folder for Android packaging
- `android/` - generated after `npm run android:add`; open this folder with Android Studio

## AralLoop v2 roles and CMS
The account model is Student, Teacher, and Admin. Public registration exposes Student and Teacher only; Admin is assigned securely in Supabase. Working Student and Group Leader are treated as student characteristics/responsibilities rather than authentication roles.

The login screen includes Forgot Password through Supabase Auth. Admin receives an Admin CMS entry point for publishing announcements through the `cms_content` table. The SQL schema adds role validation, an active-account field, CMS storage, and administrator-aware RLS.

Resend is not included. Supabase is the backend/authentication third-party integration, Cloudflare Pages is the web host/domain deployment layer, and Capacitor/Android Studio are used for Android packaging.

## v3 access model

The public browser application and Android APK expose Student and Teacher portals only. Student registration is self-service. Teacher registration additionally requires the teacher access code, which is validated by the Supabase `claim_teacher_role` server-side function and is not embedded in the browser/Android JavaScript bundle.

The Admin portal is web-only and is intentionally not linked from the public interface. Its deployment file is `portal-a7k9m2.html`. The unusual path reduces casual discovery only; security still depends on Supabase authentication, the `Admin` profile role, RLS, and server-side privileged functions. Do not treat the hidden URL as a password.

Run the complete `supabase/schema.sql` after upgrading. Admin accounts are not publicly registered. Assign an authorized account the `Admin` role from the Supabase dashboard/SQL editor during setup.

The Android build script copies only `index.html` and the public assets into `www/`, so the web-only Admin page is not packaged into the APK.


## v4 portal authentication
Student users self-register with email and password. Teacher registration additionally requires the server-validated classroom code `PUPTEACHER2026`. The separate web-only Admin portal requires an authorized Admin account, password, Admin role, and server-validated Admin Access Code `PUPADMIN2026`. The Android build contains the Student/Teacher public application only; the Admin HTML portal is excluded by `scripts/build-web.mjs`.
