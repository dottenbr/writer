import { useEffect, useState } from "react";
import { useProjectStore } from "../store/useProjectStore";
import { fetchProviderModels, INCLUDED_DEFAULT_MODEL, type ProviderModelOption } from "../lib/llm-service";
import type { LlmSettings } from "../lib/local-config";

type ProviderId = LlmSettings["selectedProvider"];

const INCLUDED: ProviderModelOption[] = [
  { id: "@cf/moonshotai/kimi-k2.6", label: "Kimi K2.6" },
  { id: "@cf/zai-org/glm-5.3", label: "GLM 5.3" },
  { id: "@cf/deepseek-ai/deepseek-v4-pro-0813", label: "DeepSeek V4 Pro" },
  { id: "@cf/openai/gpt-oss-120b", label: "gpt-oss 120B" },
];

/** Choose who answers the assistant: the model included with Bookkit, or your own Anthropic / OpenAI key. */
export function ApiSettingsModal({ onClose }: { onClose: () => void }) {
  const llm = useProjectStore(s => s.llmSettings);
  const update = useProjectStore(s => s.updateLlmSettings);
  const [models, setModels] = useState<Record<"anthropic" | "openai", ProviderModelOption[]>>({ anthropic: [], openai: [] });
  const [status, setStatus] = useState<Record<"anthropic" | "openai", string>>({ anthropic: "", openai: "" });
  const [testing, setTesting] = useState<"" | "anthropic" | "openai">("");
  const provider: ProviderId = llm.selectedProvider;

  useEffect(() => {
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  async function test(p: "anthropic" | "openai") {
    setTesting(p);
    setStatus(s => ({ ...s, [p]: "Checking key…" }));
    try {
      const list = await fetchProviderModels(p, llm);
      setModels(m => ({ ...m, [p]: list }));
      setStatus(s => ({ ...s, [p]: list.length ? `Connected · ${list.length} models` : "Connected, but no text models were returned" }));
      if (list.length) await update({ selectedProvider: p, selectedModel: list.some(x => x.id === llm.selectedModel) ? llm.selectedModel : list[0].id });
    } catch (e) {
      setStatus(s => ({ ...s, [p]: (e as Error).message }));
    } finally { setTesting(""); }
  }

  const card = (id: ProviderId, title: string, body: React.ReactNode) => (
    <section className={`ai-option ${provider === id ? "on" : ""}`}>
      <label className="ai-option-head">
        <input type="radio" name="ai-provider" checked={provider === id} onChange={() => void update(id === "bookkit" ? { selectedProvider: id, selectedModel: INCLUDED_DEFAULT_MODEL } : { selectedProvider: id, selectedModel: models[id]?.[0]?.id ?? llm.selectedModel })} />
        <span>{title}</span>
      </label>
      <div className="ai-option-body">{body}</div>
    </section>
  );

  const keyCard = (id: "anthropic" | "openai", name: string, placeholder: string) => {
    const key = id === "anthropic" ? llm.anthropicKey : llm.openaiKey;
    return card(id, `Your ${name} key`, <>
      <div className="ai-key-row">
        <input className="field-input" type="password" autoComplete="off" placeholder={placeholder} value={key ?? ""} onChange={e => void update(id === "anthropic" ? { anthropicKey: e.target.value } : { openaiKey: e.target.value })} />
        <button className="btn btn-sm" disabled={!key || testing === id} onClick={() => void test(id)}>{testing === id ? "Checking…" : "Connect"}</button>
      </div>
      {status[id] && <div className="ai-status">{status[id]}</div>}
      {provider === id && models[id].length > 0 && (
        <select className="field-input" value={llm.selectedModel} onChange={e => void update({ selectedModel: e.target.value })}>
          {models[id].map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      )}
    </>);
  };

  return (
    <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog ai-dialog" role="dialog" aria-label="AI assistant">
        <h2>AI assistant</h2>
        <p className="dialog-sub">The assistant gives editorial notes and helps keep plan and bible pages up to date. It never writes your prose.</p>
        {card("bookkit", "Included with Bookkit", <>
          <p className="settings-hint">Works right away, no key needed. Runs on Cloudflare Workers AI.</p>
          {provider === "bookkit" && (
            <select className="field-input" value={INCLUDED.some(m => m.id === llm.selectedModel) ? llm.selectedModel : INCLUDED_DEFAULT_MODEL} onChange={e => void update({ selectedModel: e.target.value })}>
              {INCLUDED.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          )}
        </>)}
        {keyCard("anthropic", "Anthropic", "sk-ant-…")}
        {keyCard("openai", "OpenAI", "sk-proj-…")}
        <p className="settings-hint">Keys stay in this browser and are sent only to your provider, through Bookkit’s server.</p>
        <div className="dialog-actions"><button className="btn btn-primary" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}
