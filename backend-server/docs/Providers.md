# Providers

Model access is isolated behind `ModelProvider`. Orchestration depends on the interface and `ProviderRegistry`, never on a vendor SDK or URL.

## Boundary

```ts
interface ModelProvider {
  id: string;
  generateStructured(input: {
    model: string;
    system: string;
    messages: ChatMessage[];
    schemaName: string;
    jsonSchema: JsonSchemaObject;
    maxOutputTokens: number;
    timeoutMs: number;
  }): Promise<{ data: unknown; usage?: TokenUsage }>;
}
```

`src/providers/model-provider.ts` is the only contract generators use. The registry resolves a provider for one run and binds the hosted server key in memory.

## Registry rules

- `MOCK_PROVIDER=1` takes precedence and always returns the deterministic mock, regardless of the requested provider.
- Otherwise, `provider` from the request (or `DEFAULT_PROVIDER`, default `openrouter`) must be `openrouter` or `groq`; anything else is `VALIDATION_ERROR` with the available provider list.
- A real run uses the hosted key from `OPENROUTER_API_KEY` or `GROQ_API_KEY` in the deployment environment. If the selected provider's key is missing, the run fails immediately with `PROVIDER_AUTH_FAILED`; clients never supply a key.
- `GET /api/providers` returns the registered provider metadata, the env defaults, and the mock flag. It never returns a key.
- `DEFAULT_MODEL` is the active default model when a request omits one. Each provider exposes a model catalog from configuration only — no provider API is called to discover models:
  - `OPENROUTER_MODELS` (comma-separated) defaults to `z-ai/glm-5.3-flash` plus a small curated fallback list.
  - `GROQ_MODELS` (comma-separated) defaults to the common Groq chat models used by the adapter.
  - Values are trimmed, de-duplicated, and blank entries dropped; an empty catalog fails boot.
- `MOCK_PROVIDER=1` still reports both providers with their full catalogs; only generation is mocked. No generation module hardcodes a model slug.
- Migration: `OPENROUTER_MODEL` / `GROQ_MODEL` are renamed to `OPENROUTER_MODELS` / `GROQ_MODELS` (comma-separated). The singular names are ignored, so move an existing value into the plural variable.
- Keep `DEFAULT_MODEL` inside the selected provider's catalog so the client dropdown shows the active default. This is a configuration convention, not a validated constraint: a model outside the catalog still runs when the key allows it.

## Hosted key flow

The product is payment-only: users choose a plan, and generation runs on the
deployment's hosted provider key. The frontend never asks for a provider key.

```mermaid
sequenceDiagram
  participant C as Client
  participant API as RunService
  participant REG as ProviderRegistry
  participant OR as OpenRouter adapter
  participant W as Worker
  C->>API: POST run (no provider key)
  API->>API: assertCanStartRun(plan limits)
  API->>REG: resolve(provider?, hosted env key)
  REG->>OR: bind(hosted key)
  OR-->>REG: closure with key
  REG-->>API: ModelProvider
  API->>W: registerProvider(runId, provider)
  API->>API: insert run (key not included)
  W->>OR: generateStructured(input)
  OR-->>W: JSON + usage
  W->>API: unregister in finally
```

- `OPENROUTER_API_KEY` is required for the default provider; `GROQ_API_KEY` is
  required only when the deployment selects Groq.
- The hosted key stays in the provider closure for one run and is never written
  to the database, stage results, error details, logs, or SSE frames.
- No request header can override the hosted key. There is no BYOK UI and no
  account key vault in the product path.
- Mock mode (`MOCK_PROVIDER=1`) bypasses key resolution entirely.
- Providers can echo a key back in an error message; the adapter scrubs the
  exact bound key and every `sk-` / `sk-or-v1-` / `gsk_` token before the
  message reaches `AppError.details`. `GenerationWorker` and
  `AllExceptionsFilter` deep-redact details once more.
- The provider map entry exists only while the run is in flight; a restart loses
  it and reconciliation marks the run `interrupted`.
- Redacting logger and `redactSecrets` are the last line of defence.

### Local development

`backend-server/.env` may set `OPENROUTER_API_KEY` and/or `GROQ_API_KEY` for
manual runs. Shell and process-manager variables win over `.env`.
`/api/providers` never returns either key.

## OpenRouter adapter

Request: `POST https://openrouter.ai/api/v1/chat/completions` with `Authorization: Bearer <key>`, `Content-Type: application/json`, `X-Title: System Design All-in-One`, `temperature: 0.2`, `max_tokens` from the stage budget, `reasoning: { effort }` from `OPENROUTER_REASONING_EFFORT`, and an `AbortController` timeout.

`OPENROUTER_REASONING_EFFORT` defaults to `low`; set it to `off` to omit the parameter. Reasoning tokens share the `max_tokens` budget with visible output on OpenRouter, so leaving effort at the model default (`max`) can truncate large JSON responses.

### Structured-output ladder

The adapter tries modes in order and caches the working mode per model in memory:

1. **`json_schema`** — `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }` plus `provider: { require_parameters: true }`.
2. **`json_object`** — `response_format: { type: "json_object" }`, JSON Schema inlined in the system message.
3. **`prompt`** — no `response_format`, schema in the system message, tolerant extraction from code fences or surrounding prose.

A capability error in a non-final mode moves down the ladder. A capability error in `prompt` mode becomes `PROVIDER_UNSUPPORTED_CAPABILITY`. Parsing is tolerant in all modes because Dart/GLM-style providers sometimes wrap JSON; server-side Zod validation remains the authority.

### Error normalization

| Provider condition | Error code | Notes |
| --- | --- | --- |
| Blank key, 401, 403 | `PROVIDER_AUTH_FAILED` | No provider request for a blank key. |
| 429 | `PROVIDER_RATE_LIMITED` | `details.retryAfterSeconds` parsed from `Retry-After` (seconds or HTTP date). |
| Abort, 408, 504 | `PROVIDER_TIMEOUT` | Includes `timeoutMs` for aborts. |
| Context length message | `PROVIDER_UNSUPPORTED_CAPABILITY` | `details.reason = "context_length"`. |
| Capability rejection of `response_format` | ladder fallback | Only for 400/404/422 with matching message. |
| Other 5xx | `PROVIDER_UNAVAILABLE` | Generic retryable message. |
| Malformed envelope, empty content, invalid JSON, or output above 1,000,000 characters | `INVALID_MODEL_OUTPUT` | Oversized output is rejected (`reason = "output_too_large"`), never stored. Truncation (`reason = "truncated_output"`/`"truncated_json"` or `finish_reason = "length"`) gets one compact-prompt retry in the HLD phase; other stages and repeated truncation fail as `GENERATION_REPAIR_FAILED`. Other invalid JSON is repaired within the attempt budget. |
| 400 schema mismatch (`Generated JSON does not match the expected schema`, `json_validate_failed`) | ladder fallback, then `INVALID_MODEL_OUTPUT` | `json_schema` falls back to `json_object`, then prompt mode. A mismatch in prompt mode is `INVALID_MODEL_OUTPUT` (`reason = "schema_mismatch"`) so the bounded repair loop runs. |
| Other 4xx | `PROVIDER_UNSUPPORTED_CAPABILITY` | Redacted provider message capped at 300 chars. |
| Network failure | `PROVIDER_UNAVAILABLE` | The key is not echoed. |

### Schema sanitization

`zodToJsonSchema()` converts Zod 4 output to draft-7 and sanitizes per-node:

- removes `$schema`, `$id`, `$comment`, examples, defaults, read/write-only, deprecated, content encoding/media, and validation keywords that strict provider modes reject (`minLength`, `pattern`, `minimum`, `maxItems`, and similar);
- drops `additionalProperties: true`;
- sets `additionalProperties: false` on every object with properties;
- in strict mode (default), makes every declared property required.

Zod still validates the real payload. Provider-side schema hints are best-effort. Because strict modes drop `maxLength` and similar limits, the system prompts also require concise free-text fields.

### Stage budgets

| Stage | Schema name | Max output tokens | Timeout |
| --- | --- | --- | --- |
| Requirements | `requirements_analysis` | 4,000 | 90 s |
| HLD | `hld_model` | 64,000 | 900 s |
| LLD + DSA + learning | `lld_dsa_model` | 64,000 | 900 s |
| Scoped HLD/LLD/DSA | `hld_model` / `lld_model` / `dsa_model` | 64,000 / 64,000 / 64,000 | 900 s |

System prompts and repair prompts live in `src/providers/prompts/index.ts`. Temperature is fixed at 0.2 in the adapter.

GLM-5.3 Flash mandates reasoning. OpenRouter maps `effort: "low"` to roughly 20% of `max_tokens`, so the 64k budgets leave roughly 51k visible. The HLD budget was raised from 32k to 64k after a live run ended with `finish_reason: length`; the HLD phase now also retries a truncated response once with a compact-output instruction before failing. Truncation errors record completion and reasoning token counts, and their usage is counted against the run/plan even when the stage fails.

## Groq adapter

Request: `POST https://api.groq.com/openai/v1/chat/completions` with `Authorization: Bearer <key>`, `max_completion_tokens` from the stage budget, and `reasoning_effort` from `GROQ_REASONING_EFFORT` (default `low`). No OpenRouter `provider` routing or `X-Title` header is sent. GPT-OSS 120B supports strict `json_schema`; the shared ladder falls back to `json_object` then prompt-only if needed.

Groq can answer a strict-schema request with `400 Generated JSON does not match the expected schema` (`json_validate_failed`) or `400 Failed to generate JSON` (`failed_generation`). Both are treated as format failures, not permanent capability gaps: `json_schema` downgrades to `json_object`, then prompt mode, and a prompt-mode failure returns `INVALID_MODEL_OUTPUT` (`reason = "schema_mismatch"` or `"json_generation_failed"`) so the generator's bounded repair loop runs.

The current free-plan key is limited to **30 RPM, 1,000 RPD, 8,000 TPM, 200,000 TPD** for `openai/gpt-oss-120b`/`openai/gpt-oss-20b`. A 64k combined LLD/DSA request cannot fit the 8k TPM budget. Use OpenRouter for the full 64k generation, upgrade the Groq plan, or split LLD/DSA into multiple Groq calls (not implemented yet). Verified workaround: generate a baseline with OpenRouter, then use Groq scoped regeneration for HLD, LLD, and DSA separately; each section fit 8k TPM and produced a valid architecture (8 components / 12 connections, 12 classes / 9 relationships, 3 DSA recommendations) on `openai/gpt-oss-20b`. The adapter maps Groq `429` responses to `PROVIDER_RATE_LIMITED` with `retryAfterSeconds`.

## Verified model

| Field | Value |
| --- | --- |
| OpenRouter slug | `z-ai/glm-5.3-flash` |
| Context length | 1,048,576 tokens |
| `response_format` | Supported |
| `structured_outputs` | Supported |

The slug was verified against OpenRouter's model list. It is a default only: clients may request another model, and deployments may set `DEFAULT_MODEL`.

| Groq field | Value |
| --- | --- |
| Groq model | `openai/gpt-oss-120b` |
| Context length | 131,072 tokens |
| Strict `json_schema` | Supported (live probe) |
| Free-plan limits | 30 RPM, 1,000 RPD, 8,000 TPM, 200,000 TPD |

The Groq model and strict schema path were verified with a live probe. Free-plan TPM is the blocker for the 64k LLD/DSA stage. A full live architecture smoke passed on OpenRouter: HLD reused, LLD/DSA succeeded on attempt 3 with 64,230 tokens, 14 classes, 19 relationships, 3 patterns, 10 components, 12 connections, and 0 warnings.

A later live smoke with the 64k HLD budget (2026-10-30) completed on the default model: requirements 701 tokens in 1 attempt; architecture 28,690 tokens (HLD 4,188 on attempt 1; LLD/DSA 24,502 on attempt 2), 81.5 s total, version 1 valid with 0 errors/0 warnings, 11 components, 16 connections, 13 classes, 5 DSA recommendations, and 8 learning steps. The same smoke ran Groq requirements successfully: 1,093 tokens in 1 attempt.

## Mock provider

`MOCK_PROVIDER=1` registers `MockProvider`, which returns deterministic fixtures for `requirements_analysis`, `hld_model`, `lld_dsa_model`, `lld_model`, and `dsa_model` with fixed token usage. It is used by unit/e2e suites and local demos. It is never active unless explicitly enabled.

## Adding a provider

1. Implement `ModelProvider` in `src/providers/<vendor>/`.
2. Add it to `ProvidersModule`.
3. Register it in `ProviderRegistry.resolve()` and `list()`.
4. Map vendor failures to the registered error codes.
5. Add adapter contract tests with a mocked fetch.
6. Add the vendor to [[Testing]] and [[API]] if it changes request behavior.

No generator or worker change should be needed.

Related: [[Home]] · [[Generation]] · [[Architecture]] · [[Testing]]
