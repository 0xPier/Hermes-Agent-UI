import { useState, useEffect } from 'react';
import { Terminal, Loader2, RefreshCw, Clock, MessageSquare, Play, Hash } from 'lucide-react';
import { motion } from 'framer-motion';
import './SessionsPanel.css';

export default function SessionsPanel({ onResumeSession }) {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState(null);

  const fetchSessions = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/sessions');
      const data = await resp.json();
      setSessions(data.sessions || []);
    } catch {
      setError('Failed to load sessions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSessions(); }, []);

  return (
    <div className="sessions-panel">
      <div className="sessions-header">
        <Terminal size={20} color="var(--primary)" />
        <h3>Sessions</h3>
        <button className="sessions-refresh-btn" onClick={fetchSessions} title="Refresh">
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="sessions-body">
        {loading ? (
          <div className="sessions-loading">
            <Loader2 size={24} className="spinner" color="var(--primary)" />
            <span>Loading sessions...</span>
          </div>
        ) : error ? (
          <div className="sessions-error">{error}</div>
        ) : sessions.length === 0 ? (
          <div className="sessions-empty">
            <Terminal size={36} color="var(--text-muted)" />
            <p>No past sessions found.</p>
            <span>Sessions will appear here after you use Hermes.</span>
          </div>
        ) : (
          <div className="sessions-list">
            {sessions.map((session, idx) => (
              <motion.div
                key={session.id || idx}
                className="session-card"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
              >
                <div className="session-info">
                  <div className="session-title">
                    {session.title || 'Untitled Session'}
                  </div>
                  <div className="session-meta">
                    <span className="session-meta-item">
                      <Hash size={12} />
                      <span className="session-id">{session.id?.slice(0, 8) || '—'}...</span>
                    </span>
                    {session.date && (
                      <span className="session-meta-item">
                        <Clock size={12} />
                        {session.date}
                      </span>
                    )}
                    {session.messages && (
                      <span className="session-meta-item">
                        <MessageSquare size={12} />
                        {session.messages} msgs
                      </span>
                    )}
                    {session.duration && (
                      <span className="session-meta-item">
                        <Clock size={12} />
                        {session.duration}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  className="session-resume-btn"
                  onClick={() => onResumeSession && onResumeSession(session.id)}
                  title="Resume this session"
                >
                  <Play size={14} fill="currentColor" />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
