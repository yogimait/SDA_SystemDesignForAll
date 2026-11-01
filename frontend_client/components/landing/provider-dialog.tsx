"use client";

import { useState } from "react";
import { CircleCheckIcon, KeyRoundIcon } from "lucide-react";
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
import {
  removeProviderCredential,
  saveProviderCredential,
} from "@/lib/providers/credentials";
import { MIN_PROVIDER_KEY_LENGTH } from "@/lib/providers/setup";
import { loadProviderKeys, loadProviderSetup, saveProviderSetup } from "@/lib/session/keys";
import type { ProviderSetup } from "@/lib/session/keys";
import { useSession } from "@/hooks/use-session";
import { useSavedProviderKeys } from "@/hooks/use-saved-provider-keys";
import { formatTimestamp } from "@/lib/format";

type Selection = { provider: string; model: string };

type DialogError = { user: string; detail: string; note?: string };

/** Preferred choice wins when the server still offers the provider; a saved
 *  model is kept even when the catalog dropped it (Settings does the same). */
function resolveSelection(
  data: ProvidersResponse,
  preferred: Selection | null,
): Selection {
  const providerId =
    preferred !== null && data.providers.some((info) => info.id === preferred.provider)
      ? preferred.provider
      : data.defaultProvider;
  const info = data.providers.find((entry) => entry.id === providerId) ?? data.providers[0];
  const model =
    preferred !== null && preferred.provider === providerId && preferred.model.trim() !== ""
      ? preferred.model
      : (info?.models[0] ?? "");
  return { provider: info?.id ?? "", model };
}

/**
 * Provider setup (BYOK). Provider + model lists come from `GET /api/providers`
 * (nothing hardcoded); a session key stays in sessionStorage per provider —
 * written exclusively through lib/session/keys.ts.
 *
 * Signed-in users share one provider/model source with Settings: their saved
 * provider-config pre-fills the dialog, and saving here writes it back via
 * `PUT /api/users/me/provider-config` (no key in that payload). They can also
 * opt in to the encrypted account vault (`PUT /api/users/me/provider-keys`):
 * that key is never read back, never pre-filled, and is not copied to this tab.
 * Anonymous visitors get sessionStorage only.
 *
 * `triggerLabel` lets a page-body CTA reuse the dialog (headers keep their
 * compact label); `onSaved` fires once the tab-local setup is stored, so a
 * gated page can re-check readiness without another source of truth.
 */
export function ProviderDialog({
  triggerLabel,
  onSaved,
  marketing = false,
}: {
  triggerLabel?: string;
  onSaved?: (setup: ProviderSetup) => void;
  /** Marketing-page header control: 44px tall instead of the compact app size. */
  marketing?: boolean;
} = {}) {
  const session = useSession();
  const savedKeys = useSavedProviderKeys();
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [providers, setProviders] = useState<ProvidersResponse | null>(null);
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [saveToAccount, setSaveToAccount] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<DialogError | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const providerInfo = providers?.providers.find((info) => info.id === provider) ?? null;
  const apiKey = keys[provider] ?? "";
  const savedCredential = provider === "" ? undefined : savedKeys.credentials.get(provider);
  const hasSavedKey = savedCredential?.saved === true;
  const newKeyReady = apiKey.trim().length >= MIN_PROVIDER_KEY_LENGTH;
  // Same rule as Settings: a saved model the catalog no longer lists stays
  // selectable (clearly marked) instead of silently snapping to another model.
  const catalogModels = providerInfo?.models ?? [];
  const modelOptions =
    model !== "" && !catalogModels.includes(model)
      ? [model, ...catalogModels]
      : catalogModels;

  /** Saved account config is the shared source; local setup is the fallback. */
  async function loadPreferredSelection(): Promise<Selection | null> {
    const stored = loadProviderSetup();
    if (session === null) return stored;
    try {
      const data = await apiFetch("/api/users/me/provider-config", {
        auth: true,
        dataSchema: SavedProviderConfigResponseSchema,
      });
      return { provider: data.config.provider, model: data.config.model };
    } catch {
      return stored; // not saved yet / offline: the tab-local choice still wins
    }
  }

  async function loadProviders(): Promise<void> {
    setLoadError(null);
    try {
      const [data, preferred] = await Promise.all([
        apiFetch("/api/providers", { dataSchema: ProvidersResponseSchema }),
        loadPreferredSelection(),
      ]);
      setProviders(data);
      const selection = resolveSelection(data, preferred);
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
    setRemoveError(null);
    setConfirmRemove(false);
    setSaveToAccount(true);
    setKeys(loadProviderKeys());
    const stored = loadProviderSetup();
    setProvider(stored?.provider ?? "");
    setModel(stored?.model ?? "");
    setReady(stored !== null);
    void savedKeys.refresh();
    void loadProviders();
  }

  async function save(): Promise<void> {
    if (invalidSubmit) return;
    setSaveError(null);
    setBusy(true);

    const newKey = apiKey.trim();
    const keyEntered = newKey.length >= MIN_PROVIDER_KEY_LENGTH;
    // What remains in this tab after saving; "" means the account key is the
    // only copy.
    let appliedKey = keys[provider] ?? "";
    let accountError: DialogError | null = null;
    let configError: DialogError | null = null;

    if (keyEntered) {
      if (session !== null && saveToAccount) {
        try {
          await saveProviderCredential(provider, newKey);
          appliedKey = "";
          void savedKeys.refresh();
        } catch (caught) {
          // The account copy failed, but the tab can still run with this key.
          appliedKey = newKey;
          accountError = {
            user:
              caught instanceof ApiError
                ? caught.userMessage
                : "Saving the key to your account failed.",
            detail: caught instanceof Error ? caught.message : String(caught),
            note: "The key still works for this tab. Retry the account save, or use it session-only.",
          };
        }
      } else {
        appliedKey = newKey;
      }
    }

    saveProviderSetup({ provider, apiKey: appliedKey, model });
    setKeys((current) => {
      const next = { ...current };
      if (appliedKey === "") delete next[provider];
      else next[provider] = appliedKey;
      return next;
    });
    setReady(true);
    // A gated page re-checks readiness even when the account save failed,
    // because the session key is already usable.
    onSaved?.({ provider, apiKey: appliedKey, model });

    if (session !== null) {
      try {
        // No key in this payload — the contract rejects unknown fields.
        await apiFetch("/api/users/me/provider-config", {
          method: "PUT",
          auth: true,
          body: JSON.stringify({ provider, model }),
          dataSchema: SavedProviderConfigResponseSchema,
        });
      } catch (caught) {
        configError = {
          user:
            caught instanceof ApiError
              ? caught.userMessage
              : "Saving the provider preference failed.",
          detail: caught instanceof Error ? caught.message : String(caught),
          note:
            appliedKey === ""
              ? "The key is saved to your account; only the saved preference failed."
              : "The key is saved for this tab; only the saved preference failed.",
        };
      }
    }

    setBusy(false);
    const error = accountError ?? configError;
    if (error !== null) {
      setSaveError(error);
      return;
    }
    setOpen(false);
  }

  async function removeSavedKey(): Promise<void> {
    setRemoving(true);
    setRemoveError(null);
    try {
      await removeProviderCredential(provider);
      setConfirmRemove(false);
      await savedKeys.refresh();
      // The tab key (if any) is untouched; readiness tells the page which one.
      onSaved?.({ provider, apiKey: keys[provider] ?? "", model });
    } catch (caught) {
      setRemoveError(
        caught instanceof ApiError
          ? caught.userMessage
          : "Removing the saved key failed.",
      );
    } finally {
      setRemoving(false);
    }
  }

  const invalidSubmit =
    provider === "" || model === "" || (!newKeyReady && !hasSavedKey);
  const savedAt = formatTimestamp(savedCredential?.updatedAt);
  const lastUsedAt = formatTimestamp(savedCredential?.lastUsedAt);

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
            size={triggerLabel === undefined ? "sm" : "default"}
            className={
              marketing
                ? "border-border bg-card text-foreground hover:bg-popover h-11 rounded-lg px-3.5 text-xs font-medium [&_svg]:size-3.5"
                : undefined
            }
            aria-label={ready ? "Provider ready" : (triggerLabel ?? "Provider setup")}
          />
        }
      >
        <KeyRoundIcon aria-hidden="true" />
        {triggerLabel === undefined ? (
          <span className="hidden sm:inline">{ready ? "Provider ready" : "Provider setup"}</span>
        ) : (
          <span>{ready ? "Provider ready" : triggerLabel}</span>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-[480px] p-6">
        <DialogHeader>
          <DialogTitle className="text-base">Set up model access</DialogTitle>
          <DialogDescription className="leading-relaxed">
            Generation runs on your own provider key. Pick a provider and model,
            then add the key for this tab or save it encrypted to your account.
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
              className="text-muted-foreground mb-1.5 block text-xs font-medium"
            >
              Provider
            </label>
            <Select
              value={provider === "" ? null : provider}
              onValueChange={(value: string | null) => {
                if (value === null) return;
                setProvider(value);
                setConfirmRemove(false);
                setRemoveError(null);
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
              className="text-muted-foreground mb-1.5 block text-xs font-medium"
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
              placeholder={
                provider === ""
                  ? "Pick a provider first"
                  : hasSavedKey
                    ? "Saved key — paste a new key to rotate"
                    : "Paste the provider key"
              }
              className="placeholder:text-muted-foreground/60 text-foreground border-input bg-card w-full rounded-lg border px-3.5 py-2.5 font-mono text-sm focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-1 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Each provider keeps its own key. The field is never filled from
              your account.
            </p>
          </div>

          <div>
            <label
              htmlFor="provider-model"
              className="text-muted-foreground mb-1.5 block text-xs font-medium"
            >
              Model
            </label>
            <Select
              value={model === "" ? null : model}
              onValueChange={(value: string | null) => {
                if (value !== null) setModel(value);
              }}
              disabled={!newKeyReady && !hasSavedKey}
            >
              <SelectTrigger
                id="provider-model"
                aria-label="Model"
                className="bg-card mt-1.5 h-10! w-full font-mono text-xs"
              >
                <SelectValue
                  placeholder={
                    newKeyReady || hasSavedKey
                      ? "Pick a model"
                      : "Add your API key first"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map((slug) => (
                  <SelectItem key={slug} value={slug}>
                    {catalogModels.includes(slug) ? slug : `${slug} · saved`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground mt-1 text-xs">
              {model !== "" && !catalogModels.includes(model)
                ? "Your saved model is kept even though the provider no longer lists it."
                : "Models listed for the selected provider."}
            </p>
          </div>

          {hasSavedKey ? (
            <section
              aria-label="Saved account key"
              className="bg-card border-border rounded-lg border border-solid p-3"
            >
              <p className="text-success flex items-center gap-1.5 text-sm font-medium">
                <CircleCheckIcon className="size-3.5" aria-hidden="true" />
                Saved to your account
              </p>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                Works across devices.
                {savedAt !== null ? ` Saved ${savedAt}.` : ""}
                {lastUsedAt !== null ? ` Last used ${lastUsedAt}.` : ""}
              </p>
              {confirmRemove ? (
                <div className="mt-2">
                  <p className="text-foreground text-xs">
                    Remove the saved key for {providerLabel(provider)}? A key in
                    this tab stays.
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => setConfirmRemove(false)}
                    >
                      Keep it
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="xs"
                      disabled={removing}
                      onClick={() => void removeSavedKey()}
                    >
                      {removing ? "Removing…" : "Remove key"}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="mt-2"
                  onClick={() => setConfirmRemove(true)}
                >
                  Remove saved key
                </Button>
              )}
              {removeError !== null ? (
                <p role="alert" className="text-destructive mt-2 text-xs">
                  {removeError}
                </p>
              ) : null}
            </section>
          ) : null}

          {session !== null ? (
            <div className="bg-card border-border rounded-lg border border-solid p-3">
              <label
                htmlFor="save-key-to-account"
                className="flex cursor-pointer items-start gap-2.5"
              >
                <input
                  id="save-key-to-account"
                  type="checkbox"
                  checked={saveToAccount}
                  onChange={(event) => setSaveToAccount(event.target.checked)}
                  className="accent-primary focus-visible:ring-ring mt-0.5 size-4 flex-none rounded-sm focus-visible:ring-2 focus-visible:outline-1"
                />
                <span>
                  <span className="text-foreground block text-sm font-medium">
                    Save this key to my account (encrypted)
                  </span>
                  <span className="text-muted-foreground mt-0.5 block text-xs leading-relaxed">
                    Encrypted at rest on the server and never shown again. A
                    server breach could still expose it, so prefer a key with a
                    spend limit.
                  </span>
                </span>
              </label>
            </div>
          ) : null}

          <div className="bg-card border-border rounded-lg border border-solid p-3">
            <p className="text-foreground text-sm font-medium">Where your key lives</p>
            <ul className="text-muted-foreground mt-1 grid gap-1 text-xs leading-relaxed">
              <li>
                <span className="text-foreground">Saved to your account</span> —
                encrypted at rest on the server; works across devices and after
                this tab closes.
              </li>
              <li>
                <span className="text-foreground">Session only</span> — this
                browser tab (sessionStorage); cleared when the tab closes.
              </li>
              <li>
                <span className="text-foreground">Anonymous</span> — session only.
                Sign in to keep a key on your account.
              </li>
            </ul>
          </div>

          {saveError !== null ? (
            <div role="alert" className="bg-destructive/10 rounded-lg p-3">
              <p className="text-destructive text-sm font-medium">{saveError.user}</p>
              {saveError.note !== undefined ? (
                <p className="text-muted-foreground mt-0.5 text-xs">{saveError.note}</p>
              ) : null}
              <p className="text-muted-foreground font-mono mt-0.5 text-[11px]">
                {saveError.detail}
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
              {busy ? "Saving…" : "Save provider setup"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
