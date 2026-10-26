"use client";

import { useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DEFAULT_SETUP,
  type ProviderSetup,
  loadProviderSetup,
  saveProviderSetup,
} from "@/lib/session/keys";

/**
 * First-run provider setup (OpenRouter BYOK). Keys stay in sessionStorage
 * (this tab only) — written exclusively through lib/session/keys.ts.
 * Focus trap, Esc-to-close and overlay come from the shared Dialog component.
 */
export function ProviderDialog() {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<ProviderSetup>(DEFAULT_SETUP);

  async function whenOpening() {
    const stored = await loadProviderSetup();
    setDraft(stored ?? DEFAULT_SETUP);
    setReady(stored !== null);
  }

  function avoidInvalidSubmit(): boolean {
    return draft.apiKey.trim().length < 16;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void whenOpening();
      }}
    >
      <DialogTrigger
        onClick={() => {
          void whenOpening();
        }}
        className="text-foreground hover:bg-popover bg-border/30 border-input focus-visible:ring-ring focus-visible:ring-2 h-10 rounded-xl border border-solid px-4 text-sm transition-colors focus-visible:outline-1"
      >
        {ready ? "Provider ready" : "Provider setup"}
      </DialogTrigger>

      <DialogContent className="max-w-[480px] p-6">
        <DialogHeader>
          <DialogTitle className="text-base">
            Set up model access
          </DialogTitle>
          <DialogDescription className="leading-relaxed">
            The app talks to OpenRouter with your own API key. OpenRouter offers
            the GLM-5.3 Flash model, used by default.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            saveProviderSetup({ ...draft, provider: "openrouter" });
            setReady(true);
          }}
        >
          <div>
            <label
              htmlFor="provider-name"
              className="text-muted-foreground mb-1.5 block text-[11px] font-medium uppercase tracking-wider"
            >
              Provider
            </label>
            <input
              id="provider-name"
              type="text"
              value="OpenRouter"
              disabled
              className="bg-card border-input text-foreground w-full cursor-not-allowed rounded-lg border px-3.5 py-2.5 text-sm"
            />
            <p
              id="provider-name-hint"
              className="text-muted-foreground mt-1 text-xs"
            >
              More providers (Groq, Gemini) can be added later.
            </p>
          </div>

          <div>
            <label
              htmlFor="provider-api-key"
              className="text-muted-foreground mb-1.5 block text-[11px] font-medium uppercase tracking-wider"
            >
              API key
            </label>
            <input
              id="provider-api-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={draft.apiKey}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  apiKey: event.target.value,
                }))
              }
              placeholder="sk-or-…"
              className="placeholder:text-muted-foreground/60 text-foreground border-input bg-card w-full rounded-lg border px-3.5 py-2.5 font-mono text-sm focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-1"
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Starts with <span className="font-mono">sk-or-</span>
            </p>
          </div>

          <div>
            <label
              htmlFor="provider-model"
              className="text-muted-foreground mb-1.5 block text-[11px] font-medium uppercase tracking-wider"
            >
              Model
            </label>
            <input
              id="provider-model"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={draft.model}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  model: event.target.value,
                }))
              }
              className="placeholder:text-muted-foreground/60 text-foreground border-input bg-card w-full rounded-lg border px-3.5 py-2.5 font-mono text-sm focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-1"
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Any OpenRouter model name works; the default is{" "}
              <span className="font-mono">GLM-5.3 Flash</span>.
            </p>
          </div>

          <div className="bg-card border-border rounded-lg border border-solid p-3">
            <p className="text-foreground text-sm font-medium">
              Where your key lives
            </p>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              Stored in this browser tab only (sessionStorage). Cleared when
              you close the tab. Sent only for generation requests via the{" "}
              <span className="font-mono">x-provider-api-key</span> header —
              never logged, never stored server-side.
            </p>
          </div>

          <DialogFooter className="sm:justify-between">
            <DialogClose
              className="text-foreground hover:bg-card border-input focus-visible:ring-ring h-10 rounded-xl border border-solid px-4 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-1"
            >
              Not now
            </DialogClose>
            <button
              type="submit"
              disabled={avoidInvalidSubmit()}
              className="bg-primary text-primary-foreground hover:brightness-105 hover:-translate-y-px active:translate-y-0 active:brightness-95 focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-1 h-10 rounded-xl px-4 text-sm font-medium transition-[filter,transform] duration-150 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save for this session
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
