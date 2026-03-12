import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Database, Key, CheckCircle, XCircle, ArrowRight, Loader2, Play, AlertTriangle, Settings, ChevronDown } from 'lucide-react';
import './GuidedInstallation.css';

const steps = [
  { id: 1, title: 'Welcome' },
  { id: 2, title: 'Verify' },
  { id: 3, title: 'Model' },
  { id: 4, title: 'Ready' }
];

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

export default function GuidedInstallation({ onComplete }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [direction, setDirection] = useState(1);

  // Real health check state
  const [checking, setChecking] = useState(false);
  const [healthData, setHealthData] = useState(null);
  const [healthError, setHealthError] = useState(null);

  // Model/provider selection state
  const [selectedProvider, setSelectedProvider] = useState('auto');
  const [selectedModel, setSelectedModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiKeys, setApiKeys] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Helper to determine the actual provider required (resolves 'auto' by looking at model prefix)
  const getRequiredProvider = () => {
    if (selectedProvider !== 'auto') return selectedProvider;
    if (!selectedModel) return null;
    const prefix = selectedModel.split('/')[0];
    const map = {
      'anthropic': 'anthropic',
      'openai': 'openai',
      'google': 'google',
      'qwen': 'qwen',
      'meta-llama': 'openrouter', // fallback example
    };
    return map[prefix] || prefix;
  };

  const requiredProvider = getRequiredProvider();
  const isKeyConfigured = requiredProvider ? apiKeys[requiredProvider.toLowerCase()] || apiKeys[requiredProvider] || false : false;

  useEffect(() => {
    if (currentStep === 2) {
      runHealthCheck();
    }
  }, [currentStep]);

  const nextStep = () => {
    if (currentStep < 4) {
      setDirection(1);
      setCurrentStep(prev => prev + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setDirection(-1);
      setCurrentStep(prev => prev - 1);
    }
  };

  const runHealthCheck = async () => {
    setChecking(true);
    setHealthData(null);
    setHealthError(null);

    try {
      const resp = await fetch('/api/health');
      if (!resp.ok) throw new Error(`Backend returned ${resp.status}`);
      const data = await resp.json();
      setHealthData(data);

      if (data.installed && (data.status === 'ready' || data.status === 'degraded')) {
        // Pre-fill model & provider from config
        if (data.model) setSelectedModel(data.model);
        if (data.provider) setSelectedProvider(data.provider);

        // Also fetch full config for API key status
        try {
          const cfgResp = await fetch('/api/config/full');
          const cfgData = await cfgResp.json();
          if (cfgData.api_keys) setApiKeys(cfgData.api_keys);
        } catch {}

        // Auto-advance to model selection after a brief pause
        setTimeout(() => {
          setDirection(1);
          setCurrentStep(3);
        }, 1500);
      }
    } catch (err) {
      setHealthError(
        'Could not reach the backend. Make sure the FastAPI server is running on port 8000.'
      );
    } finally {
      setChecking(false);
    }
  };

  const handleVerify = () => {
    nextStep();
    runHealthCheck();
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    setSaveError(null);

    try {
      // Save model
      if (selectedModel.trim()) {
        const modelResp = await fetch('/api/config/model', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: selectedModel.trim() }),
        });
        const modelData = await modelResp.json();
        if (modelData.status === 'error') {
          setSaveError(modelData.message);
          setSaving(false);
          return;
        }
      }

      // Save provider
      const provResp = await fetch('/api/config/provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: selectedProvider }),
      });
      const provData = await provResp.json();
      if (provData.status === 'error') {
        setSaveError(provData.message);
        setSaving(false);
        return;
      }

      // Save API Key if provided
      if (requiredProvider && apiKey.trim()) {
        const keyResp = await fetch('/api/config/apikey', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: requiredProvider, key: apiKey.trim() }),
        });
        const keyData = await keyResp.json();
        if (keyData.status === 'error') {
          setSaveError(keyData.message);
          setSaving(false);
          return;
        }
      }

      nextStep();
    } catch (err) {
      setSaveError('Failed to save configuration. Is the backend running?');
    } finally {
      setSaving(false);
    }
  };

  const suggestedModels = POPULAR_MODELS[selectedProvider] || [];

  const variants = {
    enter: (direction) => ({
      x: direction > 0 ? 50 : -50,
      opacity: 0
    }),
    center: {
      x: 0,
      opacity: 1
    },
    exit: (direction) => ({
      x: direction < 0 ? 50 : -50,
      opacity: 0
    })
  };

  return (
    <div className="installation-wrapper">
      <div className="installation-card">

        {/* Step Indicator */}
        <div className="step-indicator">
          {steps.map(step => (
            <div
              key={step.id}
              className={`step-dot ${currentStep === step.id ? 'active' : ''} ${currentStep > step.id ? 'completed' : ''}`}
            >
              {currentStep > step.id ? <CheckCircle size={16} /> : step.id}
            </div>
          ))}
        </div>

        {/* Dynamic Content */}
        <div style={{ position: 'relative', minHeight: '380px' }}>
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentStep}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              style={{ width: '100%' }}
            >

              {/* ── Step 1: Welcome ── */}
              {currentStep === 1 && (
                <div className="step-content">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                    <div style={{ background: 'rgba(34, 168, 204, 0.1)', padding: '12px', borderRadius: '12px' }}>
                      <Terminal color="var(--primary)" size={32} />
                    </div>
                    <h2 className="step-title heading-gradient">Welcome to Hermes UI</h2>
                  </div>
                  <p className="step-description">
                    A web interface for the <strong>Hermes Agent</strong> — the autonomous AI agent by Nous Research.
                  </p>
                  <p className="step-description" style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    This setup will verify your Hermes CLI installation and configure your model & provider.
                  </p>
                  <div style={{ marginTop: '2rem' }}>
                    <button className="btn-primary" onClick={handleVerify}>
                      Verify Installation <ArrowRight size={18} />
                    </button>
                  </div>
                </div>
              )}

              {/* ── Step 2: Real Verification ── */}
              {currentStep === 2 && (
                <div className="step-content">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                    <div style={{ background: 'rgba(34, 168, 204, 0.1)', padding: '12px', borderRadius: '12px' }}>
                      <Database color="var(--primary)" size={32} />
                    </div>
                    <h2 className="step-title heading-gradient">System Check</h2>
                    {checking && <Loader2 className="spinner" color="var(--primary)" />}
                  </div>

                  <div className="terminal-window">
                    <div className="log-line">
                      <span style={{ color: '#52525b' }}>$</span>
                      <span>hermes doctor</span>
                    </div>

                    {checking && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="log-line log-info">
                        <span style={{ color: '#52525b' }}>{'>'}</span>
                        <span>Running diagnostics...</span>
                      </motion.div>
                    )}

                    {healthError && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="log-line log-error">
                        <span style={{ color: '#52525b' }}>{'>'}</span>
                        <span>{healthError}</span>
                      </motion.div>
                    )}

                    {healthData && !healthData.installed && (
                      <>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="log-line log-error">
                          <span><XCircle size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />Hermes CLI not found in PATH</span>
                        </motion.div>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="log-line log-warning" style={{ marginTop: '0.5rem' }}>
                          <span style={{ color: 'var(--warning)' }}>
                            Install it with: <code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>pip install hermes-agent</code>
                          </span>
                        </motion.div>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="log-line" style={{ marginTop: '0.25rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>
                            Or set HERMES_AGENT_CMD env var if installed elsewhere.
                          </span>
                        </motion.div>
                      </>
                    )}

                    {healthData && healthData.installed && (
                      <>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="log-line log-success">
                          <span>✓ Hermes CLI found at {healthData.binary}</span>
                        </motion.div>
                        {healthData.version && (
                          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="log-line log-success">
                            <span>✓ Version: {healthData.version}</span>
                          </motion.div>
                        )}
                        {healthData.details && healthData.details.slice(0, 8).map((d, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: i * 0.05 }}
                            className={`log-line ${d.ok ? (d.warn ? 'log-warning' : 'log-success') : 'log-error'}`}
                          >
                            <span>{d.ok ? (d.warn ? '⚠' : '✓') : '✗'} {d.text}</span>
                          </motion.div>
                        ))}
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="log-line log-info" style={{ marginTop: '0.5rem' }}>
                          <span>Proceeding to model selection...</span>
                        </motion.div>
                      </>
                    )}
                  </div>

                  {/* Retry / back buttons if not installed */}
                  {healthData && !healthData.installed && (
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                      <button className="btn-secondary" onClick={prevStep}>Back</button>
                      <button className="btn-primary" onClick={runHealthCheck}>Retry Check</button>
                    </div>
                  )}
                  {healthError && (
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                      <button className="btn-secondary" onClick={prevStep}>Back</button>
                      <button className="btn-primary" onClick={runHealthCheck}>Retry</button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Step 3: Model & Provider Selection ── */}
              {currentStep === 3 && (
                <div className="step-content">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                    <div style={{ background: 'rgba(34, 168, 204, 0.1)', padding: '12px', borderRadius: '12px' }}>
                      <Settings color="var(--primary)" size={32} />
                    </div>
                    <h2 className="step-title heading-gradient">Model & Provider</h2>
                  </div>

                  <p className="step-description" style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                    Select your inference provider and model. This is equivalent to running <code style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: '4px' }}>hermes model</code>.
                  </p>

                  {/* Provider Select */}
                  <div className="form-group">
                    <label className="form-label">Provider</label>
                    <div className="select-wrapper">
                      <select
                        className="form-select"
                        value={selectedProvider}
                        onChange={(e) => {
                          setSelectedProvider(e.target.value);
                          // Auto-suggest first model for the provider
                          const models = POPULAR_MODELS[e.target.value] || [];
                          if (models.length > 0) setSelectedModel(models[0]);
                        }}
                      >
                        {PROVIDERS.map(p => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                    </div>
                    <span className="form-hint">
                      {PROVIDERS.find(p => p.value === selectedProvider)?.desc}
                    </span>
                  </div>

                  {/* Model Input */}
                  <div className="form-group">
                    <label className="form-label">Model</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. anthropic/claude-sonnet-4"
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                    />
                    {suggestedModels.length > 0 && (
                      <div className="model-suggestions">
                        {suggestedModels.map(m => (
                          <button
                            key={m}
                            className={`model-chip ${selectedModel === m ? 'active' : ''}`}
                            onClick={() => setSelectedModel(m)}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* API Key Input */}
                  {requiredProvider && (
                    <div className="form-group" style={{ marginTop: '1rem', padding: '12px', background: 'rgba(34, 168, 204, 0.05)', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(34, 168, 204, 0.1)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <label className="form-label" style={{ marginBottom: 0 }}>
                          {requiredProvider.charAt(0).toUpperCase() + requiredProvider.slice(1)} API Key
                        </label>
                        {isKeyConfigured && !apiKey && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle size={12} /> Key Configured
                          </span>
                        )}
                      </div>
                      <input
                        type="password"
                        className="form-input"
                        placeholder={isKeyConfigured ? "• • • • • • • • (Leave blank to keep existing)" : `sk-...`}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        style={{ background: 'var(--bg-base)' }}
                      />
                      <span className="form-hint" style={{ marginTop: '6px' }}>
                        Required to use {selectedModel || requiredProvider}
                      </span>
                    </div>
                  )}

                  {/* Built-in API Key Status Grid (Optional overview) */}
                  {Object.keys(apiKeys).length > 0 && (
                    <div className="api-key-status">
                      <label className="form-label" style={{ marginBottom: '0.5rem' }}>API Keys</label>
                      <div className="api-key-grid">
                        {Object.entries(apiKeys).map(([name, set]) => (
                          <div key={name} className={`api-key-item ${set ? 'configured' : ''}`}>
                            {set ? <CheckCircle size={12} /> : <XCircle size={12} />}
                            <span>{name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {saveError && (
                    <div className="save-error">
                      <AlertTriangle size={14} /> {saveError}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                    <button className="btn-secondary" onClick={prevStep}>Back</button>
                    <button
                      className="btn-primary"
                      onClick={handleSaveConfig}
                      disabled={saving || !selectedModel.trim()}
                    >
                      {saving ? <><Loader2 size={16} className="spinner" /> Saving...</> : <>Save & Continue <ArrowRight size={18} /></>}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Step 4: Ready ── */}
              {currentStep === 4 && (
                <div className="step-content" style={{ textAlign: 'center', alignItems: 'center', paddingTop: '1rem' }}>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", bounce: 0.5 }}
                    style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '24px', borderRadius: '50%', marginBottom: '1rem' }}
                  >
                    <CheckCircle color="var(--success)" size={48} />
                  </motion.div>
                  <h2 className="step-title heading-gradient">Hermes is Ready</h2>
                  <p className="step-description">
                    {selectedModel
                      ? <>Using <strong>{selectedModel}</strong> via <strong>{selectedProvider}</strong> provider.</>
                      : 'Hermes Agent is configured and ready for commands.'}
                  </p>
                  <div className="ready-config-summary">
                    <div className="config-summary-row">
                      <span className="config-label">Provider</span>
                      <span className="config-value">{PROVIDERS.find(p => p.value === selectedProvider)?.label || selectedProvider}</span>
                    </div>
                    <div className="config-summary-row">
                      <span className="config-label">Model</span>
                      <span className="config-value">{selectedModel || 'Default'}</span>
                    </div>
                  </div>

                  <div style={{ marginTop: '2rem', width: '100%' }}>
                    <button className="btn-primary" onClick={() => onComplete({ model: selectedModel, provider: selectedProvider })} style={{ display: 'flex', justifyContent: 'center' }}>
                      <Play size={18} fill="currentColor" /> Enter Chat
                    </button>
                  </div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
}
