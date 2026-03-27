import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Zap, Activity, Cpu, User, WifiOff, PanelRightOpen, PanelRightClose, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ConversationSidebar from './ConversationSidebar';
import AgentActivityPanel from './AgentActivityPanel';
import SettingsModal from './SettingsModal';
import ErrorCard from './ErrorCard';
import ReactMarkdown from 'react-markdown';
import './MainChat.css';

const SUGGESTIONS = [
  'Analyze this codebase and suggest improvements',
  'Write a Python script to automate backups',
  'Search the web for the latest AI research',
  'Help me debug this error message',
];

export default function MainChat({ initialConfig }) {
  const [inputVal, setInputVal] = useState('');
  const [messages, setMessages] = useState([]);
  const [ws, setWs] = useState(null);
  const [connState, setConnState] = useState('connecting');
  const [isThinking, setIsThinking] = useState(false);
  const [activeModel, setActiveModel] = useState(initialConfig?.model || '');
  const [activeProvider, setActiveProvider] = useState(initialConfig?.provider || 'auto');
  const [resumeSessionId, setResumeSessionId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activityCollapsed, setActivityCollapsed] = useState(false);
  const [toolEvents, setToolEvents] = useState([]);
  const [sidebarRefresh, setSidebarRefresh] = useState(0);

  const messagesEndRef = useRef(null);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const activeRuns = useRef(new Set());
  const textareaRef = useRef(null);
  const isMounted = useRef(true);

  // ── WebSocket Connection ──
  const connectWebSocket = useCallback(() => {
    if (!isMounted.current) return;
    if (wsRef.current && wsRef.current.readyState < 2) {
      // Already open or connecting — skip
      return;
    }
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);

    setConnState('connecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
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
        const time = new Date().toLocaleTimeString();
        const isResult = data.event === 'tool_result';
        const eventText = isResult
          ? `${data.tool}: ${data.result || data.params}`
          : `${data.tool}: ${data.params || 'executing'}`;

        // Add to activity timeline
        setToolEvents(prev => [...prev, {
          type: isResult ? 'tool-result' : 'tool-call',
          text: eventText,
          time,
          rawData: data, // Store raw data for detailed view
          tool: data.tool,
          params: data.params,
          result: data.result,
        }]);

        // Inline tool display in chat
        setMessages(prev => {
          const runMsgIdx = prev.findIndex(m => m.runId === data.runId && m.role === 'assistant');
          let toolDisplay = isResult
            ? `Tool [${data.tool}] → ${data.result || data.params || 'completed'}`
            : `⚡ ${data.tool} ${data.params ? `(${data.params})` : ''}`;
          let toolType = isResult ? 'result' : 'call';

          let newMsgs = [...prev];
          if (runMsgIdx !== -1) {
            newMsgs[runMsgIdx] = {
              ...newMsgs[runMsgIdx],
              tools: [...(newMsgs[runMsgIdx].tools || []), { text: toolDisplay, type: toolType }],
            };
          } else {
            newMsgs.push({ role: 'assistant', runId: data.runId, content: '', tools: [{ text: toolDisplay, type: toolType }] });
          }
          return newMsgs;
        });
      } else if (data.type === 'stream_start') {
        setMessages(prev => {
          if (!prev.find(m => m.runId === data.runId)) {
            return [...prev, { role: 'assistant', runId: data.runId, content: '', tools: [] }];
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
        // Backend captured the session ID from hermes output — store it
        // so subsequent messages in this chat window resume the same session
        setResumeSessionId(data.sessionId);
      } else if (data.type === 'stream_end') {
        activeRuns.current.delete(data.runId);
        if (activeRuns.current.size === 0) setIsThinking(false);
        // Refresh sidebar to show newly created/updated session
        setSidebarRefresh(prev => prev + 1);
      } else if (data.type === 'error') {
        setIsThinking(false);
        activeRuns.current.delete(data.runId);
        setToolEvents(prev => [...prev, {
          type: 'error',
          text: data.message,
          time: new Date().toLocaleTimeString(),
        }]);
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: `Error: ${data.message}`, isSystem: true, isError: true },
        ]);
      }
    };

    socket.onclose = () => {
      setConnState('disconnected');
      setIsThinking(false);
      // Only reconnect if still mounted, with increasing delay
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
        wsRef.current.onclose = null; // prevent reconnect on cleanup
        wsRef.current.close();
      }
    };
  }, [connectWebSocket]);

  // ── Auto-scroll ──
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(scrollToBottom, [messages, isThinking]);

  // ── Auto-resize textarea ──
  const adjustTextarea = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }
  };

  // ── Send ──
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

  // ── Handlers ──
  const handleResumeSession = (sessionId) => {
    setResumeSessionId(sessionId);
    setMessages(prev => [
      ...prev,
      { role: 'assistant', content: `Resuming session ${sessionId.slice(0, 8)}... Send a message to continue.`, isSystem: true },
    ]);
  };

  const handleNewChat = () => {
    setResumeSessionId(null);
    setMessages([]);
    setToolEvents([]);
  };

  const handleConfigChange = ({ model, provider }) => {
    setActiveModel(model);
    setActiveProvider(provider);
  };

  const handleSuggestionClick = (text) => {
    setInputVal(text);
    textareaRef.current?.focus();
  };

  const connColor = {
    connecting: 'var(--warning)',
    connected: 'var(--success)',
    disconnected: 'var(--error)',
    error: 'var(--error)',
  };
  const connClass = {
    connecting: 'connecting',
    connected: 'online',
    disconnected: 'offline',
    error: 'offline',
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="chat-layout">
      {/* Left Rail — Conversation Sidebar */}
      <ConversationSidebar
        onNewChat={handleNewChat}
        onResumeSession={handleResumeSession}
        onOpenSettings={() => setSettingsOpen(true)}
        activeSessionId={resumeSessionId}
        refreshTrigger={sidebarRefresh}
      />

      {/* Center — Chat Panel */}
      <main className="chat-main">
        {/* Top Bar */}
        <header className="chat-topbar">
          <div className="topbar-left">
            <div className="agent-status">
              <div className={`status-dot ${connClass[connState]}`} />
              <span className="agent-status-label">Arca</span>
              <span className="conn-label" style={{ color: connColor[connState] }}>
                {connState === 'connected' ? 'Online' : connState === 'connecting' ? 'Connecting...' : 'Offline'}
              </span>
            </div>
            {activeModel && (
              <div className="model-badge">
                <Cpu size={12} />
                <span>{activeModel}</span>
                {activeProvider && activeProvider !== 'auto' && (
                  <span className="provider-tag">{activeProvider}</span>
                )}
              </div>
            )}
          </div>
          <div className="topbar-actions">
            {connState === 'disconnected' && (
              <button className="icon-btn" onClick={connectWebSocket} title="Reconnect">
                <WifiOff size={16} />
              </button>
            )}
            <button
              className="icon-btn"
              onClick={() => setActivityCollapsed(!activityCollapsed)}
              title={activityCollapsed ? 'Show activity panel' : 'Hide activity panel'}
            >
              {activityCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
            </button>
          </div>
        </header>

        {/* Messages / Empty State */}
        {!hasMessages ? (
          <div className="chat-empty-state">
            <div className="empty-state-icon">
              <Zap size={28} color="var(--accent-primary)" />
            </div>
            <h1 className="empty-state-title heading-gradient">
              What would you like Arca to do?
            </h1>
            <p className="empty-state-subtitle">
              Arca is an autonomous AI agent that can browse the web, write code, manage files, and execute tasks.
            </p>
            <div className="suggestion-chips">
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
                        {msg.content}
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
                  {msg.role === 'assistant' && (
                    <div className="message-avatar agent">
                      <Zap size={14} />
                    </div>
                  )}
                  <div className={`message-bubble ${msg.role}`}>
                    {/* Tool cards */}
                    {msg.tools && msg.tools.length > 0 && (
                      <div className="tool-cards">
                        {msg.tools.map((t, i) => (
                          <div key={i} className={`tool-event-card ${t.type === 'result' ? 'result' : ''}`}>
                            {t.text || t}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="message-content">
                      {msg.role === 'assistant'
                        ? <ReactMarkdown>{msg.content}</ReactMarkdown>
                        : msg.content}
                    </div>
                  </div>
                  {msg.role === 'user' && (
                    <div className="message-avatar user-avatar">
                      <User size={14} />
                    </div>
                  )}
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
                <div className="message-avatar agent">
                  <Zap size={14} />
                </div>
                <div className="thinking-bubble">
                  <div className="thinking-dots">
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                  </div>
                  <span className="thinking-text">Thinking...</span>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Input Area */}
        <div className="chat-input-area">
          <form className="input-container" onSubmit={handleSend}>
            <textarea
              ref={textareaRef}
              className="chat-textarea"
              placeholder={connState === 'connected' ? 'Tell Arca what to do...' : 'Waiting for connection...'}
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
              disabled={!inputVal.trim() || connState !== 'connected' || isThinking}
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      </main>

      {/* Right Rail — Agent Activity */}
      <AgentActivityPanel
        collapsed={activityCollapsed}
        onToggle={() => setActivityCollapsed(!activityCollapsed)}
        connState={connState}
        activeModel={activeModel}
        activeProvider={activeProvider}
        toolEvents={toolEvents}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onConfigChange={handleConfigChange}
      />
    </div>
  );
}