import { AlertCircle, FileJson, Copy, RefreshCcw } from 'lucide-react';
import './ErrorCard.css';

export default function ErrorCard({ message }) {
  // Try to parse the error if it contains stringified JSON or specific markers
  let parsedError = null;
  let rawText = message;

  try {
    // Basic extraction if it's the specific Arca error format
    if (message.includes('API call failed')) {
      const parts = message.split('Error:');
      if (parts.length > 1) {
        rawText = parts[0].trim();
        parsedError = parts[1].trim();
      }
    }
  } catch (e) {
    // Ignore parse errors and just show raw text
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(message);
  };

  return (
    <div className="error-card">
      <div className="error-card-header">
        <AlertCircle size={16} className="error-icon" />
        <span className="error-title">Task Execution Failed</span>
        <button className="error-action-btn" onClick={handleCopy} title="Copy error">
          <Copy size={14} />
        </button>
      </div>
      
      <div className="error-card-body">
        <p className="error-main-text">{rawText}</p>
        
        {parsedError && (
          <div className="error-details">
            <div className="error-details-header">
              <FileJson size={12} />
              <span>Diagnostic Details</span>
            </div>
            <pre className="error-details-content">{parsedError}</pre>
          </div>
        )}
      </div>
      
      <div className="error-card-footer">
        <span className="error-hint">This error is caused by a model limitation or connection issue.</span>
        <button className="error-retry-btn" onClick={() => window.location.reload()}>
          <RefreshCcw size={12} />
          Reload System
        </button>
      </div>
    </div>
  );
}
