# Pulse Gym — web, API, and Android

Pulse Gym is a monorepo with a Fastify/PostgreSQL API, a Vite admin dashboard, and a native Expo React Native Android app. Both clients use the same role-aware JWT API and PostgreSQL data.

## Prerequisites

- Node 20+ (use `npm.cmd` in PowerShell if execution policy blocks `npm`)
- Docker Desktop (recommended for PostgreSQL), or a PostgreSQL 16 database. The bundled Docker database is exposed on port `55432` to avoid conflicts with locally installed PostgreSQL.
- Android Studio for an emulator, and an Expo account/EAS CLI for cloud Android builds

## Start locally

1. Copy `.env.example` to `.env` and change `JWT_SECRET`.
2. Start PostgreSQL: `docker compose up -d`.
3. Install dependencies: `npm.cmd install`.
4. Generate Prisma Client: `npm.cmd run generate -w @pulse/database`.
5. Create and apply the migration: `npm.cmd run migrate -w @pulse/database -- --name initial`.
6. Seed the demo organization: `npm.cmd run db:seed`.
7. In one terminal run `npm.cmd run dev:api`; in another run `npm.cmd run dev:web`.

The dashboard is at http://localhost:5173. Use `admin@pulse.test` / `Password123!`.

## Android app

1. Set `EXPO_PUBLIC_API_URL` in `.env`. On the Android emulator use `http://10.0.2.2:4000`; on a physical phone use your computer's LAN IP (for example `http://192.168.1.12:4000`).
2. Start an emulator from Android Studio, then run `npm.cmd run android -w @pulse/mobile`. Or run `npm.cmd run start -w @pulse/mobile` and scan the Expo QR code on a physical Android phone.
3. Member demo: `member@pulse.test` / `Password123!`. Admin demo: `admin@pulse.test` / `Password123!`.

The member app shows the secure rotating check-in QR, workout/diet plans, membership/payment status and notifications. The admin app uses the native device camera to validate that QR against the same API before attendance is written.

## Production Android builds

Install EAS once: `npm.cmd install -g eas-cli`, then authenticate with `eas login`.

- Development APK: `npm.cmd run build:apk -w @pulse/mobile`
- Store AAB: `npm.cmd run build:aab -w @pulse/mobile`

Before the first Play submission, replace the default Expo icon with your finalized 1024×1024 PNG and configure the store listing, privacy policy, Firebase FCM credentials, EAS secrets and production API URL. Publish the API to a TLS-enabled host, set `WEB_ORIGIN` to the deployed dashboard origin, deploy web output from `apps/web`, then submit the generated AAB in Google Play Console.

## API surface and safety

Authentication uses signed JWTs and secure device storage. Every data query is organization-scoped, admin operations require an admin claim, and member QR payloads contain only a short-lived opaque attendance token. Duplicate or expired attendance is rejected by the backend; no offline UI claims a check-in succeeded before validation.

Key routes: `/auth/register`, `/auth/login`, `/auth/logout`, `/members`, `/members/:id`, `/attendance`, `/attendance/token`, `/attendance/check-in`, `/attendance/history`, `/workouts`, `/diet-plans`, `/payments`, `/notifications`, and `/dashboard`.
