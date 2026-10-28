# Deferred Items — System Design All-in-One

Saved for later. Surface these when planning the next phase or when a request touches one of them.

## Deferred capabilities

1. **Gemini adapter** — Groq and OpenAI-compatible adapters already landed; Gemini is the remaining provider (`ModelProvider` interface + registry + env config). Low effort.
2. **SSE** — replace run polling with server-sent events. Medium effort; needs backend event stream + frontend `EventSource`. Polling works for MVP.
3. **Export / PDF** — render canonical model to PDF/PNG. Medium effort; needs print/layout CSS or server-side rendering.
4. **Full auth hardening** — email verification, password reset, token rotation/refresh, rate limits, cookie/CSRF hardening, account deletion. Medium-high; required before public launch.
5. **Supabase / Redis** — managed Postgres + caching/queue. Infra change; Redis mainly if concurrency > 1 or SSE fan-out is needed.
6. **Streaming UI** — stream model tokens during generation. High effort; conflicts with two-phase validated output, so likely partial narrative streaming only.
7. **HLD / DSA guided walkthroughs** — DONE: per-view guided sequences, HLD flow focus, and DSA derived steps are implemented. Keep only for regression checks.

## Recommended order

Groq/Gemini adapters → HLD/DSA guided → export/PDF → auth hardening → SSE → streaming UI → Supabase/Redis.

Related: [[Home]] · [[Tech-Stack]] · [[Roadmap-Planner-Backend]] · [[Roadmap-Planner-Frontend]]
