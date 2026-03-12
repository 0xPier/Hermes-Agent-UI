import { useState } from 'react';
import GuidedInstallation from './components/GuidedInstallation';
import MainChat from './components/MainChat';

function App() {
  const [isInstalled, setIsInstalled] = useState(false);
  const [configData, setConfigData] = useState(null);

  const handleInstallComplete = (config) => {
    setConfigData(config);
    setIsInstalled(true);
  };

  return (
    <div className="app-container">
      {!isInstalled ? (
        <GuidedInstallation onComplete={handleInstallComplete} />
      ) : (
        <MainChat initialConfig={configData} />
      )}
    </div>
  );
}

export default App;
