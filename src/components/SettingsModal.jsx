import { useState, useEffect } from 'react';
import { Settings, Save, Loader2, CheckCircle, XCircle, AlertTriangle, RefreshCw, X, Info, Volume2, Mic, VolumeX, MicOff, Code, Cpu, HardDrive, Shield } from 'lucide-react';
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

  // New state for advanced settings
  const [generalSettings, setGeneralSettings] = useState({
    max_turns: 60,
    personality: '',
    display_theme: 'dark',
    notifications_enabled: true,
  });

  const [voiceSettings, setVoiceSettings] = useState({
    stt_enabled: false,
    stt_provider: 'openai',
    tts_enabled: false,
    tts_provider: 'openai',
    voice_pitch: 1.0,
    voice_speed: 1.0,
  });

  const [contextSettings, setContextSettings] = useState({
    memory_char_limit: 10000,
    context_window_size: 8192,
    compression_enabled: true,
    compression_threshold: 0.85,
    summary_model: '',
  });

  const [codeSettings, setCodeSettings] = useState({
    code_execution_enabled: true,
    code_sandbox_enabled: true,
    file_operations_enabled: true,
    dangerous_commands_blocked: true,
    max_file_size: 100000,
  });

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/config/full');
      const data = await resp.json();
      setConfig(data);
      setProvider(data.provider || 'auto');
      setModel(data.model || '');

      // Initialize advanced settings from config
      setGeneralSettings({
        max_turns: data.max_turns || 60,
        personality: data.personality || '',
        display_theme: 'dark',
        notifications_enabled: true,
      });

      setContextSettings({
        memory_char_limit: data.memory?.char_limit || 10000,
        context_window_size: data.context?.window_size || 8192,
        compression_enabled: data.compression?.enabled || true,
        compression_threshold: data.compression?.threshold || 0.85,
        summary_model: data.compression?.model || '',
      });
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

  const handleSaveAdvancedSettings = async () => {
    setSaving(true);
    setSaveStatus(null);

    try {
      // Prepare configuration updates
      const configUpdates = {};

      // General settings
      if (generalSettings.max_turns !== 60) {
        configUpdates['max_turns'] = generalSettings.max_turns;
      }
      if (generalSettings.personality) {
        configUpdates['personality'] = generalSettings.personality;
      }

      // Context settings
      if (contextSettings.memory_char_limit !== 10000) {
        configUpdates['memory.char_limit'] = contextSettings.memory_char_limit;
      }
      if (contextSettings.context_window_size !== 8192) {
        configUpdates['context.window_size'] = contextSettings.context_window_size;
      }
      if (contextSettings.compression_enabled !== true) {
        configUpdates['compression.enabled'] = contextSettings.compression_enabled;
      }
      if (contextSettings.compression_threshold !== 0.85) {
        configUpdates['compression.threshold'] = contextSettings.compression_threshold;
      }
      if (contextSettings.summary_model) {
        configUpdates['compression.summary_model'] = contextSettings.summary_model;
      }

      // Voice settings
      if (voiceSettings.stt_enabled !== false) {
        configUpdates['stt.enabled'] = voiceSettings.stt_enabled;
      }
      if (voiceSettings.stt_provider !== 'openai') {
        configUpdates['stt.provider'] = voiceSettings.stt_provider;
      }
      if (voiceSettings.tts_enabled !== false) {
        configUpdates['tts.enabled'] = voiceSettings.tts_enabled;
      }
      if (voiceSettings.tts_provider !== 'openai') {
        configUpdates['tts.provider'] = voiceSettings.tts_provider;
      }

      // Code execution settings
      if (codeSettings.code_execution_enabled !== true) {
        configUpdates['code_execution.enabled'] = codeSettings.code_execution_enabled;
      }
      if (codeSettings.code_sandbox_enabled !== true) {
        configUpdates['code_execution.sandbox'] = codeSettings.code_sandbox_enabled;
      }
      if (codeSettings.file_operations_enabled !== true) {
        configUpdates['file_operations.enabled'] = codeSettings.file_operations_enabled;
      }
      if (codeSettings.dangerous_commands_blocked !== true) {
        configUpdates['security.block_dangerous_commands'] = codeSettings.dangerous_commands_blocked;
      }
      if (codeSettings.max_file_size !== 10000000) {
        configUpdates['file_operations.max_file_size'] = codeSettings.max_file_size;
      }

      // Send all updates to the new endpoint
      if (Object.keys(configUpdates).length > 0) {
        const resp = await fetch('/api/config/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: configUpdates }),
        });
        const result = await resp.json();

        if (result.status === 'error') {
          setSaveStatus('error');
          setSaveMessage(result.message);
          setSaving(false);
          return;
        }
      }

      setSaveStatus('success');
      setSaveMessage('Advanced settings saved.');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (error) {
      setSaveStatus('error');
      setSaveMessage('Failed to save advanced settings. Is the backend running?');
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
            <button className={`settings-tab ${activeTab === 'model' ? 'active' : ''}`} onClick={() => setActiveTab('model')}>
              Model
            </button>
            <button className={`settings-tab ${activeTab === 'keys' ? 'active' : ''}`} onClick={() => setActiveTab('keys')}>
              API Keys
            </button>
            <button className={`settings-tab ${activeTab === 'general' ? 'active' : ''}`} onClick={() => setActiveTab('general')}>
              General
            </button>
            <button className={`settings-tab ${activeTab === 'voice' ? 'active' : ''}`} onClick={() => setActiveTab('voice')}>
              Voice
            </button>
            <button className={`settings-tab ${activeTab === 'context' ? 'active' : ''}`} onClick={() => setActiveTab('context')}>
              Context
            </button>
            <button className={`settings-tab ${activeTab === 'code' ? 'active' : ''}`} onClick={() => setActiveTab('code')}>
              Code Execution
            </button>
            <button className={`settings-tab ${activeTab === 'system' ? 'active' : ''}`} onClick={() => setActiveTab('system')}>
              System
            </button>
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
                              placeholder={isConfigured ? '• • • • (Enter new to override)' : 'sk-...'}
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

                {activeTab === 'general' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="settings-section">
                    <h3 className="cfg-label">General Settings</h3>

                    <div className="cfg-form-group">
                      <label className="cfg-label">Max Turns</label>
                      <input
                        type="number"
                        className="cfg-input"
                        value={generalSettings.max_turns}
                        onChange={(e) => setGeneralSettings(prev => ({ ...prev, max_turns: parseInt(e.target.value) || 60 }))}
                        placeholder="60"
                      />
                      <span className="cfg-hint">Maximum number of conversation turns before reset</span>
                    </div>

                    <div className="cfg-form-group">
                      <label className="cfg-label">Personality</label>
                      <input
                        type="text"
                        className="cfg-input"
                        value={generalSettings.personality}
                        onChange={(e) => setGeneralSettings(prev => ({ ...prev, personality: e.target.value }))}
                        placeholder="default"
                      />
                      <span className="cfg-hint">Default personality for the agent</span>
                    </div>

                    <div className="cfg-form-group">
                      <label className="cfg-label">Theme</label>
                      <select
                        className="cfg-select"
                        value={generalSettings.display_theme}
                        onChange={(e) => setGeneralSettings(prev => ({ ...prev, display_theme: e.target.value }))}
                      >
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                        <option value="auto">Auto</option>
                      </select>
                    </div>

                    <div className="cfg-form-group">
                      <label className="cfg-checkbox">
                        <input
                          type="checkbox"
                          checked={generalSettings.notifications_enabled}
                          onChange={(e) => setGeneralSettings(prev => ({ ...prev, notifications_enabled: e.target.checked }))}
                        />
                        <span>Enable Notifications</span>
                      </label>
                    </div>

                    <button className="cfg-save-btn" onClick={handleSaveAdvancedSettings} disabled={saving}>
                      {saving ? <><Loader2 size={16} className="spinner" /> Saving...</> : <><Save size={16} /> Save General Settings</>}
                    </button>
                  </motion.div>
                )}

                {activeTab === 'voice' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="settings-section">
                    <h3 className="cfg-label">Voice Settings</h3>

                    <div className="cfg-form-group">
                      <label className="cfg-checkbox">
                        <input
                          type="checkbox"
                          checked={voiceSettings.stt_enabled}
                          onChange={(e) => setVoiceSettings(prev => ({ ...prev, stt_enabled: e.target.checked }))}
                        />
                        <span className="cfg-checkbox-icon">{voiceSettings.stt_enabled ? <Mic size={14} /> : <MicOff size={14} />}</span>
                        <span>Speech-to-Text Enabled</span>
                      </label>
                    </div>

                    {voiceSettings.stt_enabled && (
                      <div className="cfg-form-group">
                        <label className="cfg-label">STT Provider</label>
                        <select
                          className="cfg-select"
                          value={voiceSettings.stt_provider}
                          onChange={(e) => setVoiceSettings(prev => ({ ...prev, stt_provider: e.target.value }))}
                        >
                          <option value="openai">OpenAI</option>
                          <option value="google">Google</option>
                          <option value="azure">Azure</option>
                        </select>
                      </div>
                    )}

                    <div className="cfg-form-group">
                      <label className="cfg-checkbox">
                        <input
                          type="checkbox"
                          checked={voiceSettings.tts_enabled}
                          onChange={(e) => setVoiceSettings(prev => ({ ...prev, tts_enabled: e.target.checked }))}
                        />
                        <span className="cfg-checkbox-icon">{voiceSettings.tts_enabled ? <Volume2 size={14} /> : <VolumeX size={14} />}</span>
                        <span>Text-to-Speech Enabled</span>
                      </label>
                    </div>

                    {voiceSettings.tts_enabled && (
                      <>
                        <div className="cfg-form-group">
                          <label className="cfg-label">TTS Provider</label>
                          <select
                            className="cfg-select"
                            value={voiceSettings.tts_provider}
                            onChange={(e) => setVoiceSettings(prev => ({ ...prev, tts_provider: e.target.value }))}
                          >
                            <option value="openai">OpenAI</option>
                            <option value="google">Google</option>
                            <option value="azure">Azure</option>
                          </select>
                        </div>

                        <div className="cfg-form-group">
                          <label className="cfg-label">Voice Pitch</label>
                          <input
                            type="range"
                            min="0.5"
                            max="2.0"
                            step="0.1"
                            value={voiceSettings.voice_pitch}
                            onChange={(e) => setVoiceSettings(prev => ({ ...prev, voice_pitch: parseFloat(e.target.value) }))}
                            className="cfg-slider"
                          />
                          <span className="cfg-hint">{voiceSettings.voice_pitch}x</span>
                        </div>

                        <div className="cfg-form-group">
                          <label className="cfg-label">Voice Speed</label>
                          <input
                            type="range"
                            min="0.5"
                            max="2.0"
                            step="0.1"
                            value={voiceSettings.voice_speed}
                            onChange={(e) => setVoiceSettings(prev => ({ ...prev, voice_speed: parseFloat(e.target.value) }))}
                            className="cfg-slider"
                          />
                          <span className="cfg-hint">{voiceSettings.voice_speed}x</span>
                        </div>
                      </>
                    )}

                    <button className="cfg-save-btn" onClick={handleSaveAdvancedSettings} disabled={saving}>
                      {saving ? <><Loader2 size={16} className="spinner" /> Saving...</> : <><Save size={16} /> Save Voice Settings</>}
                    </button>
                  </motion.div>
                )}

                {activeTab === 'context' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="settings-section">
                    <h3 className="cfg-label">Context Settings</h3>

                    <div className="cfg-form-group">
                      <label className="cfg-label">Memory Character Limit</label>
                      <input
                        type="number"
                        className="cfg-input"
                        value={contextSettings.memory_char_limit}
                        onChange={(e) => setContextSettings(prev => ({ ...prev, memory_char_limit: parseInt(e.target.value) || 10000 }))}
                        placeholder="10000"
                      />
                      <span className="cfg-hint">Maximum characters to keep in memory</span>
                    </div>

                    <div className="cfg-form-group">
                      <label className="cfg-label">Context Window Size</label>
                      <input
                        type="number"
                        className="cfg-input"
                        value={contextSettings.context_window_size}
                        onChange={(e) => setContextSettings(prev => ({ ...prev, context_window_size: parseInt(e.target.value) || 8192 }))}
                        placeholder="8192"
                      />
                      <span className="cfg-hint">Size of context window for the model</span>
                    </div>

                    <div className="cfg-form-group">
                      <label className="cfg-checkbox">
                        <input
                          type="checkbox"
                          checked={contextSettings.compression_enabled}
                          onChange={(e) => setContextSettings(prev => ({ ...prev, compression_enabled: e.target.checked }))}
                        />
                        <span>Enable Compression</span>
                      </label>
                    </div>

                    {contextSettings.compression_enabled && (
                      <>
                        <div className="cfg-form-group">
                          <label className="cfg-label">Compression Threshold</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0.1"
                            max="1.0"
                            className="cfg-input"
                            value={contextSettings.compression_threshold}
                            onChange={(e) => setContextSettings(prev => ({ ...prev, compression_threshold: parseFloat(e.target.value) || 0.85 }))}
                            placeholder="0.85"
                          />
                          <span className="cfg-hint">Compression ratio threshold (0.1-1.0)</span>
                        </div>

                        <div className="cfg-form-group">
                          <label className="cfg-label">Summary Model</label>
                          <input
                            type="text"
                            className="cfg-input"
                            value={contextSettings.summary_model}
                            onChange={(e) => setContextSettings(prev => ({ ...prev, summary_model: e.target.value }))}
                            placeholder="gpt-4o-mini"
                          />
                          <span className="cfg-hint">Model used for context compression</span>
                        </div>
                      </>
                    )}

                    <button className="cfg-save-btn" onClick={handleSaveAdvancedSettings} disabled={saving}>
                      {saving ? <><Loader2 size={16} className="spinner" /> Saving...</> : <><Save size={16} /> Save Context Settings</>}
                    </button>
                  </motion.div>
                )}

                {activeTab === 'code' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="settings-section">
                    <h3 className="cfg-label">Code Execution Settings</h3>

                    <div className="cfg-form-group">
                      <label className="cfg-checkbox">
                        <input
                          type="checkbox"
                          checked={codeSettings.code_execution_enabled}
                          onChange={(e) => setCodeSettings(prev => ({ ...prev, code_execution_enabled: e.target.checked }))}
                        />
                        <span className="cfg-checkbox-icon"><Code size={14} /></span>
                        <span>Enable Code Execution</span>
                      </label>
                    </div>

                    <div className="cfg-form-group">
                      <label className="cfg-checkbox">
                        <input
                          type="checkbox"
                          checked={codeSettings.code_sandbox_enabled}
                          onChange={(e) => setCodeSettings(prev => ({ ...prev, code_sandbox_enabled: e.target.checked }))}
                        />
                        <span className="cfg-checkbox-icon"><Shield size={14} /></span>
                        <span>Enable Sandbox Mode</span>
                      </label>
                    </div>

                    <div className="cfg-form-group">
                      <label className="cfg-checkbox">
                        <input
                          type="checkbox"
                          checked={codeSettings.file_operations_enabled}
                          onChange={(e) => setCodeSettings(prev => ({ ...prev, file_operations_enabled: e.target.checked }))}
                        />
                        <span className="cfg-checkbox-icon"><HardDrive size={14} /></span>
                        <span>Allow File Operations</span>
                      </label>
                    </div>

                    <div className="cfg-form-group">
                      <label className="cfg-checkbox">
                        <input
                          type="checkbox"
                          checked={codeSettings.dangerous_commands_blocked}
                          onChange={(e) => setCodeSettings(prev => ({ ...prev, dangerous_commands_blocked: e.target.checked }))}
                        />
                        <span>Block Dangerous Commands</span>
                      </label>
                    </div>

                    <div className="cfg-form-group">
                      <label className="cfg-label">Max File Size (bytes)</label>
                      <input
                        type="number"
                        className="cfg-input"
                        value={codeSettings.max_file_size}
                        onChange={(e) => setCodeSettings(prev => ({ ...prev, max_file_size: parseInt(e.target.value) || 10000000 }))}
                        placeholder="10000000"
                      />
                      <span className="cfg-hint">Maximum file size for operations (10MB default)</span>
                    </div>

                    <button className="cfg-save-btn" onClick={handleSaveAdvancedSettings} disabled={saving}>
                      {saving ? <><Loader2 size={16} className="spinner" /> Saving...</> : <><Save size={16} /> Save Code Settings</>}
                    </button>
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
