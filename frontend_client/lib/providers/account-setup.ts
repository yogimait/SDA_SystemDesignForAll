/**
 * Resolves the active provider + model for a tab. The tab record wins; a
 * signed-in account's saved provider-config stands in when this tab has none
 * (new tab / cleared sessionStorage). The resolved provider/model is mirrored
 * into tab storage so run requests pick it up — never a key.
 */
import { SavedProviderConfigResponseSchema } from "@sda/contracts";
import { apiFetch } from "../api/client";
import { loadProviderSetup, saveProviderSetup, type ProviderSetup } from "../session/keys";

export async function resolveProviderSetup(): Promise<ProviderSetup | null> {
  const local = loadProviderSetup();
  if (local !== null && local.provider !== "" && local.model.trim() !== "") return local;
  try {
    const data = await apiFetch("/api/users/me/provider-config", {
      auth: true,
      dataSchema: SavedProviderConfigResponseSchema,
    });
    const resolved: ProviderSetup = {
      provider: data.config.provider,
      model: data.config.model,
      apiKey: local?.apiKey ?? "",
    };
    saveProviderSetup(resolved);
    return resolved;
  } catch {
    return local; // not saved yet / offline: keep whatever this tab has
  }
}
