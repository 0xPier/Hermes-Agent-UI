import { useState, useEffect } from 'react';
import SetupWizard from './components/SetupWizard';
import MainChat from './components/MainChat';

function App() {
  const [appState, setAppState] = useState('loading'); // loading | wizard | ready
  const [configData, setConfigData] = useState(null);

  useEffect(() => {
    // Phase 0: Auto-detect existing settings
    // Check if Hermes is installed and configured — if so, skip the wizard entirely
    const detectExistingConfig = async () => {
      try {
        const [healthResp, configResp] = await Promise.all([
          fetch('/api/health'),
          fetch('/api/config/full'),
        ]);
        const health = await healthResp.json();
        const config = await configResp.json();

        if (health.installed && config.model) {
          // Hermes is installed and has a model configured — go straight to chat
          setConfigData({
            model: config.model,
            provider: config.provider || 'auto',
            api_keys: config.api_keys || {},
          });
          setAppState('ready');
        } else {
          // Hermes not installed or not configured — show wizard
          setAppState('wizard');
        }
      } catch {
        // Backend not reachable — show wizard (it will handle the error)
        setAppState('wizard');
      }
    };

    detectExistingConfig();
  }, []);

  const handleInstallComplete = (config) => {
    setConfigData(config);
    setAppState('ready');
  };

  if (appState === 'loading') {
    return (
      <div className="app-container" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100%',
        background: 'var(--bg-base)',
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid var(--border-subtle)',
            borderTopColor: 'var(--accent-primary)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Detecting Hermes configuration...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container" style={{ width: '100%', height: '100vh' }}>
      {appState === 'wizard' ? (
        <SetupWizard onComplete={handleInstallComplete} />
      ) : (
        <MainChat initialConfig={configData} />
      )}
    </div>
  );
}

export default App;
