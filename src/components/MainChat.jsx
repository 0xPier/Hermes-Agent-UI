import { useState, useEffect, useRef, useCallback } from 'react';
import { Settings, MessageSquare, Plus, Send, Zap, MoreVertical, Activity, Terminal, Loader2, WifiOff, Wifi, Cpu } from 'lucide-react';
import { motion } from 'framer-motion';
import ConfigPanel from './ConfigPanel';
import SessionsPanel from './SessionsPanel';
import StatusPanel from './StatusPanel';
import './MainChat.css';

export default function MainChat({ initialConfig }) {
  const [inputVal, setInputVal] = useState('');
  const [messages, setMessages] = useState([]);
  const [activeTab, setActiveTab] = useState('chat');
  const [ws, setWs] = useState(null);
  const [connState, setConnState] = useState('connecting'); // connecting | connected | disconnected | error
  const [isThinking, setIsThinking] = useState(false);
  const [activeModel, setActiveModel] = useState(initialConfig?.model || '');
  const [activeProvider, setActiveProvider] = useState(initialConfig?.provider || 'auto');
  const [resumeSessionId, setResumeSessionId] = useState(null);

  const messagesEndRef = useRef(null);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const activeRuns = useRef(new Set());

  const connectWebSocket = useCallback(() => {
    // Clean up previous
    if (wsRef.current) {
      wsRef.current.close();
    }
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
    }

    setConnState('connecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/chat`);

    socket.onopen = () => {
      setConnState('connected');
      setMessages(prev => {
        // Only add system message if this is the first connection
        if (prev.length === 0) {
          return [{ role: 'assistant', content: 'Connection established to Hermes Agent.', isSystem: true }];
        }
        return prev;
      });
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'ack') {
        activeRuns.current.add(data.runId);
        setIsThinking(true);
      } else if (data.type === 'agent_event') {
        setMessages(prev => {
          const runMsgIdx = prev.findIndex(m => m.runId === data.runId && m.role === 'assistant');
          let newMsgs = [...prev];

          let toolEventDisplay = data.event === 'tool_result'
            ? `> Tool [${data.tool}] Result: ${data.result}`
            : `> Agent invoking tool: ${data.tool}`;

          if (runMsgIdx !== -1) {
            newMsgs[runMsgIdx] = {
              ...newMsgs[runMsgIdx],
              tools: [...(newMsgs[runMsgIdx].tools || []), toolEventDisplay],
            };
          } else {
            newMsgs.push({ role: 'assistant', runId: data.runId, content: '', tools: [toolEventDisplay] });
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
      } else if (data.type === 'stream_end') {
        activeRuns.current.delete(data.runId);
        if (activeRuns.current.size === 0) {
          setIsThinking(false);
        }
      } else if (data.type === 'error') {
        setIsThinking(false);
        activeRuns.current.delete(data.runId);
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: `Error: ${data.message}`, isSystem: true, isError: true },
        ]);
      }
    };

    socket.onclose = () => {
      setConnState('disconnected');
      setIsThinking(false);
      // Auto-reconnect after 3 seconds
      reconnectTimer.current = setTimeout(() => {
        connectWebSocket();
      }, 3000);
    };

    socket.onerror = () => {
      setConnState('error');
    };

    wsRef.current = socket;
    setWs(socket);
  }, []);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connectWebSocket]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(scrollToBottom, [messages, isThinking]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!inputVal.trim() || !ws || connState !== 'connected') return;

    const userMessage = inputVal;
    setInputVal('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    const payload = { action: 'chat.send', message: userMessage };
    if (resumeSessionId) {
      payload.sessionId = resumeSessionId;
      // Clear after first use — subsequent messages continue in the session naturally
    }

    ws.send(JSON.stringify(payload));
  };

  const handleResumeSession = (sessionId) => {
    setResumeSessionId(sessionId);
    setActiveTab('chat');
    setMessages(prev => [
      ...prev,
      { role: 'assistant', content: `Resuming session ${sessionId.slice(0, 8)}... Send a message to continue.`, isSystem: true },
    ]);
  };

  const handleNewChat = () => {
    setResumeSessionId(null);
    setMessages([{ role: 'assistant', content: 'New task started. Connection to Hermes Agent active.', isSystem: true }]);
    setActiveTab('chat');
  };

  const handleConfigChange = ({ model, provider }) => {
    setActiveModel(model);
    setActiveProvider(provider);
  };

  const connLabel = {
    connecting: 'connecting...',
    connected: 'connected',
    disconnected: 'reconnecting...',
    error: 'connection error',
  };

  const connColor = {
    connecting: 'var(--warning)',
    connected: 'var(--success)',
    disconnected: 'var(--error)',
    error: 'var(--error)',
  };

  return (
    <div className="chat-layout">
      {/* Sidebar */}
      <aside className="chat-sidebar">
        <div className="sidebar-header">
          <button className="new-chat-btn" onClick={handleNewChat}>
            <Plus size={18} /> New Agent Task
          </button>
        </div>

        <div className="sidebar-nav">
          <p className="nav-label">Gateway Views</p>
          <div className={`nav-item ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>
            <MessageSquare size={16} /> Chat
          </div>
          <div className={`nav-item ${activeTab === 'sessions' ? 'active' : ''}`} onClick={() => setActiveTab('sessions')}>
            <Terminal size={16} /> Sessions
          </div>
          <div className={`nav-item ${activeTab === 'status' ? 'active' : ''}`} onClick={() => setActiveTab('status')}>
            <Activity size={16} /> System Health
          </div>
        </div>

        <div className="sidebar-footer">
          <div className={`nav-item ${activeTab === 'config' ? 'active' : ''}`} onClick={() => setActiveTab('config')}>
            <Settings size={18} /> Configuration
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <main className="chat-main">
        {activeTab === 'config' ? (
          <ConfigPanel onConfigChange={handleConfigChange} />
        ) : activeTab === 'sessions' ? (
          <SessionsPanel onResumeSession={handleResumeSession} />
        ) : activeTab === 'status' ? (
          <StatusPanel />
        ) : (
          <>
            <header className="chat-topbar">
              <div className="agent-status">
                <div className="status-dot" style={{ background: connColor[connState] }} />
                <span>
                  Hermes Gateway{' '}
                  <span style={{ color: connColor[connState], fontSize: '0.85rem' }}>
                    {connLabel[connState]}
                  </span>
                </span>
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
                    <WifiOff size={18} />
                  </button>
                )}
                <button className="icon-btn"><Zap size={18} /></button>
                <button className="icon-btn"><MoreVertical size={18} /></button>
              </div>
            </header>

            <div className="message-feed">
              {messages.map((msg, idx) => (
                <motion.div
                  key={idx}
                  className="message-bubble-wrapper"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{ display: 'flex', flexDirection: 'column', width: '100%' }}
                >
                  <div className={`message-bubble ${msg.role} ${msg.isError ? 'error' : ''}`}>
                    {msg.role === 'assistant' && !msg.isSystem && (
                      <div className="assistant-header">
                        <Zap size={14} fill="var(--primary)" /> Hermes Agent
                      </div>
                    )}
                    <div className="message-content">
                      {msg.tools && msg.tools.length > 0 && (
                        <div className="tool-cards">
                          {msg.tools.map((t, i) => (
                            <div key={i} className="tool-event-card">
                              {t}
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                    </div>
                  </div>
                </motion.div>
              ))}

              {/* Thinking indicator — shown while waiting for hermes response */}
              {isThinking && (
                <motion.div
                  className="message-bubble-wrapper"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{ display: 'flex', flexDirection: 'column', width: '100%' }}
                >
                  <div className="message-bubble assistant thinking">
                    <div className="assistant-header">
                      <Zap size={14} fill="var(--primary)" /> Hermes Agent
                    </div>
                    <div className="thinking-indicator">
                      <Loader2 size={16} className="spinner" />
                      <span>Thinking...</span>
                    </div>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-area">
              <form className="input-container" onSubmit={handleSend}>
                <input
                  type="text"
                  className="chat-input"
                  placeholder={connState === 'connected' ? "Tell Hermes what to do..." : "Waiting for connection..."}
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  disabled={connState !== 'connected'}
                />
                <button type="submit" className="send-btn" disabled={!inputVal.trim() || connState !== 'connected' || isThinking}>
                  <Send size={18} />
                </button>
              </form>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
