"use client";

/**
 * Settings → Saved API keys: status-only list from the encrypted account vault.
 * Responses never carry key material, and this card never displays any. Removal
 * is inline-confirmed and refreshes the shared status.
 */
import { useState } from "react";
import { CircleCheckIcon, KeyRoundIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/client";
import { removeProviderCredential } from "@/lib/providers/credentials";
import { providerLabel } from "@/lib/providers/label";
import { formatTimestamp } from "@/lib/format";
import { useSavedProviderKeys } from "@/hooks/use-saved-provider-keys";

export function SavedApiKeysCard() {
  const { credentials, loading, error, refresh } = useSavedProviderKeys();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const saved = [...credentials.values()].filter((credential) => credential.saved);

  async function remove(provider: string): Promise<void> {
    setRemoving(provider);
    setRemoveError(null);
    try {
      await removeProviderCredential(provider);
      setConfirming(null);
      await refresh();
    } catch (caught) {
      setRemoveError(
        caught instanceof ApiError
          ? caught.userMessage
          : "Removing the saved key failed.",
      );
    } finally {
      setRemoving(null);
    }
  }

  return (
    <section
      aria-label="Saved API keys"
      className="bg-card border-border rounded-xl border border-solid p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-foreground text-sm font-semibold tracking-tight">
            Saved API keys
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Account-scoped provider keys, encrypted at rest. They work on every
            device; the key itself is never shown.
          </p>
        </div>
        <span className="text-muted-foreground text-[10px]">
          {loading ? "loading" : saved.length === 0 ? "none" : `${saved.length} saved`}
        </span>
      </div>

      {loading ? <Skeleton className="mt-4 h-16 rounded-lg" /> : null}

      {error !== null ? (
        <div role="alert" className="bg-destructive/10 mt-4 rounded-lg p-3">
          <p className="text-destructive text-sm font-medium">{error}</p>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="mt-2"
            onClick={() => void refresh()}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {!loading && saved.length === 0 ? (
        <div className="border-border mt-4 rounded-lg border border-dashed p-4">
          <p className="text-foreground flex items-center gap-1.5 text-sm font-medium">
            <KeyRoundIcon className="size-4" aria-hidden="true" />
            No saved keys yet
          </p>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            Keys you choose to save from Provider setup appear here. Until then a
            key lives in that browser tab only.
          </p>
        </div>
      ) : null}

      {saved.length > 0 ? (
        <ul className="mt-4 grid gap-2">
          {saved.map((credential) => {
            const updatedAt = formatTimestamp(credential.updatedAt);
            const lastUsedAt = formatTimestamp(credential.lastUsedAt);
            const isConfirming = confirming === credential.provider;
            return (
              <li
                key={credential.provider}
                className="border-border/70 rounded-lg border border-solid p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground text-sm font-medium">
                      {providerLabel(credential.provider)}
                    </span>
                    <span className="text-success flex items-center gap-1 text-[10px]">
                      <CircleCheckIcon className="size-3" aria-hidden="true" />
                      saved
                    </span>
                  </div>
                  {!isConfirming ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        setConfirming(credential.provider);
                        setRemoveError(null);
                      }}
                    >
                      Remove key
                    </Button>
                  ) : null}
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  {updatedAt !== null ? `Saved ${updatedAt}` : "Saved"}
                  {lastUsedAt !== null ? ` · last used ${lastUsedAt}` : " · not used yet"}
                </p>
                {isConfirming ? (
                  <div className="mt-2">
                    <p className="text-foreground text-xs">
                      Remove the saved key for {providerLabel(credential.provider)}?
                      A key in this browser tab stays.
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => setConfirming(null)}
                      >
                        Keep it
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="xs"
                        disabled={removing === credential.provider}
                        onClick={() => void remove(credential.provider)}
                      >
                        {removing === credential.provider ? "Removing…" : "Remove key"}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {removeError !== null ? (
        <p role="alert" className="text-destructive mt-2 text-xs">
          {removeError}
        </p>
      ) : null}
    </section>
  );
}
