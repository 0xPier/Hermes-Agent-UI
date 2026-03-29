import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Server,
  Cloud,
  Terminal,
  Play,
  CheckCircle,
  XCircle,
  MessageSquare,
  ArrowRight,
  Database,
  Lock,
  MessageCircle,
  Hash,
  Activity,
  PhoneCall,
  Settings,
  AlertTriangle,
  Loader2,
  Copy,
} from "lucide-react";
import "./SetupWizard.css";

const stepsList = [
  { id: 1, title: "Installation" },
  { id: 2, title: "Operating Mode" },
  { id: 3, title: "AI Provider" },
  { id: 4, title: "Messaging" },
  { id: 5, title: "Ready" },
];

const CLOUD_PROVIDERS = [
  { value: "auto", label: "Auto (Recommended)", desc: "Uses the best provider automatically" },
  { value: "openrouter", label: "OpenRouter", desc: "Access 100+ models via OpenRouter" },
  { value: "nous", label: "Nous Research", desc: "Nous Portal inference" },
  { value: "openai-codex", label: "OpenAI Codex", desc: "OpenAI Codex API" },
  { value: "huggingface", label: "Hugging Face", desc: "Hugging Face Inference URL" },
  { value: "zai", label: "Z.AI / GLM", desc: "ZhipuAI GLM models" },
  { value: "kimi-coding", label: "Kimi Coding", desc: "Moonshot Kimi coding models" },
  { value: "minimax", label: "MiniMax", desc: "MiniMax models" },
];

const POPULAR_CLOUD_MODELS = {
  auto: ["anthropic/claude-sonnet-4.6", "openai/gpt-4o", "google/gemini-pro"],
  openrouter: ["anthropic/claude-sonnet-4.6", "openai/gpt-4o", "deepseek/deepseek-chat-v3"],
  nous: ["hermes-3-llama-3.1-405b", "hermes-3-llama-3.1-70b"],
  "openai-codex": ["o4-mini", "gpt-4o"],
  huggingface: ["Qwen/Qwen2.5-Coder-32B-Instruct", "meta-llama/Llama-3.1-8B-Instruct"],
  zai: ["glm-4-plus", "glm-4"],
  "kimi-coding": ["kimi-coding-latest"],
  minimax: ["MiniMax-Text-01"],
};

const LOCAL_PROVIDERS = [
  {
    value: "ollama",
    label: "Ollama",
    defaultPort: 11434,
    desc: "Run open-source models locally (Llama 3, Qwen, Mistral)",
  },
  {
    value: "llamacpp",
    label: "llama.cpp",
    defaultPort: 8080,
    desc: "Optimized GGUF inference (llama-server)",
  },
  {
    value: "lmstudio",
    label: "LM Studio",
    defaultPort: 1234,
    desc: "Desktop app with local server API",
  },
];

export default function SetupWizard({ onComplete }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [loading, setLoading] = useState(false);

  // Health
  const [isInstalled, setIsInstalled] = useState(false);
  const [installChecked, setInstallChecked] = useState(false);
  const [installCmds, setInstallCmds] = useState({ cli: "", docker: "" });
  const [installTab, setInstallTab] = useState("cli");

  // Mode & Provider Config
  const [mode, setMode] = useState("cloud"); // 'cloud' or 'local'
  
  // Cloud context
  const [cloudProvider, setCloudProvider] = useState("auto");
  const [cloudModel, setCloudModel] = useState(POPULAR_CLOUD_MODELS.auto[0]);
  const [cloudApiKey, setCloudApiKey] = useState("");

  // Local context
  const [localProvider, setLocalProvider] = useState("ollama");
  const [localHost, setLocalHost] = useState("localhost");
  const [localPort, setLocalPort] = useState(11434);
  const [localReachable, setLocalReachable] = useState(false);
  const [localModels, setLocalModels] = useState([]);
  const [localSelectedModel, setLocalSelectedModel] = useState("");
  const [testingLocal, setTestingLocal] = useState(false);
  const [localError, setLocalError] = useState("");

  // Gateway status
  const [platformStatus, setPlatformStatus] = useState({
    telegram: false,
    discord: false,
    whatsapp: false,
    signal: false
  });
  const [expandedPlatform, setExpandedPlatform] = useState(null);

  // Overall settings result
  const [configResult, setConfigResult] = useState(null);

  useEffect(() => {
    checkHealth();
    fetchInstallCmds();
    checkGatewayStatus();
  }, []);

  const checkHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      setIsInstalled(data.installed);
      setInstallChecked(true);

      if (data.installed && currentStep === 1) {
        nextStep(2); // Auto skip if already installed
      }
    } catch {
      setIsInstalled(false);
      setInstallChecked(true);
    } finally {
      setLoading(false);
    }
  };

  const fetchInstallCmds = async () => {
    try {
      const res = await fetch("/api/hermes/install-cmd");
      const data = await res.json();
      setInstallCmds(data);
    } catch (e) {
      console.error(e);
    }
  };

  const checkGatewayStatus = async () => {
    try {
      const res = await fetch("/api/gateway/status");
      const data = await res.json();
      if (data.platforms) setPlatformStatus(data.platforms);
    } catch (e) {
      console.error(e);
    }
  };

  const nextStep = (targetStep = currentStep + 1) => {
    setDirection(1);
    setCurrentStep(targetStep);
  };

  const prevStep = () => {
    setDirection(-1);
    setCurrentStep(Math.max(1, currentStep - 1));
  };

  const handleTestLocalProvider = async () => {
    setTestingLocal(true);
    setLocalError("");
    setLocalReachable(false);
    setLocalModels([]);
    try {
      const res = await fetch(`/api/config/local-provider/test?host=${encodeURIComponent(localHost)}&port=${localPort}`);
      const data = await res.json();
      if (data.status === "ok") {
        setLocalReachable(true);
        setLocalModels(data.models);
        if (data.models.length > 0) {
          setLocalSelectedModel(data.models[0]);
        }
      } else {
        setLocalError(data.message);
      }
    } catch (e) {
      setLocalError(e.message);
    } finally {
      setTestingLocal(false);
    }
  };

  const handleSaveProvider = async () => {
    setLoading(true);
    
    if (mode === "cloud") {
      try {
        const payload = {
          provider: cloudProvider,
          model: cloudModel,
          api_key: cloudApiKey,
        };
        const res = await fetch("/api/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.status === "success" || data.status === "ok") {
          setConfigResult({ provider: cloudProvider, model: cloudModel });
          nextStep(4);
        } else {
          alert("Error: " + JSON.stringify(data));
        }
      } catch (err) {
        alert("Failed to save config: " + err.message);
      }
    } else {
      // Local
      try {
        const payload = {
          provider: localProvider,
          host: localHost,
          port: localPort,
          model: localSelectedModel
        };
        const res = await fetch("/api/config/local-provider", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.status === "success" || data.status === "ok") {
          setConfigResult({ provider: "custom", model: localSelectedModel });
          nextStep(4);
        } else {
          alert("Error saving local provider: " + data.message);
        }
      } catch (err) {
        alert("Failed to save local config: " + err.message);
      }
    }
    setLoading(false);
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="step-container">
            <div className="step-header">
              <h1>Welcome to Hermes Agent</h1>
              <p>Checking your system installation...</p>
            </div>
            
            {loading || !installChecked ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
                <Loader2 className="spinner" size={32} />
              </div>
            ) : isInstalled ? (
              <div className="status-card" style={{ borderColor: 'var(--success)', background: 'var(--success-bg)' }}>
                <div className="status-row success">
                  <CheckCircle size={24} />
                  <div>
                    <strong>Hermes Agent is installed</strong>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      Ready to configure your provider.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="status-card">
                <div className="status-row error" style={{ marginBottom: 12 }}>
                  <AlertTriangle size={24} />
                  <strong>Hermes is not installed or not found in PATH</strong>
                </div>
                
                <div className="install-tabs">
                  <div 
                    className={`install-tab ${installTab === "cli" ? "active" : ""}`}
                    onClick={() => setInstallTab("cli")}
                  >
                    Terminal (macOS/Linux/WSL)
                  </div>
                  <div 
                    className={`install-tab ${installTab === "docker" ? "active" : ""}`}
                    onClick={() => setInstallTab("docker")}
                  >
                    Docker (Sandboxed)
                  </div>
                </div>

                <div className="code-block">
                  <button 
                    className="copy-btn" 
                    onClick={() => navigator.clipboard.writeText(installCmds[installTab])}
                  >
                    <Copy size={16} />
                  </button>
                  <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                    {installCmds[installTab] || "Loading command..."}
                  </pre>
                </div>
                
                {installTab === "cli" && (
                  <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0 }}>
                    Run this command in your terminal, then reload your shell (source ~/.zshrc or ~/.bashrc).
                  </p>
                )}

                <div className="wizard-actions" style={{ marginTop: 16 }}>
                  <button className="btn btn-primary" onClick={checkHealth} disabled={loading}>
                    {loading ? <Loader2 size={16} className="spinner"/> : <Activity size={16} />}
                    Check Again
                  </button>
                  <button className="btn btn-secondary" onClick={() => nextStep()}>
                    Skip (I'll do it later)
                  </button>
                </div>
              </div>
            )}
            
            {isInstalled && (
              <div className="wizard-actions">
                <button className="btn btn-primary" onClick={() => nextStep()}>
                  Continue <ArrowRight size={16} />
                </button>
              </div>
            )}
          </div>
        );

      case 2:
        return (
          <div className="step-container">
            <div className="step-header">
              <h1>Choose Operating Mode</h1>
              <p>How do you want to run the AI models?</p>
            </div>
            
            <div className="cards-grid">
              <div 
                className={`option-card ${mode === "cloud" ? "selected" : ""}`}
                onClick={() => setMode("cloud")}
              >
                <div className="option-icon"><Cloud size={24} /></div>
                <div className="option-content">
                  <h3>Cloud API</h3>
                  <p>Fast, reliable inference using OpenRouter, Anthropic, or OpenAI. Requires an API key.</p>
                </div>
              </div>
              
              <div 
                className={`option-card ${mode === "local" ? "selected" : ""}`}
                onClick={() => setMode("local")}
              >
                <div className="option-icon"><Server size={24} /></div>
                <div className="option-content">
                  <h3>Local Engine</h3>
                  <p>100% private inference on your hardware using Ollama, llama.cpp, or LM Studio.</p>
                </div>
              </div>
            </div>

            <div className="wizard-actions">
              <button className="btn btn-secondary" onClick={prevStep}>Back</button>
              <button className="btn btn-primary" onClick={() => nextStep()}>
                Continue Configuration <ArrowRight size={16} />
              </button>
            </div>
          </div>
        );

      case 3:
        if (mode === "cloud") {
          return (
            <div className="step-container">
              <div className="step-header">
                <h1>Cloud Provider Setup</h1>
                <p>Configure your API credentials.</p>
              </div>
              
              <div className="provider-settings">
                <div className="form-group">
                  <label>Provider</label>
                  <select 
                    value={cloudProvider} 
                    onChange={e => {
                      setCloudProvider(e.target.value);
                      if (POPULAR_CLOUD_MODELS[e.target.value]) {
                        setCloudModel(POPULAR_CLOUD_MODELS[e.target.value][0]);
                      }
                    }}
                  >
                    {CLOUD_PROVIDERS.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
                
                <div className="form-group">
                  <label>Initial Model</label>
                  <select value={cloudModel} onChange={e => setCloudModel(e.target.value)}>
                    {(POPULAR_CLOUD_MODELS[cloudProvider] || []).map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                    <option value="custom:other">Other (type manually later)</option>
                  </select>
                </div>
                
                <div className="form-group">
                  <label>API Key {cloudProvider === "auto" && "(OpenRouter Key)"}</label>
                  <input 
                    type="password" 
                    placeholder={`sk-${cloudProvider.substring(0, 3)}...`}
                    value={cloudApiKey}
                    onChange={e => setCloudApiKey(e.target.value)}
                  />
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "4px 0 0 0" }}>
                    Your key is stored locally in ~/.hermes/config.yaml
                  </p>
                </div>
              </div>

              <div className="wizard-actions">
                <button className="btn btn-secondary" onClick={prevStep}>Back</button>
                <button className="btn btn-primary" onClick={handleSaveProvider} disabled={loading || (cloudProvider !== "auto" && !cloudApiKey)}>
                  {loading ? <Loader2 size={16} className="spinner"/> : "Save & Continue"}
                </button>
              </div>
            </div>
          );
        } else {
          // Local Mode
          return (
            <div className="step-container">
              <div className="step-header">
                <h1>Local Provider Setup</h1>
                <p>Connect your local LLM engine.</p>
              </div>

              <div className="cards-grid">
                {LOCAL_PROVIDERS.map(p => (
                  <div 
                    key={p.value}
                    className={`option-card ${localProvider === p.value ? "selected" : ""}`}
                    onClick={() => {
                      setLocalProvider(p.value);
                      setLocalPort(p.defaultPort);
                      setLocalReachable(false);
                      setLocalSelectedModel("");
                    }}
                    style={{ padding: '16px' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Database size={20} />
                      <div className="option-content">
                        <h3 style={{ fontSize: '1rem', margin: 0 }}>{p.label}</h3>
                        <p style={{ fontSize: '0.8rem' }}>Default port: {p.defaultPort}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="provider-settings">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="form-group">
                    <label>Hostname</label>
                    <input value={localHost} onChange={e => setLocalHost(e.target.value)} placeholder="localhost" />
                  </div>
                  <div className="form-group">
                    <label>Port</label>
                    <input type="number" value={localPort} onChange={e => setLocalPort(parseInt(e.target.value) || "")} />
                  </div>
                </div>

                <div className="provider-test-row" style={{ marginTop: '16px', marginBottom: '16px' }}>
                  <button className="test-btn" onClick={handleTestLocalProvider} disabled={testingLocal || !localHost || !localPort}>
                    {testingLocal ? <Loader2 size={16} className="spinner" /> : <Play size={16} />}
                    Test Connection
                  </button>
                  
                  {localReachable && (
                    <span className="status-row success" style={{ fontSize: '0.9rem' }}>
                      <CheckCircle size={16} /> Reachable
                    </span>
                  )}
                  {localError && (
                    <span className="status-row error" style={{ fontSize: '0.9rem' }}>
                      <XCircle size={16} /> {localError}
                    </span>
                  )}
                </div>

                {localReachable && localModels.length > 0 && (
                  <div className="form-group">
                    <label>Discovered Models</label>
                    <select 
                      value={localSelectedModel} 
                      onChange={e => setLocalSelectedModel(e.target.value)}
                    >
                      {localModels.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="wizard-actions">
                <button className="btn btn-secondary" onClick={prevStep}>Back</button>
                <button className="btn btn-primary" onClick={handleSaveProvider} disabled={loading || !localSelectedModel}>
                  {loading ? <Loader2 size={16} className="spinner"/> : "Connect Engine"}
                </button>
              </div>
            </div>
          );
        }

      case 4:
        return (
          <div className="step-container">
            <div className="step-header">
              <h1>Messaging Integrations (Optional)</h1>
              <p>Connect Hermes to your favorite chat apps. You can always do this later.</p>
            </div>
            
            <div className="platforms-list">
              {[
                { id: 'telegram', name: 'Telegram', icon: <MessageCircle size={20} />, instruction: 'hermes gateway setup telegram' },
                { id: 'discord', name: 'Discord', icon: <Hash size={20} />, instruction: 'hermes gateway setup discord' },
                { id: 'whatsapp', name: 'WhatsApp', icon: <PhoneCall size={20} />, instruction: 'hermes gateway setup whatsapp' },
                { id: 'signal', name: 'Signal', icon: <MessageSquare size={20} />, instruction: 'hermes gateway setup signal' },
              ].map(platform => (
                <div className="platform-card" key={platform.id}>
                  <div 
                    className="platform-card-header" 
                    onClick={() => setExpandedPlatform(expandedPlatform === platform.id ? null : platform.id)}
                  >
                    <div className="platform-info">
                      <div className={`platform-icon ${platform.id}`}>{platform.icon}</div>
                      <strong>{platform.name}</strong>
                    </div>
                    
                    <div className={`platform-status ${platformStatus[platform.id] ? 'running' : 'stopped'}`}>
                      {platformStatus[platform.id] ? <><Activity size={12}/> Running</> : 'Not configured'}
                    </div>
                  </div>
                  
                  {expandedPlatform === platform.id && (
                    <div className="platform-content expanded">
                      <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                        To connect <strong>{platform.name}</strong>, open your terminal and run the interactive setup command:
                      </p>
                      <div className="code-block" style={{ padding: '12px' }}>
                        <button className="copy-btn" onClick={() => navigator.clipboard.writeText(platform.instruction)}>
                          <Copy size={14} />
                        </button>
                        <span>{platform.instruction}</span>
                      </div>
                      <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.85rem' }} onClick={checkGatewayStatus}>
                          Refresh Status
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="wizard-actions">
              <button className="btn btn-secondary" onClick={prevStep}>Back</button>
              <button className="btn btn-primary" onClick={() => nextStep()}>
                Confirm & Finish <ArrowRight size={16} />
              </button>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="step-container">
            <div className="summary-box">
              <div className="summary-icon">
                <CheckCircle size={32} />
              </div>
              <h2 className="summary-title">You're All Set!</h2>
              <p className="summary-text">
                Hermes is configured and ready to assist you. 
                Using <strong>{configResult?.model || "auto"}</strong> via <strong>{configResult?.provider || "auto"}</strong>.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
              <div className="status-row">
                <Terminal size={18} color="var(--accent-secondary)"/>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>You can also chat from the terminal anytime using <code>hermes chat</code></span>
              </div>
              <div className="status-row">
                <Settings size={18} color="var(--accent-secondary)"/>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Manage your skills and integrations from the sidebar</span>
              </div>
            </div>

            <div className="wizard-actions" style={{ justifyContent: 'center', marginTop: '40px' }}>
              <button 
                className="btn btn-primary" 
                style={{ fontSize: '1.1rem', padding: '12px 32px' }}
                onClick={() => onComplete(configResult)}
              >
                Start Chatting <MessageSquare size={18} />
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="setup-wizard">
      <div className="wizard-sidebar">
        <div className="wizard-brand">
          <h2>Hermes</h2>
        </div>
        
        <div className="wizard-steps-list">
          {stepsList.map(step => (
            <div 
              key={step.id} 
              className={`step-indicator ${currentStep === step.id ? "active" : ""} ${currentStep > step.id ? "completed" : ""}`}
            >
              <div className="step-circle">
                {currentStep > step.id ? <CheckCircle size={16} color="var(--success)" strokeWidth={3} /> : step.id}
              </div>
              <span>{step.title}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="wizard-content">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentStep}
            custom={direction}
            initial={{ opacity: 0, x: direction > 0 ? 30 : -30, filter: "blur(4px)" }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, x: direction < 0 ? 30 : -30, filter: "blur(4px)" }}
            transition={{ type: "tween", ease: "easeInOut", duration: 0.25 }}
            style={{ width: "100%", display: "flex", justifyContent: "center" }}
          >
            {renderStepContent()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
