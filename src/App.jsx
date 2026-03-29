import { useState, useEffect } from 'react';
import MainChat from './components/MainChat';
import ProviderSetup from './components/ProviderSetup';

function App() {
  const [providerReady, setProviderReady] = useState(null); // null = loading, true/false
  const [providerInfo, setProviderInfo] = useState(null);
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    // Check if a local provider is already configured
    fetch('/api/config/local-provider/status')
      .then(res => res.json())
      .then(data => {
        if (data.configured) {
          setProviderInfo(data);
          setProviderReady(true);
        } else {
          setProviderReady(false);
        }
      })
      .catch(() => {
        // Backend might not be up yet — show setup by default
        setProviderReady(false);
      });
  }, []);

  const handleSetupComplete = (info) => {
    // info is null if user skipped (cloud provider)
    setProviderInfo(info);
    setProviderReady(true);
    setShowSetup(false);
  };

  const handleChangeProvider = () => {
    setShowSetup(true);
  };

  // Still loading the status check
  if (providerReady === null) {
    return (
      <div className="provider-loading">
        <div className="loading-dots">
          <span /><span /><span />
        </div>
      </div>
    );
  }

  // Show setup if not configured or user explicitly requested change
  if (!providerReady || showSetup) {
    return (
      <div className="app-container" style={{ width: '100%', height: '100vh' }}>
        <ProviderSetup onComplete={handleSetupComplete} />
      </div>
    );
  }

  // Normal chat view
  return (
    <div className="app-container" style={{ width: '100%', height: '100vh' }}>
      <MainChat
        providerInfo={providerInfo}
        onChangeProvider={handleChangeProvider}
      />
    </div>
  );
}

export default App;
