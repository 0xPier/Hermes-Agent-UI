import { useState, useEffect } from 'react';
import { Settings, Save, Loader2, CheckCircle, XCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import './ConfigPanel.css';

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

export default function ConfigPanel({ onConfigChange }) {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(null);
  const [provider, setProvider] = useState('auto');
  const [model, setModel] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'success' | 'error'
  const [saveMessage, setSaveMessage] = useState('');
  const [activeTab, setActiveTab] = useState('model');
  const [keyInputs, setKeyInputs] = useState({});

  const ALL_KEY_PROVIDERS = [
    'anthropic', 'openai', 'google', 'qwen', 'openrouter', 'mistral',
    'cohere', 'groq', 'together', 'fireworks', 'deepseek', 'minimax', 'zai'
  ];

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

  useEffect(() => { fetchConfig(); }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus(null);

    try {
      // Save model
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

      // Save provider
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
      setSaveMessage('Configuration saved successfully.');
      if (onConfigChange) onConfigChange({ model: model.trim(), provider });

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
        fetchConfig(); // refresh to show the new config state
      }
      setTimeout(() => setSaveStatus(null), 3000);
    } catch {
      setSaveStatus('error');
      setSaveMessage('Failed to save API key.');
    } finally {
      setSavingKey(null);
    }
  };

  const suggestedModels = POPULAR_MODELS[provider] || [];

  if (loading) {
    return (
      <div className="config-panel">
        <div className="config-loading">
          <Loader2 size={24} className="spinner" color="var(--primary)" />
          <span>Loading configuration...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="config-panel">
      <div className="config-header">
        <Settings size={20} color="var(--primary)" />
        <h3>Configuration</h3>
        <button className="config-refresh-btn" onClick={fetchConfig} title="Refresh">
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="config-tabs">
        <button className={`config-tab ${activeTab === 'model' ? 'active' : ''}`} onClick={() => setActiveTab('model')}>Model</button>
        <button className={`config-tab ${activeTab === 'keys' ? 'active' : ''}`} onClick={() => setActiveTab('keys')}>API Keys</button>
        <button className={`config-tab ${activeTab === 'system' ? 'active' : ''}`} onClick={() => setActiveTab('system')}>System</button>
      </div>

      <div className="config-body">
        {activeTab === 'model' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="config-section">
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="config-section">
            <p className="cfg-info">Set or update API keys. Changes apply immediately.</p>
            
            {saveStatus && activeTab === 'keys' && (
              <div className={`cfg-save-status ${saveStatus}`} style={{ marginBottom: '1rem' }}>
                {saveStatus === 'success' ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                {saveMessage}
              </div>
            )}

            <div className="cfg-keys-list" style={{ marginTop: '1rem' }}>
              {ALL_KEY_PROVIDERS.map((providerName) => {
                const isConfigured = config?.api_keys?.[providerName];
                const isSavingThis = savingKey === providerName;
                
                return (
                  <div key={providerName} className={`cfg-key-row ${isConfigured ? 'set' : ''}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '8px', padding: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div className="cfg-key-icon">
                          {isConfigured ? <CheckCircle size={14} /> : <XCircle size={14} />}
                        </div>
                        <span className="cfg-key-name" style={{ textTransform: 'capitalize', fontWeight: '500' }}>{providerName}</span>
                      </div>
                      <span className="cfg-key-status" style={{ fontSize: '0.75rem' }}>{isConfigured ? 'Configured' : 'Not set'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input 
                        type="password"
                        placeholder={isConfigured ? "• • • • • • • • (Enter new to override)" : "sk-..."}
                        value={keyInputs[providerName] || ''}
                        onChange={(e) => setKeyInputs(prev => ({ ...prev, [providerName]: e.target.value }))}
                        className="cfg-input"
                        style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                      />
                      <button 
                        className="btn-primary" 
                        style={{ padding: '6px 12px', minWidth: '80px', flexShrink: 0 }}
                        onClick={() => handleSaveKey(providerName)}
                        disabled={isSavingThis || !(keyInputs[providerName] || '').trim()}
                      >
                        {isSavingThis ? <Loader2 size={14} className="spinner" /> : 'Save'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {activeTab === 'system' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="config-section">
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
                <span className="cfg-info-label">Compression Threshold</span>
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
              <div className="cfg-form-group" style={{ marginTop: '1rem' }}>
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
      </div>
    </div>
  );
}
