import { useState, useEffect } from 'react';
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import './ToolManager.css';

export default function ToolManager() {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [togglingTool, setTogglingTool] = useState(null);

  const fetchTools = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/tools');
      const data = await resp.json();
      setTools(data.tools || []);
    } catch {
      setError('Failed to load tools. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTools();
  }, []);

  const handleToggle = async (toolName, currentEnabled) => {
    setTogglingTool(toolName);
    try {
      const endpoint = currentEnabled ? '/api/tools/disable' : '/api/tools/enable';
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: toolName }),
      });
      const data = await resp.json();
      if (data.status === 'success') {
        setTools(prev =>
          prev.map(t =>
            t.name === toolName ? { ...t, enabled: !currentEnabled } : t
          )
        );
      } else {
        setError(data.message || 'Failed to toggle tool.');
        setTimeout(() => setError(null), 4000);
      }
    } catch {
      setError('Network error toggling tool.');
      setTimeout(() => setError(null), 4000);
    } finally {
      setTogglingTool(null);
    }
  };

  if (loading) {
    return (
      <div className="tool-manager-loading">
        <Loader2 size={18} className="spinner" />
        <span>Loading toolsets...</span>
      </div>
    );
  }

  const enabledTools = tools.filter(t => t.enabled);
  const disabledTools = tools.filter(t => !t.enabled);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="tool-manager">
      <div className="tool-manager-header">
        <h3>Toolsets</h3>
        <span className="tool-manager-count">
          {enabledTools.length}/{tools.length} active
        </span>
      </div>

      {error && (
        <div className="tool-manager-error">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {enabledTools.length > 0 && (
        <>
          <div className="tool-section-label">Enabled</div>
          <div className="tool-grid">
            {enabledTools.map(tool => (
              <div
                key={tool.name}
                className={`tool-card enabled ${togglingTool === tool.name ? 'toggling' : ''}`}
              >
                <span className="tool-card-emoji">{tool.emoji || '🔧'}</span>
                <div className="tool-card-info">
                  <div className="tool-card-name">{tool.name.replace(/_/g, ' ')}</div>
                  <div className="tool-card-desc">{tool.description}</div>
                </div>
                <label className="tool-toggle" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={tool.enabled}
                    onChange={() => handleToggle(tool.name, tool.enabled)}
                    disabled={togglingTool === tool.name}
                  />
                  <span className="tool-toggle-track" />
                </label>
              </div>
            ))}
          </div>
        </>
      )}

      {disabledTools.length > 0 && (
        <>
          <div className="tool-section-label">Disabled</div>
          <div className="tool-grid">
            {disabledTools.map(tool => (
              <div
                key={tool.name}
                className={`tool-card ${togglingTool === tool.name ? 'toggling' : ''}`}
              >
                <span className="tool-card-emoji">{tool.emoji || '🔧'}</span>
                <div className="tool-card-info">
                  <div className="tool-card-name">{tool.name.replace(/_/g, ' ')}</div>
                  <div className="tool-card-desc">{tool.description}</div>
                </div>
                <label className="tool-toggle" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={tool.enabled}
                    onChange={() => handleToggle(tool.name, tool.enabled)}
                    disabled={togglingTool === tool.name}
                  />
                  <span className="tool-toggle-track" />
                </label>
              </div>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}
