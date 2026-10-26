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

`src/providers/model-provider.ts` is the only contract generators use. The registry resolves a provider for one run and binds the BYOK key in memory.

## Registry rules

- `MOCK_PROVIDER=1` takes precedence and always returns the deterministic mock, regardless of the requested provider.
- Otherwise, `provider` from the request (or `DEFAULT_PROVIDER`, default `openrouter`) must be `openrouter`; anything else is `VALIDATION_ERROR` with the available provider list.
- A real run without `x-provider-api-key` fails immediately with `PROVIDER_AUTH_FAILED`.
- `GET /api/providers` returns the registered provider metadata, the env defaults, and the mock flag. It never returns a key.
- `DEFAULT_MODEL` is the only default model source. No generation module hardcodes a model slug.

## BYOK flow

```mermaid
sequenceDiagram
  participant C as Client
  participant API as RunService
  participant REG as ProviderRegistry
  participant OR as OpenRouter adapter
  participant W as Worker
  C->>API: POST run + x-provider-api-key
  API->>REG: resolve(provider?, key)
  REG->>OR: bind(key)
  OR-->>REG: closure with key
  REG-->>API: ModelProvider
  API->>W: registerProvider(runId, provider)
  API->>API: insert run (key not included)
  W->>OR: generateStructured(input)
  OR-->>W: JSON + usage
  W->>API: unregister in finally
```

- Request-supplied keys are never written to the database, stage results, error details, or metrics. The local fallback key is loaded from the gitignored `.env` into process memory only.
- The provider map entry exists only while the run is in flight; a restart loses it and reconciliation marks the run `interrupted`.
- Redacting logger and `redactSecrets` are the last line of defence for accidental messages.

### Local development fallback

`backend-server/.env` may set `OPENROUTER_API_KEY` so manual testing does not require the provider dialog on every run. `main.ts` loads `.env` when present; shell and process-manager variables win. `ProviderRegistry` uses the fallback only when:

- `x-provider-api-key` is absent or blank,
- `NODE_ENV` is not `production`.

The request header always wins. `/api/providers` never returns either key. Production remains BYOK; do not set this variable in a deployed environment.

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
| Malformed envelope, empty content, invalid JSON, or output above 1,000,000 characters | `INVALID_MODEL_OUTPUT` | Oversized output is rejected (`reason = "output_too_large"`), never stored. Truncation (`reason = "truncated_output"`/`"truncated_json"` or `finish_reason = "length"`) fails fast as `GENERATION_REPAIR_FAILED` because retrying with the same budget cannot help. Other invalid JSON may be repaired. |
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
| HLD | `hld_model` | 12,000 | 360 s |
| LLD + DSA + learning | `lld_dsa_model` | 64,000 | 900 s |
| Scoped HLD/LLD/DSA | `hld_model` / `lld_model` / `dsa_model` | 12,000 / 64,000 / 64,000 | 900 s |

System prompts and repair prompts live in `src/providers/prompts/index.ts`. Temperature is fixed at 0.2 in the adapter.

GLM-5.3 Flash mandates reasoning. OpenRouter maps `effort: "low"` to roughly 20% of `max_tokens`, so the 64k LLD/DSA budget leaves about 51k tokens for visible JSON. A 32k budget left only about 26k visible and still truncated on a real run. Truncation errors now record the completion and reasoning token counts.

## Verified model

| Field | Value |
| --- | --- |
| OpenRouter slug | `z-ai/glm-5.3-flash` |
| Context length | 1,048,576 tokens |
| `response_format` | Supported |
| `structured_outputs` | Supported |

The slug was verified against OpenRouter's model list. It is a default only: clients may request another model, and deployments may set `DEFAULT_MODEL`. A full live architecture smoke (all phases, recorded usage) is still pending; the adapter and model metadata are verified.

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
