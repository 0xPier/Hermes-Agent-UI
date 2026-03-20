import { useState, useEffect } from 'react';
import { Activity, X, Wifi, WifiOff, Cpu, Server, CheckCircle, XCircle, AlertTriangle, Terminal, Loader2, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './AgentActivityPanel.css';

export default function AgentActivityPanel({ collapsed, onToggle, connState, activeModel, activeProvider, toolEvents }) {
  const [healthData, setHealthData] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [popoverPosition, setPopoverPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const resp = await fetch('/api/health');
        const data = await resp.json();
        setHealthData(data);
      } catch { }
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

  const handleEventClick = (event, element) => {
    if (event.rawData || event.params || event.result) {
      const rect = element.getBoundingClientRect();
      setPopoverPosition({
        x: rect.left + window.scrollX,
        y: rect.bottom + window.scrollY
      });
      setSelectedEvent(event);
    }
  };

  const closePopover = () => {
    setSelectedEvent(null);
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
                className={`timeline-item ${event.type} ${event.rawData ? 'clickable' : ''}`}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.02 }}
                onClick={(e) => event.rawData && handleEventClick(event, e.currentTarget)}
                style={{ cursor: event.rawData ? 'pointer' : 'default' }}
              >
                <div className={`timeline-event-type ${event.type}`}>
                  {event.type === 'tool-call' ? '⚡ Tool Call' : event.type === 'tool-result' ? '✓ Result' : '⚠ Error'}
                </div>
                <div className="timeline-event-text">{event.text}</div>
                {event.time && <div className="timeline-event-time">{event.time}</div>}
                {event.rawData && (
                  <div className="timeline-event-info">
                    <Info size={12} />
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Event Detail Popover */}
      <AnimatePresence>
        {selectedEvent && (
          <motion.div
            className="event-popover"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={{
              position: 'fixed',
              left: popoverPosition.x,
              top: popoverPosition.y,
              zIndex: 1000,
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '12px',
              minWidth: '300px',
              maxWidth: '400px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: '600' }}>
                {selectedEvent.type === 'tool-call' ? 'Tool Call Details' : selectedEvent.type === 'tool-result' ? 'Tool Result' : 'Error Details'}
              </h4>
              <button
                onClick={closePopover}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                <X size={14} />
              </button>
            </div>
            <div style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', lineHeight: '1.4' }}>
              {selectedEvent.rawData ? (
                <pre style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  backgroundColor: 'var(--bg-surface)',
                  padding: '8px',
                  borderRadius: 'var(--radius-sm)',
                  overflow: 'auto',
                  maxHeight: '200px',
                }}>
                  {JSON.stringify(selectedEvent.rawData, null, 2)}
                </pre>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {selectedEvent.tool && (
                    <div><strong>Tool:</strong> {selectedEvent.tool}</div>
                  )}
                  {selectedEvent.params && (
                    <div><strong>Params:</strong> {selectedEvent.params}</div>
                  )}
                  {selectedEvent.result && (
                    <div><strong>Result:</strong> {selectedEvent.result}</div>
                  )}
                  {selectedEvent.text && (
                    <div><strong>Text:</strong> {selectedEvent.text}</div>
                  )}
                  {selectedEvent.time && (
                    <div><strong>Time:</strong> {selectedEvent.time}</div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Click overlay to close popover */}
      {selectedEvent && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 999,
            backgroundColor: 'transparent',
          }}
          onClick={closePopover}
        />
      )}

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
