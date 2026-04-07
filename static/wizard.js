const stepsList = [
  { id: 1, title: "Installation" },
  { id: 2, title: "Operating Mode" },
  { id: 3, title: "AI Provider" },
  { id: 4, title: "Messaging" },
  { id: 5, title: "Ready" }
];

let currentStep = 1;
let loading = false;
let isInstalled = false;
let installChecked = false;
let installCmds = { cli: "curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash", docker: "docker pull nousresearch/hermes-agent" };
let installTab = "cli";

let mode = "cloud";
let cloudProvider = "openrouter";
let cloudApiKey = "";
let cloudModels = [];
let cloudSelectedModel = "openai/gpt-5.4-mini";
let localProvider = "ollama";
let localHost = "localhost";
let localPort = 11434;
let localReachable = false;
let localModels = [];
let localSelectedModel = "";
let testingLocal = false;
let localError = "";
let platformStatus = { telegram: false, discord: false, whatsapp: false, signal: false };
let expandedPlatform = null;
let configResult = null;

// Existing config detection
let existingConfig = null;
let configFetched = false;

const CLOUD_PROVIDERS = [
  { value: "auto", label: "Auto (Recommended)" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "nous", label: "Nous Research" },
  { value: "openai-codex", label: "OpenAI Codex" }
];

const LOCAL_PROVIDERS = [
  { value: "ollama", label: "Ollama", defaultPort: 11434 },
  { value: "llamacpp", label: "llama.cpp", defaultPort: 8080 },
  { value: "lmstudio", label: "LM Studio", defaultPort: 1234 }
];

async function fetchExistingConfig() {
  if (configFetched) return;
  configFetched = true;
  try {
    const res = await fetch("/api/config/current");
    if (res.ok) {
      existingConfig = await res.json();
      // Pre-fill form with existing config if available
      if (existingConfig.has_config) {
        if (existingConfig.provider) {
          // Check if it's a known cloud provider
          const knownProviders = CLOUD_PROVIDERS.map(p => p.value);
          if (knownProviders.includes(existingConfig.provider)) {
            cloudProvider = existingConfig.provider;
            mode = "cloud";
          } else if (existingConfig.custom_providers && existingConfig.custom_providers.length > 0) {
            // Custom provider likely means local
            mode = "local";
            const cp = existingConfig.custom_providers[0];
            if (cp.base_url) {
              const urlMatch = cp.base_url.match(/https?:\/\/([^:]+):(\d+)/);
              if (urlMatch) {
                localHost = urlMatch[1];
                localPort = urlMatch[2];
              }
            }
          }
        }
        if (existingConfig.model) {
          cloudSelectedModel = existingConfig.model;
          localSelectedModel = existingConfig.model;
        }
      }
    }
  } catch (e) {
    // Silently fail -- config may not exist
  }
}

async function checkHealth() {
  setLoading(true);
  try {
    const res = await fetch("/api/health");
    if (res.ok) {
      const data = await res.json();
      isInstalled = data.installed;
    } else {
      isInstalled = false;
    }

    const modRes = await fetch("/api/models");
    if (modRes.ok) {
      const modData = await modRes.json();
      cloudModels = modData.groups || [];
    }
    
    // Fetch existing config in parallel
    await fetchExistingConfig();
  } catch (e) {
    isInstalled = false;
  }
  installChecked = true;
  setLoading(false);
  if (isInstalled && currentStep === 1) nextStep(2);
  else render();
}

async function checkGatewayStatus() {
  try {
    const res = await fetch("/api/gateway/status");
    if (res.ok) {
      const data = await res.json();
      if (data.platforms) platformStatus = data.platforms;
    }
  } catch (e) {}
  render();
}

function nextStep(step) {
  currentStep = step || currentStep + 1;
  const wrapper = document.getElementById("stepContainer");
  wrapper.style.opacity = 0;
  wrapper.style.transform = "translateX(20px)";
  setTimeout(() => {
    render();
    wrapper.style.opacity = 1;
    wrapper.style.transform = "translateX(0)";
  }, 200);
}

function prevStep() {
  currentStep = Math.max(1, currentStep - 1);
  const wrapper = document.getElementById("stepContainer");
  wrapper.style.opacity = 0;
  wrapper.style.transform = "translateX(-20px)";
  setTimeout(() => {
    render();
    wrapper.style.opacity = 1;
    wrapper.style.transform = "translateX(0)";
  }, 200);
}

function setLoading(val) {
  loading = val;
  render();
}

async function handleTestLocalProvider() {
  testingLocal = true;
  localError = "";
  localReachable = false;
  localModels = [];
  render();
  try {
    const res = await fetch(`/api/config/local-provider/test?host=${encodeURIComponent(localHost)}&port=${localPort}`);
    const data = await res.json();
    if (data.status === "ok") {
      localReachable = true;
      localModels = data.models || [];
      if (data.models.length > 0) localSelectedModel = data.models[0];
    } else {
      localError = data.message;
    }
  } catch (e) {
    localError = e.message;
  }
  testingLocal = false;
  render();
}

async function handleSaveProvider() {
  // Check if config will change
  let willModifyConfig = false;
  let changeSummary = "";
  
  if (mode === "cloud") {
    willModifyConfig = !existingConfig?.has_config || 
                       existingConfig.provider !== cloudProvider || 
                       existingConfig.model !== cloudSelectedModel;
    if (willModifyConfig) {
      changeSummary = `Provider: ${cloudProvider}\nModel: ${cloudSelectedModel}`;
      if (existingConfig?.has_config) {
        changeSummary = `Current: ${existingConfig.provider || 'none'} / ${existingConfig.model || 'none'}\n\nNew: ${cloudProvider} / ${cloudSelectedModel}`;
      }
    }
  } else {
    willModifyConfig = !existingConfig?.has_config || 
                       existingConfig.model !== localSelectedModel;
    if (willModifyConfig) {
      changeSummary = `Provider: ${localProvider} (${localHost}:${localPort})\nModel: ${localSelectedModel}`;
      if (existingConfig?.has_config) {
        changeSummary = `Current: ${existingConfig.provider || 'none'} / ${existingConfig.model || 'none'}\n\nNew: ${localProvider} / ${localSelectedModel}`;
      }
    }
  }
  
  // Show confirmation if config will be modified
  if (willModifyConfig && existingConfig?.has_config) {
    const confirmed = confirm(
      "This will update your Hermes configuration.\n\n" +
      changeSummary + "\n\n" +
      "Do you want to proceed?"
    );
    if (!confirmed) return;
  }
  
  setLoading(true);
  if (mode === "cloud") {
    try {
      const payload = { config: { "provider": cloudProvider, "model": cloudSelectedModel, [`api_keys.${cloudProvider}`]: cloudApiKey } };
      const res = await fetch("/api/config/update", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      });
      if (res.ok) { configResult = { provider: cloudProvider, model: cloudSelectedModel }; nextStep(4); }
      else alert("Error saving");
    } catch (e) { alert(e.message); }
  } else {
    try {
      const payload = { provider: localProvider, host: localHost, port: parseInt(localPort), model: localSelectedModel };
      const res = await fetch("/api/config/local-provider", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      });
      if (res.ok) { configResult = { provider: localProvider, model: localSelectedModel }; nextStep(4); }
      else alert("Error: " + (await res.text()));
    } catch (e) { alert(e.message); }
  }
  setLoading(false);
}

function renderSidebar() {
  const container = document.getElementById("wizardStepsList");
  container.innerHTML = stepsList.map(step => `
    <div class="step-indicator ${currentStep === step.id ? 'active' : ''} ${currentStep > step.id ? 'completed' : ''}">
      <div class="step-circle">${currentStep > step.id ? '✓' : step.id}</div>
      <span>${step.title}</span>
    </div>
  `).join("");
}

function renderStep1() {
  if (loading || !installChecked) {
    return `<div style="display:flex;justify-content:center;padding:40px"><span class="spinner"></span></div>`;
  }
  
  let html = `<div class="step-header"><h1>Welcome to Hermes Agent</h1><p>Checking your system installation...</p></div>`;
  if (isInstalled) {
    html += `
      <div class="status-card" style="border-color:var(--green);background:rgba(52, 211, 153, 0.1)">
        <div class="status-row success">✓ <div><strong>Hermes Agent is installed</strong><p style="margin:0;font-size:0.9rem;color:var(--muted)">Ready to configure your provider.</p></div></div>
      </div>
      <div class="wizard-actions"><button class="w-btn w-btn-primary" onclick="nextStep(2)">Continue →</button></div>`;
  } else {
    html += `
      <div class="status-card">
        <div class="status-row error" style="margin-bottom:12px">⚠ <strong>Hermes is not installed or not found in PATH</strong></div>
        <div class="install-tabs">
          <div class="install-tab ${installTab === 'cli' ? 'active' : ''}" onclick="installTab='cli';render()">Terminal</div>
          <div class="install-tab ${installTab === 'docker' ? 'active' : ''}" onclick="installTab='docker';render()">Docker</div>
        </div>
        <div class="code-block"><pre style="margin:0">${installCmds[installTab]}</pre></div>
        <div class="wizard-actions" style="margin-top:16px">
          <button class="w-btn w-btn-primary" onclick="checkHealth()">Check Again</button>
          <button class="w-btn w-btn-secondary" onclick="nextStep(2)">Skip</button>
        </div>
      </div>`;
  }
  return `<div class="step-container">${html}</div>`;
}

function renderStep2() {
  return `
    <div class="step-container">
      <div class="step-header"><h1>Choose Operating Mode</h1><p>How do you want to run the AI models?</p></div>
      <div class="cards-grid">
        <div class="option-card ${mode === 'cloud' ? 'selected' : ''}" onclick="mode='cloud';render()">
          <div class="option-icon">☁️</div>
          <div class="option-content"><h3>Cloud API</h3><p>Fast inference using OpenRouter, etc.</p></div>
        </div>
        <div class="option-card ${mode === 'local' ? 'selected' : ''}" onclick="mode='local';render()">
          <div class="option-icon">🖥️</div>
          <div class="option-content"><h3>Local Engine</h3><p>100% private inference (Ollama, LM Studio).</p></div>
        </div>
      </div>
      <div class="wizard-actions">
        <button class="w-btn w-btn-secondary" onclick="prevStep()">Back</button>
        <button class="w-btn w-btn-primary" onclick="nextStep(3)">Continue →</button>
      </div>
    </div>`;
}

function renderStep3() {
  let html = `<div class="step-container">`;
  if (mode === "cloud") {
    const currentProviderGroup = cloudModels.find(g => g.provider.toLowerCase().replace(/ /g, '-') === cloudProvider) || cloudModels[0];
    const availableModels = currentProviderGroup ? currentProviderGroup.models : [];
    
    html += `<div class="step-header"><h1>Cloud Provider Setup</h1></div>
      <div class="provider-settings">
        <div class="form-group"><label>Provider</label>
          <select onchange="cloudProvider=this.value;render()">
            ${CLOUD_PROVIDERS.map(p => `<option value="${p.value}" ${cloudProvider === p.value ? 'selected' : ''}>${p.label}</option>`).join("")}
          </select>
        </div>
        <div class="form-group"><label>Model</label>
          <input type="text" oninput="cloudSelectedModel=this.value;render()" value="${cloudSelectedModel}" placeholder="Enter model name (e.g. gpt-4o)">
        </div>
        <div class="form-group"><label>API Key</label>
          <input type="password" oninput="cloudApiKey=this.value;render()" value="${cloudApiKey}">
        </div>
      </div>
      <div class="wizard-actions">
        <button class="w-btn w-btn-secondary" onclick="prevStep()">Back</button>
        <button class="w-btn w-btn-primary" onclick="handleSaveProvider()" ${loading ? 'disabled' : ''}>${loading ? '<span class="spinner"></span>' : 'Save & Continue'}</button>
      </div>`;
  } else {
    html += `<div class="step-header"><h1>Local Provider Setup</h1></div>
      <div class="cards-grid">
        ${LOCAL_PROVIDERS.map(p => `
          <div class="option-card ${localProvider === p.value ? 'selected' : ''}" onclick="localProvider='${p.value}';localPort=${p.defaultPort};localReachable=false;render()" style="padding:16px">
            <strong>${p.label}</strong>
          </div>
        `).join("")}
      </div>
      <div class="provider-settings">
        <div style="display:flex;gap:16px">
          <div class="form-group" style="flex:1"><label>Hostname</label><input value="${localHost}" oninput="localHost=this.value;render()"></div>
          <div class="form-group" style="flex:1"><label>Port</label><input type="number" value="${localPort}" oninput="localPort=this.value;render()"></div>
        </div>
        <div class="provider-test-row">
          <button class="test-btn" onclick="handleTestLocalProvider()" ${testingLocal ? 'disabled' : ''}>Test Connection</button>
          ${localReachable ? `<span class="status-row success">✓ Reachable</span>` : ''}
          ${localError ? `<span class="status-row error">✕ ${localError}</span>` : ''}
        </div>
        ${localReachable && localModels.length > 0 ? `
          <div class="form-group" style="margin-top:16px"><label>Discovered Models</label>
            <select onchange="localSelectedModel=this.value;render()">
              ${localModels.map(m => `<option value="${m}" ${localSelectedModel === m ? 'selected' : ''}>${m}</option>`).join("")}
            </select>
          </div>
        ` : ''}
      </div>
      <div class="wizard-actions">
        <button class="w-btn w-btn-secondary" onclick="prevStep()">Back</button>
        <button class="w-btn w-btn-primary" onclick="handleSaveProvider()" ${loading || (!localSelectedModel && localModels.length>0) ? 'disabled' : ''}>Save & Continue</button>
      </div>`;
  }
  html += `</div>`;
  return html;
}

function renderStep4() {
  const platforms = [
    { id: 'telegram', name: 'Telegram', cmd: 'hermes gateway setup telegram' },
    { id: 'discord', name: 'Discord', cmd: 'hermes gateway setup discord' }
  ];
  return `
    <div class="step-container">
      <div class="step-header"><h1>Messaging Integrations</h1><p>Connect Hermes to chat apps (optional).</p></div>
      <div class="platforms-list">
        ${platforms.map(p => `
          <div class="platform-card">
            <div class="platform-card-header" onclick="expandedPlatform=expandedPlatform==='${p.id}'?null:'${p.id}';render()">
              <div class="platform-info"><strong>${p.name}</strong></div>
              <div class="platform-status ${platformStatus[p.id] ? 'running' : 'stopped'}">${platformStatus[p.id] ? 'Running' : 'Not configured'}</div>
            </div>
            ${expandedPlatform === p.id ? `
              <div class="platform-content expanded">
                <div class="code-block">${p.cmd}</div>
                <button class="w-btn w-btn-secondary" onclick="checkGatewayStatus()" style="margin-top:12px">Refresh</button>
              </div>` : ''}
          </div>
        `).join("")}
      </div>
      <div class="wizard-actions">
        <button class="w-btn w-btn-secondary" onclick="prevStep()">Back</button>
        <button class="w-btn w-btn-primary" onclick="nextStep(5)">Confirm & Finish →</button>
      </div>
    </div>`;
}

function renderStep5() {
  return `
    <div class="step-container">
      <div class="summary-box">
        <div class="summary-icon">✓</div><h2 class="summary-title">You're All Set!</h2>
        <p class="summary-text">Hermes is ready to assist you via <strong>${configResult?.provider || 'auto'}</strong>.</p>
      </div>
      <div class="wizard-actions" style="justify-content:center">
        <button class="w-btn w-btn-primary" style="font-size:1.1rem;padding:12px 32px" onclick="window.location.href='/'">Start Chatting</button>
      </div>
    </div>`;
}

function render() {
  renderSidebar();
  const c = document.getElementById("stepContainer");
  if (currentStep === 1) c.innerHTML = renderStep1();
  if (currentStep === 2) c.innerHTML = renderStep2();
  if (currentStep === 3) c.innerHTML = renderStep3();
  if (currentStep === 4) c.innerHTML = renderStep4();
  if (currentStep === 5) c.innerHTML = renderStep5();
}

window.onload = () => {
  checkHealth().then(checkGatewayStatus);
}
