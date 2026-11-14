# System Design All-in-One

Turn one sentence into an editable requirements spec, a single validated architecture model, and interactive **LLD / HLD / DSA** views with explanations, guided learning, and a review-ready export.

**Live demo:** <https://sda.nerddog.me>

**Repository:** <https://github.com/yogimait/SDA_SystemDesignForAll>

> Public beta. The demo may cold-start, signups are limited, and generation can be paused to protect provider spend. See [Security](#security-and-abuse-controls).

## What it does

1. Enter an idea or interview problem.
2. Review and edit functional/non-functional requirements.
3. Confirm the spec.
4. Generate one canonical architecture model.
5. Explore LLD (UML), HLD (components/flows), and DSA (operations/complexity).
6. Use guided explanations, flow replay, annotations, and export.

The product is deliberately not a chat surface. LLD, HLD, and DSA render from the same validated model; raw model output is never sent straight to a diagram.

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | Next.js 16 App Router, React 19, Tailwind v4, shadcn/Base UI |
| Backend | NestJS 12 (Express), ESM, strict TypeScript |
| Contracts | Zod 4 in `packages/contracts` (`@sda/contracts`) |
| Database | Drizzle ORM; PGlite locally, Postgres in production |
| Diagrams | Custom SVG renderer + `@dagrejs/dagre`; no React Flow |
| Generation | Provider registry; OpenRouter default, Groq supported; hosted server key |
| Streaming | Polling plus SSE `GET /api/runs/:runId/events` |
| Auth | Short-lived Bearer access token, rotating refresh cookie, CSRF, email verification |
| Billing | Plan catalogue, stub provider locally, Stripe-ready REST adapter |
| Evals | JSONL golden set, TypeScript structural harness, DeepEval judge sidecar, mutation tests |

## Repository layout

```text
backend-server/       NestJS API, generation worker, auth, billing, evals-facing API
frontend_client/      Next.js app
packages/contracts/   Shared Zod schemas and envelope/error registry
initial-docs/         Product and phase planning
eval/                 Offline structural + semantic evaluation harness
```

## Local development

```bash
npm install
npm run dev:backend     # :3001
npm run dev:frontend    # :3000
```

Or run a deterministic mock backend:

```powershell
cd backend-server
$env:MOCK_PROVIDER="1"
$env:PORT="3001"
npm run start:dev
```

## Verification

```bash
# backend
cd backend-server
npm run build
npm run lint
npm run test
npm run test:e2e

# frontend
cd frontend_client
npm run lint
npm run test
npm run build
```

## Evaluation

`eval/` is the source of truth for offline evaluation. It contains:

- a versioned JSONL dataset with a manifest hash and `dev` / `validation` / `holdout` splits;
- structural checks that run the production generators and validator;
- component evals for requirements, HLD, LLD, DSA, and learning;
- a DeepEval-based semantic judge sidecar;
- mutation-sensitivity and blind-control checks.

Current caveat: the semantic judge is **not a release gate**. Absolute scores disagree between judges and control stability is insufficient. Use it for relative regression and defect discovery only.

See [`eval/README.md`](eval/README.md) and [`eval/BASELINE.md`](eval/BASELINE.md).

## Security and abuse controls

- Generation uses a hosted provider key. Clients never receive or store provider keys.
- Access tokens are short-lived; refresh tokens rotate and are stored hashed in an httpOnly cookie.
- Email verification, auth throttling, signup throttling, per-owner generation throttling, plan quotas, and a global queue cap are enforced server-side.
- `GENERATION_ENABLED` and `SIGNUP_ENABLED` are immediate kill switches.
- `GLOBAL_DAILY_TOKEN_LIMIT` and `GLOBAL_DAILY_RUN_LIMIT` cap total provider usage across all accounts.
- Do not post deployment secrets or copied `.env` files. Never commit real provider, Stripe, Resend, database, or CSRF secrets.

Production is single-instance: the generation worker and SSE event bus are process-local. Multi-instance deployment requires a shared queue and pub/sub layer.

## Status and limitations

- Core product, authentication, billing scaffolding, account settings, export, and SSE stage streaming are implemented.
- Stripe and Resend adapters are implemented but live-mode payment/email smoke tests are still required.
- The semantic eval set currently has 12 draft dev cases; validation and holdout sets are not populated.
- The product is a learning aid, not a substitute for engineering review or load testing.

## License

No license has been selected yet. Treat the code as all-rights-reserved until a license is added.
