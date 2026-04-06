import type { LlmSettings } from "./fs-service";

type LlmProvider = "anthropic" | "openai";
const REQUEST_TIMEOUT_MS = 20000;

export interface ProviderModelOption {
  id: string;
  label: string;
}

function normalizeProvider(settings: LlmSettings): LlmProvider {
  if (settings.selectedProvider) return settings.selectedProvider;
  if (settings.selectedModel.startsWith("claude")) return "anthropic";
  return "openai";
}

function readErrorMessage(payload: any): string | null {
  const candidate =
    payload?.error?.message ??
    payload?.message ??
    payload?.error ??
    null;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

async function parseJsonResponse<T>(response: Response, provider: LlmProvider): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");

  if (!response.ok) {
    const message = readErrorMessage(payload) ?? `${provider} error: ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

async function fetchJson<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  provider: LlmProvider
): Promise<T> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    return await parseJsonResponse<T>(response, provider);
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`${provider} request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function testLlmConnection(settings: LlmSettings): Promise<{ ok: boolean; message: string }> {
  const provider = normalizeProvider(settings);
  try {
    await completeText("Reply with only: OK", settings);
    return { ok: true, message: `${provider} connection successful` };
  } catch (error: any) {
    return { ok: false, message: error?.message || `${provider} connection failed` };
  }
}

export async function testProviderConnection(
  provider: LlmProvider,
  settings: LlmSettings
): Promise<{ ok: boolean; message: string }> {
  if (provider === "anthropic" && !settings.anthropicKey) {
    return { ok: false, message: "Anthropic API key is missing" };
  }
  if (provider === "openai" && !settings.openaiKey) {
    return { ok: false, message: "OpenAI API key is missing" };
  }

  try {
    const models = await fetchProviderModels(provider, settings);
    if (!models.length) {
      return { ok: false, message: `No models returned by ${provider}` };
    }
    return { ok: true, message: `${provider} connected (${models.length} models)` };
  } catch (error: any) {
    return { ok: false, message: error?.message || `${provider} connection failed` };
  }
}

export async function fetchProviderModels(provider: LlmProvider, settings: LlmSettings): Promise<ProviderModelOption[]> {
  if (provider === "anthropic") {
    if (!settings.anthropicKey) throw new Error("Anthropic API key is missing");
    const json = await fetchJson<any>("https://api.anthropic.com/v1/models", {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": settings.anthropicKey,
        "anthropic-version": "2023-06-01",
      },
    }, provider);
    const data = Array.isArray(json?.data) ? json.data : [];
    return data
      .map((item: any) => ({
        id: String(item?.id ?? ""),
        label: String(item?.display_name ?? item?.id ?? ""),
      }))
      .filter((item: ProviderModelOption) => Boolean(item.id))
      .sort((a: ProviderModelOption, b: ProviderModelOption) => a.label.localeCompare(b.label));
  }

  if (!settings.openaiKey) throw new Error("OpenAI API key is missing");
  const json = await fetchJson<any>("https://api.openai.com/v1/models", {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.openaiKey}`,
    },
  }, provider);
  const data = Array.isArray(json?.data) ? json.data : [];
  return data
    .map((item: any) => ({
      id: String(item?.id ?? ""),
      label: String(item?.id ?? ""),
    }))
    .filter((item: ProviderModelOption) => Boolean(item.id))
    .sort((a: ProviderModelOption, b: ProviderModelOption) => a.label.localeCompare(b.label));
}

export async function completeText(prompt: string, settings: LlmSettings): Promise<string> {
  const provider = normalizeProvider(settings);
  if (provider === "anthropic") {
    if (!settings.anthropicKey) throw new Error("Anthropic API key is missing");
    const json = await fetchJson<any>("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": settings.anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: settings.selectedModel,
        max_tokens: 1200,
        messages: [{ role: "user", content: prompt }],
      }),
    }, provider);
    return json.content?.[0]?.text ?? "";
  }

  if (!settings.openaiKey) throw new Error("OpenAI API key is missing");
  const json = await fetchJson<any>("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.openaiKey}`,
    },
    body: JSON.stringify({
      model: settings.selectedModel,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    }),
  }, provider);
  return json.choices?.[0]?.message?.content ?? "";
}
