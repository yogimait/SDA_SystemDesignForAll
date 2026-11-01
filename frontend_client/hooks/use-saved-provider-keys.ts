"use client";

/**
 * Account-scoped BYOK status for signed-in users. In-memory only: the list of
 * saved provider ids never touches localStorage/sessionStorage, and status
 * responses never contain a key. Anonymous visitors get an empty set.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProviderCredentialStatus } from "@sda/contracts";
import { ApiError } from "@/lib/api/client";
import { listProviderCredentials } from "@/lib/providers/credentials";
import { useSession } from "@/hooks/use-session";

export function useSavedProviderKeys(): {
  credentials: ReadonlyMap<string, ProviderCredentialStatus>;
  savedProviders: ReadonlySet<string>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const session = useSession();
  const signedIn = session !== null;
  const [credentials, setCredentials] = useState<
    ReadonlyMap<string, ProviderCredentialStatus>
  >(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!signedIn) {
      setCredentials(new Map());
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      const list = await listProviderCredentials();
      setCredentials(new Map(list.map((credential) => [credential.provider, credential])));
      setError(null);
    } catch (caught) {
      // Keep the previous status: a gated page falls back to the tab key.
      setError(
        caught instanceof ApiError
          ? caught.userMessage
          : "Loading saved provider keys failed.",
      );
    } finally {
      setLoading(false);
    }
  }, [signedIn]);

  useEffect(() => {
    // Deferred off the effect body: the fetch sets state when it settles.
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const savedProviders = useMemo(
    () =>
      new Set(
        [...credentials.values()]
          .filter((credential) => credential.saved)
          .map((credential) => credential.provider),
      ),
    [credentials],
  );

  return { credentials, savedProviders, loading, error, refresh };
}
