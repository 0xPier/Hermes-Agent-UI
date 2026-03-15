import { useState, useEffect } from 'react';
import { Plus, Search, MessageSquare, Settings, Loader2, Zap, Clock, Hash } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './ConversationSidebar.css';

export default function ConversationSidebar({ onNewChat, onResumeSession, onOpenSettings, activeSessionId }) {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/sessions');
      const data = await resp.json();
      setSessions(data.sessions || []);
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSessions(); }, []);

  // Group sessions by date
  const groupSessions = (sessions) => {
    const now = new Date();
    const today = now.toDateString();
    const yesterday = new Date(now - 86400000).toDateString();
    const weekAgo = new Date(now - 7 * 86400000);

    const groups = { 'Today': [], 'Yesterday': [], 'This Week': [], 'Older': [] };

    sessions.forEach(s => {
      if (!s.date) {
        groups['Older'].push(s);
        return;
      }
      try {
        const d = new Date(s.date);
        if (d.toDateString() === today) groups['Today'].push(s);
        else if (d.toDateString() === yesterday) groups['Yesterday'].push(s);
        else if (d > weekAgo) groups['This Week'].push(s);
        else groups['Older'].push(s);
      } catch {
        groups['Older'].push(s);
      }
    });

    return Object.entries(groups).filter(([, items]) => items.length > 0);
  };

  const filteredSessions = searchQuery
    ? sessions.filter(s =>
        (s.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.id || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : sessions;

  const groupedSessions = groupSessions(filteredSessions);

  return (
    <aside className="conversation-sidebar">
      {/* Brand + New Task */}
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <div className="brand-icon">
            <Zap size={16} color="#fff" />
          </div>
          <span className="brand-name">Hermes</span>
          <span className="brand-tag">Agent</span>
        </div>
        <button className="new-task-btn" onClick={onNewChat}>
          <Plus size={16} /> New Task
        </button>
      </div>

      {/* Search */}
      <div className="sidebar-search">
        <div className="search-input-wrapper">
          <Search size={14} />
          <input
            type="text"
            className="search-input"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Sessions List */}
      <div className="sessions-list">
        {loading ? (
          <div className="sessions-loading">
            <Loader2 size={20} className="spinner" />
            <span>Loading sessions...</span>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="sessions-empty">
            <MessageSquare size={28} strokeWidth={1.5} />
            <p>No conversations yet</p>
            <span>Start a new task to begin</span>
          </div>
        ) : (
          <AnimatePresence>
            {groupedSessions.map(([group, items]) => (
              <div key={group}>
                <div className="sessions-group-label">{group}</div>
                {items.map((session, idx) => (
                  <motion.div
                    key={session.id || idx}
                    className={`session-item ${activeSessionId === session.id ? 'active' : ''}`}
                    onClick={() => onResumeSession && onResumeSession(session.id)}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.03 }}
                  >
                    <div className="session-item-icon">
                      <MessageSquare size={14} />
                    </div>
                    <div className="session-item-content">
                      <div className="session-item-title">
                        {session.title || 'Untitled Session'}
                      </div>
                      <div className="session-item-meta">
                        {session.date && <span>{session.date}</span>}
                        {session.messages && (
                          <>
                            <span className="meta-dot" />
                            <span>{session.messages} msgs</span>
                          </>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Footer — Settings */}
      <div className="sidebar-footer">
        <button className="sidebar-footer-btn" onClick={onOpenSettings}>
          <Settings size={16} />
          Settings
        </button>
      </div>
    </aside>
  );
}
