# InvoiceFlow — NDIS Invoice Management SaaS

A production-ready, multi-tenant invoice management platform built for NDIS support workers and service providers.

## Tech Stack

| Layer      | Technology                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------ |
| Frontend   | React 18, Vite, TypeScript, TailwindCSS, shadcn/ui, Framer Motion, Zustand, TanStack Query |
| Backend    | Node.js, Express.js, TypeScript, Prisma ORM                                                |
| Database   | PostgreSQL                                                                                 |
| Auth       | JWT + Refresh Tokens, Google OAuth                                                         |
| Payments   | Stripe Subscriptions                                                                       |
| Storage    | AWS S3                                                                                     |
| PDF        | Puppeteer                                                                                  |
| Deployment | Local Node.js development with PostgreSQL                                                  |

## Features

- **Multi-tenant** — Every user has isolated data and workspaces
- **NDIS-Compliant** — Compliance checklist baked into invoice creation
- **PDF Generation** — High-quality PDFs via Puppeteer HTML rendering
- **Stripe Subscriptions** — Free plan (5 PDF downloads + 1 custom template), Pro $29/mo or yearly
- **Custom Templates** — Create branded invoice layouts (1 on Free, unlimited on Pro)
- **Custom Branding** — Upload logo, set colors, customize templates
- **Recurring Invoices** — Auto-generate from schedules
- **Quotations & Purchase Orders** — Full document lifecycle
- **Email Handoff** — Pre-filled email drafts for client delivery
- **Signature Capture** — Draw, upload, or type signatures

## Project Structure

```
invoiceflow/
├── backend/          # Express + Prisma API
├── frontend/         # React + Vite SPA
└── .env.example
```

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL
- (Optional) Redis for rate limiting / sessions

### 1. Clone & configure

```bash
cp .env.example .env
# Fill in all environment variables
```

### 2. Configure PostgreSQL

- Create a database named `invoiceflow`
- Update `DATABASE_URL` in `.env` if your credentials differ

### 3. Install dependencies and run migrations

```bash
cd backend
npm install
npx prisma migrate deploy
npx prisma db seed
```

### 4. Start backend

```bash
cd backend
npm run dev
```

### 5. Start frontend

```bash
cd frontend
npm install
npm run dev
```

## Subscription Plans

| Plan        | Price       | Features                                   |
| ----------- | ----------- | ------------------------------------------ |
| Free        | $0          | 5 PDF downloads, 1 custom template         |
| Pro Monthly | $29 AUD/mo  | Unlimited PDFs, unlimited custom templates |
| Pro Yearly  | $290 AUD/yr | Everything + 2 months free discount        |

## API Overview

Base URL: `http://localhost:4000/api/v1`

### Auth

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET  /auth/google`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`

### Invoices

- `GET    /invoices`
- `POST   /invoices`
- `GET    /invoices/:id`
- `PUT    /invoices/:id`
- `DELETE /invoices/:id`
- `POST   /invoices/:id/duplicate`
- `POST   /invoices/:id/pdf`

### Templates

- `GET  /templates`
- `POST /templates`

### Payments

- `POST /payments/checkout`
- `POST /payments/portal`
- `POST /payments/webhook`

## Environment Variables

See `.env.example` for all required variables.

## Deployment

This repository is designed for local development without Docker.

- Run the backend with `cd backend && npm run dev`
- Run the frontend with `cd frontend && npm run dev`
- Use a local PostgreSQL instance configured via `.env`
- Optionally run Redis locally and set `REDIS_URL` in `.env`

For production, deploy the backend and frontend with your preferred hosting provider, and use managed PostgreSQL, S3, Stripe, and SMTP services.

## License

MIT
