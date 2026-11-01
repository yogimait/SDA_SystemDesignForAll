/**
 * Account-scoped BYOK vault. Status responses carry no key material, and the
 * key is only ever sent once on save (never stored client-side by this module).
 * Response shapes come from `@sda/contracts`.
 */
import {
  ProviderCredentialsResponseSchema,
  ProviderCredentialStatusResponseSchema,
  RemoveProviderCredentialResponseSchema,
  type ProviderCredentialStatus,
} from "@sda/contracts";
import { apiFetch } from "../api/client";

export async function listProviderCredentials(): Promise<ProviderCredentialStatus[]> {
  const data = await apiFetch("/api/users/me/provider-keys", {
    auth: true,
    dataSchema: ProviderCredentialsResponseSchema,
  });
  return data.credentials;
}

export async function saveProviderCredential(
  provider: string,
  apiKey: string,
): Promise<ProviderCredentialStatus> {
  const data = await apiFetch(
    `/api/users/me/provider-keys/${encodeURIComponent(provider)}`,
    {
      method: "PUT",
      auth: true,
      body: JSON.stringify({ apiKey }),
      dataSchema: ProviderCredentialStatusResponseSchema,
    },
  );
  return data.credential;
}

export async function removeProviderCredential(provider: string): Promise<boolean> {
  const data = await apiFetch(
    `/api/users/me/provider-keys/${encodeURIComponent(provider)}`,
    {
      method: "DELETE",
      auth: true,
      dataSchema: RemoveProviderCredentialResponseSchema,
    },
  );
  return data.removed;
}
