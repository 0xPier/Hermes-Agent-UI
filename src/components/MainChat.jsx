import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Zap, User, Paperclip, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import ConversationSidebar from './ConversationSidebar';
import ErrorCard from './ErrorCard';
import ReactMarkdown from 'react-markdown';
import ArcaLogo from './ArcaLogo';
import './MainChat.css';

const SUGGESTIONS = [
  'Riassumi un documento',
  'Bozza una comunicazione',
  'Rispondi a una domanda',
];

export default function MainChat({ providerInfo, onChangeProvider }) {
  const [inputVal, setInputVal] = useState('');
  const [messages, setMessages] = useState([]);
  const [ws, setWs] = useState(null);
  const [connState, setConnState] = useState('connecting');
  const [isThinking, setIsThinking] = useState(false);
  const [resumeSessionId, setResumeSessionId] = useState(null);
  const [sidebarRefresh, setSidebarRefresh] = useState(0);
  const [uploading, setUploading] = useState(false);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const activeRuns = useRef(new Set());
  const textareaRef = useRef(null);
  const isMounted = useRef(true);

  // ── WebSocket Connection ──
  const connectWebSocket = useCallback(() => {
    if (!isMounted.current) return;
    if (wsRef.current && wsRef.current.readyState < 2) return;
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);

    setConnState('connecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Use relative path for Docker compatibility
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/chat`);

    socket.onopen = () => {
      if (!isMounted.current) { socket.close(); return; }
      setConnState('connected');
    };

    socket.onmessage = (event) => {
      if (!isMounted.current) return;
      const data = JSON.parse(event.data);

      if (data.type === 'ack') {
        activeRuns.current.add(data.runId);
        setIsThinking(true);
      } else if (data.type === 'agent_event') {
        // Suppress developer-focused tool events for Arca to keep UI clean
      } else if (data.type === 'stream_start') {
        setMessages(prev => {
          if (!prev.find(m => m.runId === data.runId)) {
            return [...prev, { role: 'assistant', runId: data.runId, content: '' }];
          }
          return prev;
        });
      } else if (data.type === 'stream_chunk') {
        setIsThinking(false);
        setMessages(prev => {
          const runMsgIdx = prev.findIndex(m => m.runId === data.runId && m.role === 'assistant');
          if (runMsgIdx !== -1) {
            let newMsgs = [...prev];
            newMsgs[runMsgIdx] = {
              ...newMsgs[runMsgIdx],
              content: newMsgs[runMsgIdx].content + data.chunk,
            };
            return newMsgs;
          }
          return prev;
        });
      } else if (data.type === 'session_info') {
        setResumeSessionId(data.sessionId);
      } else if (data.type === 'stream_end') {
        activeRuns.current.delete(data.runId);
        if (activeRuns.current.size === 0) setIsThinking(false);
        setSidebarRefresh(prev => prev + 1);
      } else if (data.type === 'error') {
        setIsThinking(false);
        activeRuns.current.delete(data.runId);
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: `Si è verificato un errore. Riprova.`, isSystem: true, isError: true },
        ]);
      }
    };

    socket.onclose = () => {
      setConnState('disconnected');
      setIsThinking(false);
      if (isMounted.current) {
        reconnectTimer.current = setTimeout(() => connectWebSocket(), 5000);
      }
    };

    socket.onerror = () => {
      setConnState('error');
    };

    wsRef.current = socket;
    setWs(socket);
  }, []);

  useEffect(() => {
    isMounted.current = true;
    connectWebSocket();
    return () => {
      isMounted.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connectWebSocket]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(scrollToBottom, [messages, isThinking]);

  const adjustTextarea = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }
  };

  const handleSend = (e) => {
    e?.preventDefault();
    if (!inputVal.trim() || !ws || connState !== 'connected') return;

    const userMessage = inputVal;
    setInputVal('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    const payload = { action: 'chat.send', message: userMessage };
    if (resumeSessionId) {
      payload.sessionId = resumeSessionId;
    }

    ws.send(JSON.stringify(payload));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const resp = await fetch('/api/ingest', {
        method: 'POST',
        body: formData,
      });
      if (resp.ok) {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: `Documento **${file.name}** caricato ed analizzato con successo.`, isSystem: true }
        ]);
      } else {
        throw new Error("Upload failed");
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Si è verificato un errore durante il caricamento di ${file.name}. Riprova.`, isSystem: true, isError: true }
      ]);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleResumeSession = (sessionId) => {
    setResumeSessionId(sessionId);
    setMessages(prev => [
      ...prev,
      { role: 'assistant', content: `Ripresa conversazione...`, isSystem: true },
    ]);
  };

  const handleNewChat = () => {
    setResumeSessionId(null);
    setMessages([]);
  };

  const handleSuggestionClick = (text) => {
    setInputVal(text);
    textareaRef.current?.focus();
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="chat-layout">
      {/* Left Rail — Conversation Sidebar */}
      <ConversationSidebar
        onNewChat={handleNewChat}
        onResumeSession={handleResumeSession}
        activeSessionId={resumeSessionId}
        refreshTrigger={sidebarRefresh}
        connState={connState}
        providerInfo={providerInfo}
        onChangeProvider={onChangeProvider}
      />

      {/* Center — Chat Panel */}
      <main className="chat-main arca-main">
        {/* Messages / Empty State */}
        {!hasMessages ? (
          <div className="chat-empty-state">
            <div className="empty-state-icon arca-logo-container">
              <ArcaLogo size={60} />
            </div>
            <h1 className="empty-state-title" style={{ marginTop: '20px', fontFamily: 'var(--font-serif)', color: 'var(--accent-primary)' }}>Arca</h1>
            <p className="empty-state-subtitle" style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
              Il tuo ufficio. La tua intelligenza. Nessun cloud.
            </p>
            <div className="suggestion-chips" style={{ marginTop: '30px' }}>
              {SUGGESTIONS.map((s, i) => (
                <button key={i} className="suggestion-chip" onClick={() => handleSuggestionClick(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="message-feed">
            {messages.map((msg, idx) => {
              if (msg.isSystem) {
                return (
                  <motion.div
                    key={idx}
                    className="message-row"
                    style={{ justifyContent: 'center' }}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    {msg.isError ? (
                      <ErrorCard message={msg.content} />
                    ) : (
                      <div className="message-bubble system">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    )}
                  </motion.div>
                );
              }

              return (
                <motion.div
                  key={idx}
                  className={`message-row ${msg.role}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className={`message-bubble ${msg.role}`}>
                    <div className="message-content">
                      {msg.role === 'assistant'
                        ? <ReactMarkdown>{msg.content}</ReactMarkdown>
                        : msg.content}
                    </div>
                  </div>
                </motion.div>
              );
            })}

            {/* Thinking */}
            {isThinking && (
              <motion.div
                className="message-row assistant"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="thinking-bubble">
                  <Loader2 size={16} className="spinner" style={{ marginRight: '8px', color: 'var(--accent-primary)' }}/>
                  <span className="thinking-text" style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>Arca sta elaborando...</span>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Input Area */}
        <div className="chat-input-area">
          <div className="active-agent-bar">
            Agente: Assistente documenti
          </div>
          <form className="input-container arca-input" onSubmit={handleSend}>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleFileUpload}
              accept=".pdf,.docx"
            />
            <button
              type="button"
              className="icon-btn attach-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Carica documento"
              disabled={connState !== 'connected' || uploading}
            >
              {uploading ? <Loader2 size={18} className="spinner" /> : <Paperclip size={18} />}
            </button>
            <textarea
              ref={textareaRef}
              className="chat-textarea"
              placeholder={connState === 'connected' ? 'Scrivi un messaggio o carica un documento...' : 'Connessione in corso...'}
              value={inputVal}
              onChange={(e) => {
                setInputVal(e.target.value);
                adjustTextarea();
              }}
              onKeyDown={handleKeyDown}
              disabled={connState !== 'connected'}
              rows={1}
            />
            <button
              type="submit"
              className="send-btn"
              style={{ background: 'var(--accent-primary)', color: '#0F1C2E' }}
              disabled={!inputVal.trim() || connState !== 'connected' || isThinking}
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}