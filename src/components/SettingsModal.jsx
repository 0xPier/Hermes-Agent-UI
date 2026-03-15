import { useState, useEffect } from 'react';
import { Settings, Save, Loader2, CheckCircle, XCircle, AlertTriangle, RefreshCw, X, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './SettingsModal.css';

const PROVIDERS = [
  { value: 'auto', label: 'Auto (recommended)', desc: 'Automatically select best provider' },
  { value: 'openrouter', label: 'OpenRouter', desc: 'Access 100+ models via OpenRouter' },
  { value: 'nous', label: 'Nous Research', desc: 'Nous Portal inference' },
  { value: 'openai-codex', label: 'OpenAI Codex', desc: 'OpenAI Codex API' },
  { value: 'zai', label: 'Z.AI / GLM', desc: 'ZhipuAI GLM models' },
  { value: 'kimi-coding', label: 'Kimi Coding', desc: 'Moonshot Kimi coding models' },
  { value: 'minimax', label: 'MiniMax', desc: 'MiniMax models' },
  { value: 'minimax-cn', label: 'MiniMax (China)', desc: 'MiniMax China region' },
];

const POPULAR_MODELS = {
  'auto': ['anthropic/claude-sonnet-4', 'openai/gpt-4o', 'google/gemini-2.5-pro', 'qwen/qwen-max'],
  'openrouter': ['anthropic/claude-sonnet-4', 'openai/gpt-4o', 'google/gemini-2.5-pro', 'deepseek/deepseek-chat-v3'],
  'nous': ['hermes-3-llama-3.1-405b', 'hermes-3-llama-3.1-70b'],
  'openai-codex': ['o4-mini', 'gpt-4o', 'gpt-4o-mini'],
  'zai': ['glm-4-plus', 'glm-4'],
  'kimi-coding': ['kimi-coding-latest'],
  'minimax': ['MiniMax-Text-01', 'abab6.5s-chat'],
  'minimax-cn': ['MiniMax-Text-01', 'abab6.5s-chat'],
};

const ALL_KEY_PROVIDERS = [
  'anthropic', 'openai', 'google', 'qwen', 'openrouter', 'mistral',
  'cohere', 'groq', 'together', 'fireworks', 'deepseek', 'minimax', 'zai'
];

export default function SettingsModal({ isOpen, onClose, onConfigChange }) {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(null);
  const [provider, setProvider] = useState('auto');
  const [model, setModel] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [saveMessage, setSaveMessage] = useState('');
  const [activeTab, setActiveTab] = useState('model');
  const [keyInputs, setKeyInputs] = useState({});

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/config/full');
      const data = await resp.json();
      setConfig(data);
      setProvider(data.provider || 'auto');
      setModel(data.model || '');
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchConfig();
  }, [isOpen]);

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus(null);

    try {
      if (model.trim()) {
        const modelResp = await fetch('/api/config/model', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: model.trim() }),
        });
        const modelData = await modelResp.json();
        if (modelData.status === 'error') {
          setSaveStatus('error');
          setSaveMessage(modelData.message);
          setSaving(false);
          return;
        }
      }

      const provResp = await fetch('/api/config/provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const provData = await provResp.json();
      if (provData.status === 'error') {
        setSaveStatus('error');
        setSaveMessage(provData.message);
        setSaving(false);
        return;
      }

      setSaveStatus('success');
      setSaveMessage('Configuration saved.');
      if (onConfigChange) onConfigChange({ model: model.trim(), provider });
      setTimeout(() => setSaveStatus(null), 3000);
    } catch {
      setSaveStatus('error');
      setSaveMessage('Failed to save. Is the backend running?');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveKey = async (providerName) => {
    const keyVal = keyInputs[providerName];
    if (!keyVal || !keyVal.trim()) return;

    setSavingKey(providerName);
    setSaveStatus(null);

    try {
      const resp = await fetch('/api/config/apikey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerName, key: keyVal.trim() }),
      });
      const data = await resp.json();
      if (data.status === 'error') {
        setSaveStatus('error');
        setSaveMessage(data.message);
      } else {
        setSaveStatus('success');
        setSaveMessage(`Saved ${providerName} API key.`);
        setKeyInputs(prev => ({ ...prev, [providerName]: '' }));
        fetchConfig();
      }
      setTimeout(() => setSaveStatus(null), 3000);
    } catch {
      setSaveStatus('error');
      setSaveMessage('Failed to save API key.');
    } finally {
      setSavingKey(null);
    }
  };

  if (!isOpen) return null;

  const suggestedModels = POPULAR_MODELS[provider] || [];

  return (
    <AnimatePresence>
      <motion.div
        className="modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          className="modal-content settings-modal-inner"
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        >
          {/* Header */}
          <div className="settings-header">
            <div className="settings-header-left">
              <div className="settings-icon">
                <Settings size={16} />
              </div>
              <h2>Settings</h2>
            </div>
            <button className="icon-btn" onClick={onClose}>
              <X size={18} />
            </button>
          </div>

          <div className="settings-source-badge">
            <Info size={12} />
            Loaded from ~/.hermes/config.yaml
          </div>

          {/* Tabs */}
          <div className="settings-tabs">
            <button className={`settings-tab ${activeTab === 'model' ? 'active' : ''}`} onClick={() => setActiveTab('model')}>Model</button>
            <button className={`settings-tab ${activeTab === 'keys' ? 'active' : ''}`} onClick={() => setActiveTab('keys')}>API Keys</button>
            <button className={`settings-tab ${activeTab === 'system' ? 'active' : ''}`} onClick={() => setActiveTab('system')}>System</button>
          </div>

          {/* Body */}
          <div className="settings-body">
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', gap: '10px', color: 'var(--text-muted)' }}>
                <Loader2 size={20} className="spinner" />
                <span>Loading config...</span>
              </div>
            ) : (
              <>
                {activeTab === 'model' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="settings-section">
                    <div className="cfg-form-group">
                      <label className="cfg-label">Provider</label>
                      <div className="cfg-select-wrapper">
                        <select
                          className="cfg-select"
                          value={provider}
                          onChange={(e) => {
                            setProvider(e.target.value);
                            const models = POPULAR_MODELS[e.target.value] || [];
                            if (models.length > 0) setModel(models[0]);
                          }}
                        >
                          {PROVIDERS.map(p => (
                            <option key={p.value} value={p.value}>{p.label}</option>
                          ))}
                        </select>
                      </div>
                      <span className="cfg-hint">{PROVIDERS.find(p => p.value === provider)?.desc}</span>
                    </div>

                    <div className="cfg-form-group">
                      <label className="cfg-label">Model</label>
                      <input
                        type="text"
                        className="cfg-input"
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        placeholder="e.g. anthropic/claude-sonnet-4"
                      />
                      {suggestedModels.length > 0 && (
                        <div className="cfg-model-chips">
                          {suggestedModels.map(m => (
                            <button
                              key={m}
                              className={`cfg-chip ${model === m ? 'active' : ''}`}
                              onClick={() => setModel(m)}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {saveStatus && (
                      <div className={`cfg-save-status ${saveStatus}`}>
                        {saveStatus === 'success' ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                        {saveMessage}
                      </div>
                    )}

                    <button className="cfg-save-btn" onClick={handleSave} disabled={saving || !model.trim()}>
                      {saving ? <><Loader2 size={16} className="spinner" /> Saving...</> : <><Save size={16} /> Save Configuration</>}
                    </button>
                  </motion.div>
                )}

                {activeTab === 'keys' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="settings-section">
                    <p className="cfg-info">Set or update API keys. Changes apply immediately.</p>

                    {saveStatus && activeTab === 'keys' && (
                      <div className={`cfg-save-status ${saveStatus}`}>
                        {saveStatus === 'success' ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                        {saveMessage}
                      </div>
                    )}

                    {ALL_KEY_PROVIDERS.map((providerName) => {
                      const isConfigured = config?.api_keys?.[providerName];
                      const isSavingThis = savingKey === providerName;

                      return (
                        <div key={providerName} className={`cfg-key-row ${isConfigured ? 'set' : ''}`}>
                          <div className="cfg-key-row-header">
                            <span className="cfg-key-name">
                              {isConfigured ? <CheckCircle size={14} color="var(--success)" /> : <XCircle size={14} color="var(--text-muted)" />}
                              {providerName}
                            </span>
                            <span className={`cfg-key-status ${isConfigured ? 'configured' : ''}`}>
                              {isConfigured ? 'Configured' : 'Not set'}
                            </span>
                          </div>
                          <div className="cfg-key-input-row">
                            <input
                              type="password"
                              placeholder={isConfigured ? '• • • • • • (Enter new to override)' : 'sk-...'}
                              value={keyInputs[providerName] || ''}
                              onChange={(e) => setKeyInputs(prev => ({ ...prev, [providerName]: e.target.value }))}
                              className="cfg-input"
                            />
                            <button
                              className="btn-primary"
                              onClick={() => handleSaveKey(providerName)}
                              disabled={isSavingThis || !(keyInputs[providerName] || '').trim()}
                            >
                              {isSavingThis ? <Loader2 size={14} className="spinner" /> : 'Save'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </motion.div>
                )}

                {activeTab === 'system' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="settings-section">
                    <div className="cfg-info-grid">
                      <div className="cfg-info-item">
                        <span className="cfg-info-label">Terminal Backend</span>
                        <span className="cfg-info-value">{config?.terminal_backend || 'local'}</span>
                      </div>
                      <div className="cfg-info-item">
                        <span className="cfg-info-label">Compression</span>
                        <span className="cfg-info-value">{config?.compression?.enabled ? 'Enabled' : 'Disabled'}</span>
                      </div>
                      <div className="cfg-info-item">
                        <span className="cfg-info-label">Threshold</span>
                        <span className="cfg-info-value">{config?.compression?.threshold ? `${(config.compression.threshold * 100).toFixed(0)}%` : 'N/A'}</span>
                      </div>
                      <div className="cfg-info-item">
                        <span className="cfg-info-label">Summary Model</span>
                        <span className="cfg-info-value">{config?.compression?.model || 'N/A'}</span>
                      </div>
                      <div className="cfg-info-item">
                        <span className="cfg-info-label">Personality</span>
                        <span className="cfg-info-value">{config?.personality || 'default'}</span>
                      </div>
                      <div className="cfg-info-item">
                        <span className="cfg-info-label">Max Turns</span>
                        <span className="cfg-info-value">{config?.max_turns || 60}</span>
                      </div>
                    </div>
                    {config?.personalities?.length > 0 && (
                      <div className="cfg-form-group" style={{ marginTop: '12px' }}>
                        <label className="cfg-label">Available Personalities</label>
                        <div className="cfg-model-chips">
                          {config.personalities.map(p => (
                            <span key={p} className={`cfg-chip ${config?.personality === p ? 'active' : ''}`}>{p}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
