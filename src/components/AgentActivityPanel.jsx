import { useState, useEffect } from 'react';
import { Activity, X, Wifi, WifiOff, Cpu, Server, CheckCircle, XCircle, AlertTriangle, Terminal, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './AgentActivityPanel.css';

export default function AgentActivityPanel({ collapsed, onToggle, connState, activeModel, activeProvider, toolEvents }) {
  const [healthData, setHealthData] = useState(null);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const resp = await fetch('/api/health');
        const data = await resp.json();
        setHealthData(data);
      } catch {}
    };
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const connLabel = {
    connecting: 'Connecting...',
    connected: 'Connected',
    disconnected: 'Reconnecting...',
    error: 'Error',
  };

  return (
    <aside className={`activity-panel ${collapsed ? 'collapsed' : ''}`}>
      {/* Header */}
      <div className="activity-header">
        <div className="activity-header-left">
          <div className="activity-icon">
            <Activity size={14} />
          </div>
          <h3>Agent Activity</h3>
        </div>
        <button className="icon-btn" onClick={onToggle} title="Close panel">
          <X size={16} />
        </button>
      </div>

      {/* Status Cards */}
      <div className="activity-status">
        <div className="status-card">
          <span className="status-card-label">Connection</span>
          <span className={`status-card-value ${connState === 'connected' ? 'connected' : 'disconnected'}`}>
            {connLabel[connState] || 'Unknown'}
          </span>
        </div>
        {activeModel && (
          <div className="status-card">
            <span className="status-card-label">Model</span>
            <span className="status-card-value">{activeModel}</span>
          </div>
        )}
        {activeProvider && (
          <div className="status-card">
            <span className="status-card-label">Provider</span>
            <span className="status-card-value">{activeProvider}</span>
          </div>
        )}
        {healthData?.version && (
          <div className="status-card">
            <span className="status-card-label">Version</span>
            <span className="status-card-value">{healthData.version}</span>
          </div>
        )}
      </div>

      {/* Activity Timeline */}
      <div className="activity-timeline">
        <div className="timeline-label">Action Timeline</div>
        {(!toolEvents || toolEvents.length === 0) ? (
          <div className="timeline-empty">
            <Terminal size={24} strokeWidth={1.5} />
            <p>No activity yet</p>
            <span>Agent actions will appear here in real-time</span>
          </div>
        ) : (
          <AnimatePresence>
            {toolEvents.map((event, idx) => (
              <motion.div
                key={idx}
                className={`timeline-item ${event.type}`}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.02 }}
              >
                <div className={`timeline-event-type ${event.type}`}>
                  {event.type === 'tool-call' ? '⚡ Tool Call' : event.type === 'tool-result' ? '✓ Result' : '⚠ Error'}
                </div>
                <div className="timeline-event-text">{event.text}</div>
                {event.time && <div className="timeline-event-time">{event.time}</div>}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Diagnostics (from health) */}
      {healthData?.details && healthData.details.length > 0 && (
        <div className="activity-diagnostics">
          <div className="timeline-label">Diagnostics</div>
          {healthData.details.slice(0, 6).map((d, i) => (
            <div key={i} className={`diagnostic-row ${d.ok ? (d.warn ? 'warn' : 'ok') : 'error'}`}>
              {d.ok ? (d.warn ? <AlertTriangle size={12} /> : <CheckCircle size={12} />) : <XCircle size={12} />}
              <span>{d.text}</span>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
