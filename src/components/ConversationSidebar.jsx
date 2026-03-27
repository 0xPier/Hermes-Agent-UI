import { useState, useEffect, useRef } from 'react';
import { Plus, Search, MessageSquare, Loader2, MoreHorizontal, Pencil, Trash2, X, Check, Database, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ArcaLogo from './ArcaLogo';
import './ConversationSidebar.css';

export default function ConversationSidebar({ onNewChat, onResumeSession, activeSessionId, refreshTrigger, connState }) {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const renameRef = useRef(null);

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

  useEffect(() => {
    fetchSessions();
  }, [refreshTrigger]);

  useEffect(() => {
    const handleClick = () => setMenuOpen(null);
    if (menuOpen) document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [menuOpen]);

  useEffect(() => {
    if (renaming && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renaming]);

  const handleDelete = async (sessionId) => {
    setActionLoading(sessionId);
    setMenuOpen(null);
    try {
      const resp = await fetch('/api/sessions/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const data = await resp.json();
      if (data.status === 'success') {
        setSessions(prev => prev.filter(s => s.id !== sessionId));
      }
    } catch {
    } finally {
      setActionLoading(null);
    }
  };

  const handleRenameStart = (session) => {
    setMenuOpen(null);
    setRenaming(session.id);
    setRenameValue(session.title || '');
  };

  const handleRenameSubmit = async (sessionId) => {
    if (!renameValue.trim()) {
      setRenaming(null);
      return;
    }
    setActionLoading(sessionId);
    try {
      const resp = await fetch('/api/sessions/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, title: renameValue.trim() }),
      });
      const data = await resp.json();
      if (data.status === 'success') {
        setSessions(prev =>
          prev.map(s => s.id === sessionId ? { ...s, title: renameValue.trim() } : s)
        );
      }
    } catch {
    } finally {
      setRenaming(null);
      setActionLoading(null);
    }
  };

  const handleRenameKeyDown = (e, sessionId) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRenameSubmit(sessionId);
    } else if (e.key === 'Escape') {
      setRenaming(null);
    }
  };

  const groupSessions = (sessions) => {
    const now = new Date();
    const today = now.toDateString();
    const yesterday = new Date(now - 86400000).toDateString();
    const weekAgo = new Date(now - 7 * 86400000);

    const groups = { 'Oggi': [], 'Ieri': [], 'Questa settimana': [], 'Meno recenti': [] };

    sessions.forEach(s => {
      if (!s.date) {
        groups['Meno recenti'].push(s);
        return;
      }
      try {
        const d = new Date(s.date);
        if (d.toDateString() === today) groups['Oggi'].push(s);
        else if (d.toDateString() === yesterday) groups['Ieri'].push(s);
        else if (d > weekAgo) groups['Questa settimana'].push(s);
        else groups['Meno recenti'].push(s);
      } catch {
        groups['Meno recenti'].push(s);
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
          <ArcaLogo size={24} />
          <span className="brand-name" style={{ fontFamily: 'var(--font-serif)', color: 'var(--accent-primary)', marginLeft: '8px', fontSize: '1.2rem' }}>Arca</span>
        </div>
        <button className="new-task-btn" onClick={onNewChat} style={{ background: 'var(--accent-primary)', color: '#0F1C2E', marginTop: '16px' }}>
          <Plus size={16} /> Nuova conversazione
        </button>
      </div>

      {/* Search */}
      <div className="sidebar-search">
        <div className="search-input-wrapper">
          <Search size={14} />
          <input
            type="text"
            className="search-input"
            placeholder="Cerca conversazione..."
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
            <span>Caricamento...</span>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="sessions-empty">
            <MessageSquare size={28} strokeWidth={1.5} />
            <p>Nessuna conversazione</p>
            <span>Inizia una nuova conversazione</span>
          </div>
        ) : (
          <AnimatePresence>
            {groupedSessions.map(([group, items]) => (
              <div key={group}>
                <div className="sessions-group-label">{group}</div>
                {items.map((session, idx) => (
                  <motion.div
                    key={session.id || idx}
                    className={`session-item ${activeSessionId === session.id ? 'active' : ''} ${actionLoading === session.id ? 'loading' : ''}`}
                    onClick={() => !renaming && onResumeSession && onResumeSession(session.id)}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8, height: 0, marginBottom: 0, padding: 0 }}
                    transition={{ delay: idx * 0.03 }}
                  >
                    <div className="session-item-icon">
                      <MessageSquare size={14} />
                    </div>
                    <div className="session-item-content">
                      {renaming === session.id ? (
                        <div className="session-rename-row">
                          <input
                            ref={renameRef}
                            type="text"
                            className="session-rename-input"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => handleRenameKeyDown(e, session.id)}
                            onBlur={() => handleRenameSubmit(session.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <button className="session-rename-confirm" onClick={(e) => { e.stopPropagation(); handleRenameSubmit(session.id); }}>
                            <Check size={12} />
                          </button>
                          <button className="session-rename-cancel" onClick={(e) => { e.stopPropagation(); setRenaming(null); }}>
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="session-item-title">
                            {session.title || 'Nuova conversazione'}
                          </div>
                          <div className="session-item-meta">
                            {(session.relativeDate || session.date) && <span>{session.relativeDate || session.date}</span>}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Action menu */}
                    {!renaming && (
                      <div className="session-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="session-action-btn"
                          onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === session.id ? null : session.id); }}
                        >
                          <MoreHorizontal size={14} />
                        </button>

                        {menuOpen === session.id && (
                          <div className="session-context-menu">
                            <button className="context-menu-item" onClick={() => handleRenameStart(session)}>
                              <Pencil size={12} /> Rinomina
                            </button>
                            <button className="context-menu-item danger" onClick={() => handleDelete(session.id)}>
                              <Trash2 size={12} /> Elimina
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Footer — Status indicators */}
      <div className="sidebar-footer" style={{ borderTop: '1px solid var(--border-subtle)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          <div className={`status-dot ${connState === 'connected' ? 'online' : connState === 'connecting' ? 'connecting' : 'offline'}`} />
          Agente attivo — Assistente documenti
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          <Lock size={12} />
          Connesso in locale
        </div>
      </div>
    </aside>
  );
}
