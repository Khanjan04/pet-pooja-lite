# Khana Khazana

Restaurant POS SaaS for India: billing, kitchen tickets (KOT), tables, GST invoices, split payments,
staff PINs, multiple tills, live updates between screens, a back office, and subscriptions.

- App: Next.js 16 + Postgres (this folder). Setup, environment and security notes: [`replica/backend.md`](replica/backend.md).
- Planning and QA docs: [`replica/`](replica): recon map, architecture, schema, design system, build log, test plan, bugs.

```bash
cp .env.example .env.local   # fill in
npm install
npm run db:migrate && npm run db:seed
npm run dev
npm test && npm run test:server && npm run test:e2e
```
