"use client";

/**
 * Settings: one source of truth for generation defaults (provider + model),
 * stored per account through `PUT /api/users/me/provider-config` and shared
 * with the provider dialog, which pre-fills from it. No API key is stored
 * here — BYOK stays request-scoped in the dialog.
 *
 * Deliberately absent: theme (the app ships one branded dark palette; nothing
 * to switch) and the duplicate default/provider-model fields that used to live
 * in a "Preferences" card (they diverged from this configuration).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  SavedProviderConfigResponseSchema,
  ProvidersResponseSchema,
} from "@sda/contracts";
import { CheckIcon } from "lucide-react";
import { PortalHeader } from "@/components/portal/portal-header";
import { VerifyEmailBanner } from "@/components/portal/verify-email-banner";
import { AccountCard } from "@/components/settings/account-card";
import { BillingCard } from "@/components/settings/billing-card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, ApiError } from "@/lib/api/client";
import { providerLabel } from "@/lib/providers/label";
import { useAuthBootSettled, useHydrated, useSession } from "@/hooks/use-session";
import { useRouter } from "next/navigation";

type ProvidersInfo = import("@sda/contracts").ProvidersResponse;

export function SettingsContent() {
  const router = useRouter();
  const session = useSession();
  const [providers, setProviders] = useState<ProvidersInfo | null>(null);

  // Hold route-guard redirects until hydrated: during the hydration commit
  // the session still reads as the server snapshot (null).
  const hydrated = useHydrated();
  const bootSettled = useAuthBootSettled();
  useEffect(() => {
    if (hydrated && bootSettled && session === null) {
      router.replace("/login?next=/settings");
    }
  }, [hydrated, bootSettled, session, router]);

  useEffect(() => {
    if (session === null) return;
    const timer = window.setTimeout(() => {
      void apiFetch("/api/providers", { dataSchema: ProvidersResponseSchema })
        .then(setProviders)
        .catch(() => setProviders(null));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [session]);

  if (!hydrated || session === null) {
    return (
      <div className="flex min-h-screen flex-col">
        <PortalHeader current="settings" />
        <main className="mx-auto w-full max-w-[1100px] flex-1 px-6 py-10">
          <Skeleton className="h-64 w-full rounded-xl" />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <PortalHeader current="settings" />
      <main className="mx-auto w-full max-w-[1100px] flex-1 px-6 py-8">
        <div>
          <h1 className="text-foreground text-xl font-medium tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Generation defaults for{" "}
            <span className="font-mono text-[11px]">{session.user.email}</span>.
          </p>
        </div>

        <div className="mt-6 grid gap-4">
          <VerifyEmailBanner />
          <ProviderConfigCard providers={providers} />
          <BillingCard />
          <AccountCard />
          <section aria-label="How settings apply" className="bg-card border-border rounded-xl border border-solid p-4">
            <h2 className="text-foreground text-sm font-semibold tracking-tight">
              How these settings apply
            </h2>
            <ul className="text-muted-foreground mt-2 grid gap-1.5 text-sm leading-relaxed">
              <li>
                The provider dialog on the landing page, the library, and the
                requirements page pre-fills the provider and model saved here.
              </li>
              <li>
                A run always uses the provider, model, and{" "}
                <span className="font-mono text-[11px]">x-provider-api-key</span>{" "}
                you confirm in that dialog — the key stays in this browser tab
                and is never stored server-side.
              </li>
              <li>
                Only when nothing is chosen does the server fall back to its own
                environment defaults (provider and model configured on the
                backend).
              </li>
              <li>
                The app ships one branded dark palette, so there is no theme
                switch to set.
              </li>
            </ul>
          </section>
          <section aria-label="Bring your own key" className="bg-card border-border rounded-xl border border-solid p-4">
            <h2 className="text-foreground text-sm font-semibold tracking-tight">
              Bring your own key (BYOK)
            </h2>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              The saved configuration keeps{" "}
              <strong className="text-foreground">no API key</strong>. Per-request
              BYOK keys live in the provider dialog, travel only as the{" "}
              <span className="font-mono text-[11px]">x-provider-api-key</span>{" "}
              header for one run, and never persist. Each provider keeps its own
              key in that tab.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}

interface ProviderConfigCardProps {
  providers: ProvidersInfo | null;
}

function ProviderConfigCard({ providers }: ProviderConfigCardProps) {
  const [provider, setProvider] = useState<string>("");
  const [model, setModel] = useState<string>("");
  // Not editable: the provider adapters take reasoning effort from server
  // config. Carried through saves so the stored value is never wiped.
  const [reasoningEffort, setReasoningEffort] = useState<string>("");
  const [loaded, setLoaded] = useState<
    "loading" | "empty" | "active" | "auth-required" | "error"
  >("loading");
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [error, setError] = useState<{ user: string; detail: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiFetch("/api/users/me/provider-config", {
          auth: true,
          dataSchema: SavedProviderConfigResponseSchema,
        });
        setProvider(data.config.provider);
        setModel(data.config.model);
        setReasoningEffort(data.config.reasoningEffort ?? "");
        setLoaded("active");
      } catch (caught) {
        if (caught instanceof ApiError && caught.code === "PROVIDER_CONFIG_NOT_FOUND") {
          setLoaded("empty");
          return;
        }
        if (caught instanceof ApiError && caught.code === "AUTH_REQUIRED") {
          setLoaded("auth-required");
          return;
        }
        setLoaded("error");
      }
    })();
  }, []);

  async function save(): Promise<void> {
    setBusy(true);
    setSavedNote(null);
    setError(null);
    try {
      const data = await apiFetch("/api/users/me/provider-config", {
        method: "PUT",
        auth: true,
        body: JSON.stringify({
          provider: provider.trim(),
          model: model.trim(),
          ...(reasoningEffort.trim() === "" ? {} : { reasoningEffort: reasoningEffort.trim() }),
        }),
        dataSchema: SavedProviderConfigResponseSchema,
      });
      setProvider(data.config.provider);
      setModel(data.config.model);
      setReasoningEffort(data.config.reasoningEffort ?? "");
      setLoaded("active");
      setSavedNote(new Date(data.config.updatedAt).toLocaleTimeString("en-US"));
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError({ user: caught.userMessage, detail: caught.message });
      } else {
        setError({ user: "Saving the configuration failed.", detail: String(caught) });
      }
    } finally {
      setBusy(false);
    }
  }

  const models = providers?.providers.find((info) => info.id === provider)?.models ?? [];
  // Keep a saved model that the provider no longer lists, so loading settings
  // never silently drops the user's configuration.
  const modelOptions =
    model !== "" && !models.includes(model) ? [model, ...models] : models;

  return (
    <section aria-label="Saved provider configuration" className="bg-card border-border rounded-xl border border-solid p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-foreground text-sm font-semibold tracking-tight">Generation defaults</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            The provider and model the dialog pre-fills. A run still sends what
            you confirm there, together with your key.
          </p>
        </div>
        <span
          className={
            "font-mono text-[10px] uppercase " +
            (loaded === "active" ? "text-success" : "text-muted-foreground")
          }
        >
          {loaded === "loading"
            ? "loading"
            : loaded === "active"
              ? "saved"
              : loaded === "error"
                ? "error"
                : loaded === "auth-required"
                  ? "sign in"
                  : "not set"}
        </span>
      </div>

      {loaded === "auth-required" ? (
        <div className="bg-primary/10 border-primary/40 mt-4 rounded-lg border border-dashed p-4">
          <p className="text-foreground text-sm font-medium">
            Sign in to manage your saved configuration.
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            The session for this tab is missing or expired.
          </p>
          <Link
            href="/login?next=%2Fsettings"
            className="text-primary hover:underline mt-3 inline-block text-sm underline-offset-4"
          >
            Sign in
          </Link>
        </div>
      ) : null}

      {loaded === "loading" ? <Skeleton className="mt-4 h-24 rounded-lg" /> : null}

      {loaded !== "loading" && loaded !== "auth-required" ? (
        <form
          className="mt-4 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="provider" className="text-foreground text-sm font-medium">
                Provider
              </label>
              <Select
                value={provider === "" ? null : provider}
                onValueChange={(value: string | null) => {
                  if (value === null) return;
                  setProvider(value);
                  const nextModels = providers?.providers.find((info) => info.id === value)?.models ?? [];
                  if (model !== "" && nextModels.length > 0 && !nextModels.includes(model)) {
                    setModel("");
                  }
                }}
                disabled={providers === null}
              >
                <SelectTrigger id="provider" aria-label="Provider" className="mt-1.5 w-full">
                  <SelectValue>
                    {(value: string | null) =>
                      value === null
                        ? providers === null
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
            </div>
            <div>
              <label htmlFor="model" className="text-foreground text-sm font-medium">
                Model
              </label>
              <Select
                value={model === "" ? null : model}
                onValueChange={(value: string | null) => {
                  if (value !== null) setModel(value);
                }}
                disabled={provider === ""}
              >
                <SelectTrigger id="model" aria-label="Model" className="mt-1.5 w-full font-mono text-xs">
                  <SelectValue
                    placeholder={provider === "" ? "Pick a provider first" : "Pick a model"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {loaded === "empty" ? (
            <p className="text-muted-foreground text-xs">
              Nothing saved yet — the dialog asks for provider and model until you
              save them here.
            </p>
          ) : null}

          {savedNote !== null ? (
            <p role="status" className="text-success flex items-center gap-1.5 text-xs">
              <CheckIcon className="size-3.5" aria-hidden="true" />
              Saved at {savedNote}
            </p>
          ) : null}
          {error !== null ? (
            <div role="alert" className="bg-destructive/10 rounded-lg p-3">
              <p className="text-destructive text-sm font-medium">{error.user}</p>
              <p className="text-muted-foreground font-mono mt-0.5 text-[11px]">{error.detail}</p>
            </div>
          ) : null}

          <Button type="submit" disabled={busy || provider.trim() === "" || model.trim() === ""}>
            Save configuration
          </Button>
        </form>
      ) : null}
    </section>
  );
}

export default function Page() {
  return <SettingsContent />;
}
