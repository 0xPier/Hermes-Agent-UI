import { useState, useEffect } from 'react';
import { Activity, Loader2, RefreshCw, CheckCircle, XCircle, Wifi, Server, AlertTriangle, Clock, Cpu } from 'lucide-react';
import { motion } from 'framer-motion';
import './StatusPanel.css';

export default function StatusPanel() {
  const [loading, setLoading] = useState(true);
  const [statusData, setStatusData] = useState(null);
  const [healthData, setHealthData] = useState(null);
  const [error, setError] = useState(null);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusResp, healthResp] = await Promise.all([
        fetch('/api/status'),
        fetch('/api/health'),
      ]);
      const status = await statusResp.json();
      const health = await healthResp.json();
      setStatusData(status);
      setHealthData(health);
    } catch {
      setError('Failed to fetch system status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStatus(); }, []);

  return (
    <div className="status-panel">
      <div className="status-header">
        <Activity size={20} color="var(--primary)" />
        <h3>System Health</h3>
        <button className="status-refresh-btn" onClick={fetchStatus} title="Refresh">
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="status-body">
        {loading ? (
          <div className="status-loading">
            <Loader2 size={24} className="spinner" color="var(--primary)" />
            <span>Running diagnostics...</span>
          </div>
        ) : error ? (
          <div className="status-error">{error}</div>
        ) : (
          <>
            {/* Connection Status */}
            <motion.div className="status-card" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="status-card-header">
                <Wifi size={16} />
                <span>Connection</span>
                <span className={`status-badge ${healthData?.installed ? 'ok' : 'error'}`}>
                  {healthData?.installed ? healthData?.status : 'Not Installed'}
                </span>
              </div>
              {healthData?.binary && (
                <div className="status-detail">
                  <span className="status-detail-label">Binary</span>
                  <span className="status-detail-value mono">{healthData.binary}</span>
                </div>
              )}
              {healthData?.version && (
                <div className="status-detail">
                  <span className="status-detail-label">Version</span>
                  <span className="status-detail-value">{healthData.version}</span>
                </div>
              )}
            </motion.div>

            {/* Model & Provider */}
            <motion.div className="status-card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }}>
              <div className="status-card-header">
                <Cpu size={16} />
                <span>Model & Provider</span>
              </div>
              <div className="status-detail">
                <span className="status-detail-label">Model</span>
                <span className="status-detail-value mono">{statusData?.model || 'Not configured'}</span>
              </div>
              <div className="status-detail">
                <span className="status-detail-label">Provider</span>
                <span className="status-detail-value">{statusData?.provider || 'auto'}</span>
              </div>
            </motion.div>

            {/* Gateway */}
            <motion.div className="status-card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
              <div className="status-card-header">
                <Server size={16} />
                <span>Services</span>
              </div>
              {statusData?.gateway && (
                <div className="status-detail">
                  <span className="status-detail-label">Gateway</span>
                  <span className={`status-detail-value ${statusData.gateway === 'running' ? 'text-success' : 'text-muted'}`}>
                    {statusData.gateway === 'running' ? '✓ Running' : '✗ Stopped'}
                  </span>
                </div>
              )}
              {statusData?.active_sessions !== undefined && (
                <div className="status-detail">
                  <span className="status-detail-label">Active Sessions</span>
                  <span className="status-detail-value">{statusData.active_sessions}</span>
                </div>
              )}
              {statusData?.scheduled_jobs !== undefined && (
                <div className="status-detail">
                  <span className="status-detail-label">Scheduled Jobs</span>
                  <span className="status-detail-value">{statusData.scheduled_jobs}</span>
                </div>
              )}
            </motion.div>

            {/* Doctor Details */}
            {healthData?.details && healthData.details.length > 0 && (
              <motion.div className="status-card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
                <div className="status-card-header">
                  <CheckCircle size={16} />
                  <span>Diagnostics</span>
                  <span className={`status-badge ${healthData.status === 'ready' ? 'ok' : 'warn'}`}>
                    {healthData.status === 'ready' ? 'All Passed' : 'Issues Found'}
                  </span>
                </div>
                <div className="status-diagnostics">
                  {healthData.details.map((d, i) => (
                    <div key={i} className={`diagnostic-item ${d.ok ? (d.warn ? 'warn' : 'ok') : 'error'}`}>
                      {d.ok ? (d.warn ? <AlertTriangle size={13} /> : <CheckCircle size={13} />) : <XCircle size={13} />}
                      <span>{d.text}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
