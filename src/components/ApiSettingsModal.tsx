import { useMemo, useState } from "react";
import { useProjectStore } from "../store/useProjectStore";
import { fetchProviderModels, testProviderConnection, type ProviderModelOption } from "../lib/llm-service";

type ProviderId = "anthropic" | "openai";

interface ProviderUiState {
  status: string;
  testing: boolean;
  models: ProviderModelOption[];
}

const INITIAL_PROVIDER_STATE: ProviderUiState = {
  status: "Not tested",
  testing: false,
  models: [],
};

export function ApiSettingsModal({ onClose }: { onClose: () => void }) {
  const llmSettings = useProjectStore((s) => s.llmSettings);
  const updateLlmSettings = useProjectStore((s) => s.updateLlmSettings);
  const [providerState, setProviderState] = useState<Record<ProviderId, ProviderUiState>>({
    anthropic: { ...INITIAL_PROVIDER_STATE },
    openai: { ...INITIAL_PROVIDER_STATE },
  });

  const activeProvider = llmSettings.selectedProvider;
  const activeModels = providerState[activeProvider].models;

  const selectedModelExists = useMemo(
    () => activeModels.some((model) => model.id === llmSettings.selectedModel),
    [activeModels, llmSettings.selectedModel]
  );

  async function testProvider(provider: ProviderId): Promise<void> {
    setProviderState((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], testing: true, status: "Testing..." },
    }));

    const latestSettings = useProjectStore.getState().llmSettings;
    const result = await testProviderConnection(provider, latestSettings);

    if (!result.ok) {
      setProviderState((prev) => ({
        ...prev,
        [provider]: {
          ...prev[provider],
          testing: false,
          status: result.message,
          models: [],
        },
      }));
      return;
    }

    try {
      const models = await fetchProviderModels(provider, latestSettings);
      setProviderState((prev) => ({
        ...prev,
        [provider]: {
          ...prev[provider],
          testing: false,
          status: `Connected (${models.length} models found)`,
          models,
        },
      }));

      const hasSelection = models.some((model) => model.id === latestSettings.selectedModel);
      if (!hasSelection && models[0]) {
        await updateLlmSettings({
          selectedProvider: provider,
          selectedModel: models[0].id,
        });
      }
    } catch (error: any) {
      setProviderState((prev) => ({
        ...prev,
        [provider]: {
          ...prev[provider],
          testing: false,
          status: error?.message || `${provider} connection failed`,
          models: [],
        },
      }));
    }
  }

  async function selectProvider(provider: ProviderId): Promise<void> {
    const models = providerState[provider].models;
    const nextModel = models[0]?.id ?? llmSettings.selectedModel;
    await updateLlmSettings({
      selectedProvider: provider,
      selectedModel: nextModel,
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900 }}>
        <div className="modal-header">
          <div className="modal-title">API / LLM Settings</div>
          <div className="modal-actions">
            <button className="btn btn-sm" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="modal-body">
          <div className="provider-grid">
            <section className={`provider-card ${activeProvider === "anthropic" ? "is-active" : ""}`}>
              <div className="provider-header">
                <div className="provider-title-wrap">
                  <label className="form-label">Anthropic API</label>
                  <span className="provider-status">{providerState.anthropic.status}</span>
                </div>
                <button
                  className="btn btn-sm"
                  onClick={() => void testProvider("anthropic")}
                  disabled={providerState.anthropic.testing}
                >
                  {providerState.anthropic.testing ? "Testing..." : "Test Anthropic"}
                </button>
              </div>
              <input
                className="form-input"
                type="password"
                placeholder="sk-ant-..."
                value={llmSettings.anthropicKey ?? ""}
                onChange={(e) => void updateLlmSettings({ anthropicKey: e.target.value })}
              />
              <button
                className={`btn btn-sm ${activeProvider === "anthropic" ? "btn-primary" : ""}`}
                onClick={() => void selectProvider("anthropic")}
                disabled={!providerState.anthropic.models.length}
              >
                Use Anthropic
              </button>
            </section>

            <section className={`provider-card ${activeProvider === "openai" ? "is-active" : ""}`}>
              <div className="provider-header">
                <div className="provider-title-wrap">
                  <label className="form-label">OpenAI API</label>
                  <span className="provider-status">{providerState.openai.status}</span>
                </div>
                <button
                  className="btn btn-sm"
                  onClick={() => void testProvider("openai")}
                  disabled={providerState.openai.testing}
                >
                  {providerState.openai.testing ? "Testing..." : "Test OpenAI"}
                </button>
              </div>
              <input
                className="form-input"
                type="password"
                placeholder="sk-proj-..."
                value={llmSettings.openaiKey ?? ""}
                onChange={(e) => void updateLlmSettings({ openaiKey: e.target.value })}
              />
              <button
                className={`btn btn-sm ${activeProvider === "openai" ? "btn-primary" : ""}`}
                onClick={() => void selectProvider("openai")}
                disabled={!providerState.openai.models.length}
              >
                Use OpenAI
              </button>
            </section>
          </div>

          <div className="form-group">
            <label className="form-label">Active provider</label>
            <div className="provider-pill">{activeProvider === "anthropic" ? "Anthropic" : "OpenAI"}</div>
          </div>

          <div className="form-group">
            <label className="form-label">Model ({activeProvider})</label>
            {!activeModels.length ? (
              <div className="text-muted">Test {activeProvider} to load available models for this key.</div>
            ) : (
              <select
                className="form-select"
                value={selectedModelExists ? llmSettings.selectedModel : activeModels[0].id}
                onChange={(e) =>
                  void updateLlmSettings({
                    selectedProvider: activeProvider,
                    selectedModel: e.target.value,
                  })
                }
              >
                {activeModels.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="text-muted">
            Model options come directly from each provider after a successful connection test.
          </div>
        </div>
      </div>
    </div>
  );
}
