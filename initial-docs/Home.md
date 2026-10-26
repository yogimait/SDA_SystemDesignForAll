# System Design All-in-One — Documentation Index

Initial planning documentation for an AI-powered learning platform that turns any software idea or interview problem into an interactive **LLD (Low-Level Design)**, **HLD (High-Level Design)**, and **DSA (Data Structures & Algorithms)** learning experience.

The project emphasizes *understanding over generation*: the platform does not just produce diagrams, it explains why the proposed architecture makes sense, what alternatives exist, and how the parts work together.

## Contents

| File | Purpose |
| --- | --- |
| [[Project-Overview]] | What the product is, who it is for, the core workflow, and the minimum definition of done. |
| [[Tech-Stack]] | Focused technology choices: Next.js frontend, NestJS backend, PGlite/Postgres persistence, Zod contracts, and the OpenRouter + GLM-5.3 Flash model setup. |
| [[Roadmap-Planner-Frontend]] | Phase-by-phase build plan for the frontend with checkpoints. |
| [[Roadmap-Planner-Backend]] | Phase-by-phase build plan for the backend with checkpoints. |
| [Backend living docs](../backend-server/docs/Home.md) | Implemented backend architecture, API, data model, generation, providers, and testing. |

## Status

- Date created: 2026-10-23.
- Backend: MVP phases B0–B5 implemented; build, lint, unit, and e2e suites are green on PGlite + the mock provider. Live full-architecture smoke and real-Postgres integration remain pending. See [backend docs](../backend-server/docs/Home.md).
- Frontend: MVP phases F0–F6 implemented (landing, requirements flow, LLD/HLD/DSA workspace, guided LLD walkthrough); suites green: 72 unit tests, 2 Playwright journeys, lint, production build, Impeccable pass. Remaining odds and ends listed in the frontend planner.
- Model focus for the MVP: **OpenRouter** with **GLM-5.3 Flash** (`z-ai/glm-5.3-flash`), Bring-Your-Own-Key.
- Database for now: **PGlite** (embedded Postgres, no Docker); production swap to managed Postgres is a later, isolated change.

Related: [[Project-Overview]] · [[Tech-Stack]] · [[Roadmap-Planner-Frontend]] · [[Roadmap-Planner-Backend]] · [[Working-Style]]
