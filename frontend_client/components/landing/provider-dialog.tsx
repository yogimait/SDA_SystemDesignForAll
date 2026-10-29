"use client";

import { useState } from "react";
import { KeyRoundIcon } from "lucide-react";
import type { ProvidersResponse } from "@sda/contracts";
import { ProvidersResponseSchema, SavedProviderConfigResponseSchema } from "@sda/contracts";
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
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, ApiError } from "@/lib/api/client";
import { providerLabel } from "@/lib/providers/label";
import { loadProviderKeys, loadProviderSetup, saveProviderSetup } from "@/lib/session/keys";
import type { ProviderSetup } from "@/lib/session/keys";
import { useSession } from "@/hooks/use-session";

/** Stored choice wins when the server still offers it; else the server default. */
function resolveSelection(
  data: ProvidersResponse,
  stored: ProviderSetup | null,
): { provider: string; model: string } {
  const providerId =
    stored !== null && data.providers.some((info) => info.id === stored.provider)
      ? stored.provider
      : data.defaultProvider;
  const info = data.providers.find((entry) => entry.id === providerId) ?? data.providers[0];
  const model =
    stored !== null && stored.provider === providerId && info?.models.includes(stored.model)
      ? stored.model
      : (info?.models[0] ?? "");
  return { provider: info?.id ?? "", model };
}

/**
 * Provider setup (BYOK). Provider + model lists come from `GET /api/providers`
 * (nothing hardcoded); keys stay in sessionStorage per provider — written
 * exclusively through lib/session/keys.ts. Signed-in users also get their
 * provider/model choice saved via `PUT /api/users/me/provider-config`; the key
 * never leaves the tab and is never part of that payload.
 * Focus trap, Esc-to-close and overlay come from the shared Dialog component.
 */
export function ProviderDialog() {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [providers, setProviders] = useState<ProvidersResponse | null>(null);
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const providerInfo = providers?.providers.find((info) => info.id === provider) ?? null;
  const apiKey = keys[provider] ?? "";

  async function loadProviders(): Promise<void> {
    setLoadError(null);
    try {
      const data = await apiFetch("/api/providers", {
        dataSchema: ProvidersResponseSchema,
      });
      setProviders(data);
      const selection = resolveSelection(data, loadProviderSetup());
      setProvider(selection.provider);
      setModel(selection.model);
    } catch (caught) {
      setLoadError(
        caught instanceof ApiError ? caught.userMessage : "Loading providers failed.",
      );
    }
  }

  function whenOpening(): void {
    setSaveError(null);
    setKeys(loadProviderKeys());
    const stored = loadProviderSetup();
    setProvider(stored?.provider ?? "");
    setModel(stored?.model ?? "");
    setReady(stored !== null);
    if (providers !== null) {
      const selection = resolveSelection(providers, stored);
      setProvider(selection.provider);
      setModel(selection.model);
    } else {
      void loadProviders();
    }
  }

  async function save(): Promise<void> {
    const setup: ProviderSetup = { provider, apiKey: apiKey.trim(), model };
    // Local first: the key is the part that only exists in this tab.
    saveProviderSetup(setup);
    setReady(true);
    setSaveError(null);
    if (session === null) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      // No key in this payload — the contract rejects unknown fields.
      await apiFetch("/api/users/me/provider-config", {
        method: "PUT",
        auth: true,
        body: JSON.stringify({ provider: setup.provider, model: setup.model }),
        dataSchema: SavedProviderConfigResponseSchema,
      });
      setOpen(false);
    } catch (caught) {
      setSaveError(
        caught instanceof ApiError
          ? caught.userMessage
          : "Saving the provider preference failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  const invalidSubmit = provider === "" || model === "" || apiKey.trim().length < 16;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) whenOpening();
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            aria-label={ready ? "Provider ready" : "Provider setup"}
          />
        }
      >
        <KeyRoundIcon aria-hidden="true" />
        <span className="hidden sm:inline">{ready ? "Provider ready" : "Provider setup"}</span>
      </DialogTrigger>

      <DialogContent className="max-w-[480px] p-6">
        <DialogHeader>
          <DialogTitle className="text-base">Set up model access</DialogTitle>
          <DialogDescription className="leading-relaxed">
            Generation runs on your own provider key. Pick a provider, add its
            key, then choose the model.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div>
            <label
              htmlFor="provider-name"
              className="text-muted-foreground mb-1.5 block text-[11px] font-medium uppercase tracking-wider"
            >
              Provider
            </label>
            <Select
              value={provider === "" ? null : provider}
              onValueChange={(value: string | null) => {
                if (value === null) return;
                setProvider(value);
                const models = providers?.providers.find((info) => info.id === value)?.models ?? [];
                setModel((current) =>
                  models.includes(current) ? current : (models[0] ?? ""),
                );
              }}
              disabled={providers === null}
            >
              <SelectTrigger
                id="provider-name"
                aria-label="Provider"
                className="bg-card mt-1.5 h-10! w-full"
              >
                <SelectValue>
                  {(value: string | null) =>
                    value === null
                      ? loadError !== null
                        ? "Provider list unreachable"
                        : "Pick a provider"
                      : providerLabel(value)
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(providers?.providers ?? []).map((info) => (
                  <SelectItem key={info.id} value={info.id}>
                    {providerLabel(info.id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {loadError !== null ? (
              <div role="alert" className="mt-2 flex items-center justify-between gap-2">
                <p className="text-destructive text-xs">{loadError}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => void loadProviders()}
                >
                  Retry
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground mt-1 text-xs">
                Only providers the server has registered are listed.
              </p>
            )}
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
              disabled={provider === ""}
              value={apiKey}
              onChange={(event) => {
                const value = event.target.value;
                setKeys((current) => ({ ...current, [provider]: value }));
              }}
              placeholder={provider === "" ? "Pick a provider first" : "Paste the provider key"}
              className="placeholder:text-muted-foreground/60 text-foreground border-input bg-card w-full rounded-lg border px-3.5 py-2.5 font-mono text-sm focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-1 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Each provider keeps its own key in this tab.
            </p>
          </div>

          <div>
            <label
              htmlFor="provider-model"
              className="text-muted-foreground mb-1.5 block text-[11px] font-medium uppercase tracking-wider"
            >
              Model
            </label>
            <Select
              value={model === "" ? null : model}
              onValueChange={(value: string | null) => {
                if (value !== null) setModel(value);
              }}
              disabled={apiKey.trim() === ""}
            >
              <SelectTrigger
                id="provider-model"
                aria-label="Model"
                className="bg-card mt-1.5 h-10! w-full font-mono text-xs"
              >
                <SelectValue
                  placeholder={
                    apiKey.trim() === "" ? "Add your API key first" : "Pick a model"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(providerInfo?.models ?? []).map((slug) => (
                  <SelectItem key={slug} value={slug}>
                    {slug}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground mt-1 text-xs">
              Models listed for the selected provider.
            </p>
          </div>

          <div className="bg-card border-border rounded-lg border border-solid p-3">
            <p className="text-foreground text-sm font-medium">Where your key lives</p>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              Stored in this browser tab only (sessionStorage). Cleared when you
              close the tab. Sent only for generation requests via the{" "}
              <span className="font-mono">x-provider-api-key</span> header —
              never logged, never stored server-side.
            </p>
          </div>

          {saveError !== null ? (
            <div role="alert" className="bg-destructive/10 rounded-lg p-3">
              <p className="text-destructive text-sm font-medium">{saveError}</p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                The key is saved for this tab; only the saved preference failed.
              </p>
            </div>
          ) : null}

          <DialogFooter className="sm:justify-between">
            <DialogClose
              render={<Button type="button" variant="outline" />}
            >
              Not now
            </DialogClose>
            <Button type="submit" disabled={busy || invalidSubmit}>
              {busy ? "Saving…" : "Save for this session"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
