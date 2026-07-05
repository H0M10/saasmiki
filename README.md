# SaasMike — Pedidos por WhatsApp para restaurante

Sistema de pedidos: el cliente ordena por WhatsApp (menú interactivo, notas,
pago, ubicación) y el restaurante gestiona todo desde el panel web
(aceptar/declinar, cocina, repartidores, tickets con QR, menú, KPIs, horarios).

- 📋 Plan completo: [PLAN.md](PLAN.md)
- 📱 Guía para conectar WhatsApp: [GUIA-WHATSAPP.md](GUIA-WHATSAPP.md)

## Stack

| Pieza | Tecnología |
|---|---|
| Web + API/webhook | Next.js (App Router, TypeScript, Tailwind) |
| Base de datos + Realtime + Auth | Supabase (Postgres) |
| Mensajería | WhatsApp Cloud API (Meta) |
| Hosting | Vercel (deploy automático desde GitHub) |

## Puesta en marcha

### 1. Supabase
1. Crea un proyecto en [supabase.com](https://supabase.com) (plan gratis).
2. Ve a **SQL Editor → New query**, pega todo el contenido de
   [supabase/schema.sql](supabase/schema.sql) y dale **Run**.
3. En **Project Settings → API** copia: `Project URL`, `anon key` y
   `service_role key`.

### 2. Variables de entorno
```bash
copy .env.example .env.local   # y llena los valores
```

### 3. Correr en local
```bash
npm install
npm run dev
```
Abre http://localhost:3000

### 4. Deploy (GitHub + Vercel)
1. Sube el repo a GitHub.
2. En [vercel.com](https://vercel.com): **Add New → Project → importa el repo**.
3. En **Settings → Environment Variables** agrega las mismas variables de
   `.env.local`.
4. Cada `git push` a `main` despliega solo.

> ⚠️ GitHub **Pages** no sirve para este proyecto (solo hospeda sitios
> estáticos y el webhook de WhatsApp necesita servidor). El flujo correcto es:
> código en GitHub → Vercel lo despliega.

### 5. Webhook de WhatsApp
Con la app ya desplegada, sigue el **Paso 5** de
[GUIA-WHATSAPP.md](GUIA-WHATSAPP.md) usando:
`https://TU-APP.vercel.app/api/whatsapp/webhook`

## Estructura

```
app/
  api/whatsapp/webhook/route.ts   ← recibe/verifica mensajes de Meta
lib/
  supabase.ts                     ← cliente de BD (servidor)
  whatsapp.ts                     ← enviar texto / botones / listas
supabase/
  schema.sql                      ← esquema completo de la BD
```
