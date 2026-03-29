import { useState, useEffect } from 'react';
import { Check, Wifi, WifiOff, Loader2, ArrowRight, AlertCircle, Server } from 'lucide-react';
import ArcaLogo from './ArcaLogo';
import './ProviderSetup.css';

const PROVIDERS = [
  {
    id: 'ollama',
    name: 'Ollama',
    icon: '🦙',
    description: 'Most popular local model runner. Simple CLI with one-command model downloads.',
    defaultPort: 11434,
    modelPlaceholder: 'qwen3.5:9b',
  },
  {
    id: 'llamacpp',
    name: 'llama.cpp',
    icon: '⚡',
    description: 'Bare-metal C++ inference. Maximum performance with GGUF quantized models.',
    defaultPort: 8080,
    modelPlaceholder: 'Qwen3.5-9B.Q5_K_M.gguf',
  },
  {
    id: 'lmstudio',
    name: 'LM Studio',
    icon: '🔬',
    description: 'Desktop GUI for running local models. Download, configure, and serve with a click.',
    defaultPort: 1234,
    modelPlaceholder: 'qwen3.5-9b',
  },
];

export default function ProviderSetup({ onComplete }) {
  const [selected, setSelected] = useState(null);
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('');
  const [model, setModel] = useState('');
  const [availableModels, setAvailableModels] = useState([]);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok, message }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [useModelDropdown, setUseModelDropdown] = useState(false);

  // When a provider card is selected, prefill defaults
  const handleSelect = (provider) => {
    setSelected(provider.id);
    setPort(String(provider.defaultPort));
    setModel('');
    setAvailableModels([]);
    setTestResult(null);
    setError(null);
    setUseModelDropdown(false);
  };

  // Test connection and discover models
  const handleTest = async () => {
    if (!port) return;
    setTesting(true);
    setTestResult(null);
    setError(null);

    try {
      const resp = await fetch(`/api/config/local-provider/test?host=${encodeURIComponent(host)}&port=${port}`);
      const data = await resp.json();

      if (data.status === 'ok' && data.reachable) {
        setTestResult({ ok: true, message: 'Connected successfully!' });
        if (data.models && data.models.length > 0) {
          setAvailableModels(data.models);
          setUseModelDropdown(true);
          // Auto-select first model if none set
          if (!model) {
            setModel(data.models[0]);
          }
        }
      } else {
        setTestResult({ ok: false, message: data.message || 'Connection failed' });
        setAvailableModels([]);
        setUseModelDropdown(false);
      }
    } catch (err) {
      setTestResult({ ok: false, message: 'Network error — backend unreachable' });
    } finally {
      setTesting(false);
    }
  };

  // Save configuration
  const handleConnect = async () => {
    if (!selected || !model.trim()) return;
    setSaving(true);
    setError(null);

    try {
      const resp = await fetch('/api/config/local-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selected,
          host: host.trim() || 'localhost',
          port: parseInt(port, 10),
          model: model.trim(),
        }),
      });
      const data = await resp.json();

      if (data.status === 'success') {
        onComplete?.({
          provider: selected,
          label: PROVIDERS.find(p => p.id === selected)?.name,
          model: model.trim(),
          port: parseInt(port, 10),
        });
      } else {
        setError(data.message || 'Failed to save configuration');
      }
    } catch (err) {
      setError('Failed to save — backend unreachable');
    } finally {
      setSaving(false);
    }
  };

  const selectedProvider = PROVIDERS.find(p => p.id === selected);
  const canConnect = selected && model.trim();

  return (
    <div className="provider-setup">
      <div className="provider-setup-content">
        {/* Header */}
        <div className="provider-header">
          <div className="provider-header-logo">
            <ArcaLogo size={48} />
          </div>
          <h1>Choose Your Local Engine</h1>
          <p>
            Select which local LLM backend you're running.
            All inference stays on your machine — nothing leaves your network.
          </p>
        </div>

        {/* Provider Cards */}
        <div className="provider-cards">
          {PROVIDERS.map((prov) => (
            <div
              key={prov.id}
              className={`provider-card${selected === prov.id ? ' selected' : ''}`}
              onClick={() => handleSelect(prov)}
            >
              <div className="provider-card-check">
                <Check size={13} strokeWidth={3} />
              </div>
              <div className={`provider-card-icon ${prov.id}`}>
                {prov.icon}
              </div>
              <div className="provider-card-name">{prov.name}</div>
              <div className="provider-card-desc">{prov.description}</div>
              <div className="provider-card-port">:{prov.defaultPort}</div>
            </div>
          ))}
        </div>

        {/* Configuration Form (appears when a provider is selected) */}
        {selected && selectedProvider && (
          <div className="provider-config">
            <div className="provider-config-title">
              <span className="dot" />
              Configure {selectedProvider.name}
            </div>

            {error && (
              <div className="provider-error-toast">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            {/* Host + Port */}
            <div className="provider-field">
              <div className="provider-field-row">
                <div>
                  <label>Host</label>
                  <input
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="localhost"
                  />
                </div>
                <div>
                  <label>Port</label>
                  <input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    placeholder={String(selectedProvider.defaultPort)}
                  />
                </div>
              </div>
            </div>

            {/* Test Connection */}
            <div className="provider-test-row">
              <button
                className="provider-test-btn"
                onClick={handleTest}
                disabled={testing || !port}
              >
                {testing ? (
                  <><Loader2 size={14} className="spinner" /> Testing...</>
                ) : (
                  <><Wifi size={14} /> Test Connection</>
                )}
              </button>
              {testResult && (
                <div className={`provider-test-result ${testResult.ok ? 'success' : 'error'}`}>
                  {testResult.ok ? <Check size={14} /> : <WifiOff size={14} />}
                  {testResult.message}
                </div>
              )}
            </div>

            {/* Model Selection */}
            <div className="provider-field">
              <label>Model</label>
              {useModelDropdown && availableModels.length > 0 ? (
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                >
                  <option value="" disabled>Select a model...</option>
                  {availableModels.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={selectedProvider.modelPlaceholder}
                />
              )}
            </div>

            {/* Connect Button */}
            <button
              className="provider-connect-btn"
              onClick={handleConnect}
              disabled={!canConnect || saving}
            >
              {saving ? (
                <><Loader2 size={16} className="spinner" /> Saving...</>
              ) : (
                <><Server size={16} /> Connect to {selectedProvider.name}</>
              )}
            </button>
          </div>
        )}

        {/* Arca — always local, no skip */}
      </div>
    </div>
  );
}
