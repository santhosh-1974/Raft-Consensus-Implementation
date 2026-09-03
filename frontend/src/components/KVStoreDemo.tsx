import { useState } from 'react';
import { NODES, getValue, setValue as apiSetValue, deleteValue } from '../services/api';
import type { KVResponse, KVGetResponse } from '../types/api';

interface OperationResult {
  request: string;
  response: string;
  status: 'SUCCESS' | 'FAILED';
}

export interface RecentWrite {
  method: 'PUT' | 'DELETE';
  key: string;
  index: number;
}

interface KVStoreDemoProps {
  onSuccessfulWrite: (write: RecentWrite) => void;
}

export function KVStoreDemo({ onSuccessfulWrite }: KVStoreDemoProps) {
  const [key, setKey] = useState('');
  const [value, setValueInput] = useState('');
  const [requestId, setRequestId] = useState('');
  const [selectedNode, setSelectedNode] = useState(NODES[0].url);
  const [result, setResult] = useState<OperationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const generateRequestId = () => {
    return `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  };

  const handleGet = async () => {
    if (!key.trim()) {
      setResult({
        request: `GET /kv/${key}`,
        response: 'Error: Key is required',
        status: 'FAILED'
      });
      return;
    }

    setIsLoading(true);
    try {
      const response: KVGetResponse = await getValue(selectedNode, key);
      setResult({
        request: `GET /kv/${key}`,
        response: JSON.stringify(response, null, 2),
        status: response.success ? 'SUCCESS' : 'FAILED'
      });
    } catch (error) {
      setResult({
        request: `GET /kv/${key}`,
        response: `Error: ${error instanceof Error ? error.message : 'Network error'}`,
        status: 'FAILED'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSet = async () => {
    if (!key.trim() || !value.trim()) {
      setResult({
        request: `PUT /kv/${key}`,
        response: 'Error: Key and value are required',
        status: 'FAILED'
      });
      return;
    }

    setIsLoading(true);
    const id = requestId.trim() || generateRequestId();
    try {
      const response: KVResponse = await apiSetValue(selectedNode, key, value, id);
      if (response.success) {
        onSuccessfulWrite({ method: 'PUT', key, index: response.index });
      }
      setResult({
        request: `PUT /kv/${key}`,
        response: JSON.stringify(response, null, 2),
        status: response.success ? 'SUCCESS' : 'FAILED'
      });
    } catch (error) {
      setResult({
        request: `PUT /kv/${key}`,
        response: `Error: ${error instanceof Error ? error.message : 'Network error'}`,
        status: 'FAILED'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!key.trim()) {
      setResult({
        request: `DELETE /kv/${key}`,
        response: 'Error: Key is required',
        status: 'FAILED'
      });
      return;
    }

    setIsLoading(true);
    const id = requestId.trim() || generateRequestId();
    try {
      const response: KVResponse = await deleteValue(selectedNode, key, id);
      if (response.success) {
        onSuccessfulWrite({ method: 'DELETE', key, index: response.index });
      }
      setResult({
        request: `DELETE /kv/${key}`,
        response: JSON.stringify(response, null, 2),
        status: response.success ? 'SUCCESS' : 'FAILED'
      });
    } catch (error) {
      setResult({
        request: `DELETE /kv/${key}`,
        response: `Error: ${error instanceof Error ? error.message : 'Network error'}`,
        status: 'FAILED'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="card">
      <h2>KV STORE</h2>

      <div className="kv-controls">
        <div className="input-group">
          <label htmlFor="targetNode">TARGET NODE</label>
          <select
            id="targetNode"
            value={selectedNode}
            onChange={(e) => setSelectedNode(e.target.value)}
          >
            {NODES.map((node) => (
              <option key={node.id} value={node.url}>
                {node.id} — {node.url}
              </option>
            ))}
          </select>
        </div>

        <div className="kv-fields">
          <div className="input-group kv-field">
            <label htmlFor="key">KEY</label>
            <input
              id="key"
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Enter key"
            />
          </div>
          <div className="input-group kv-field">
            <label htmlFor="value">VALUE</label>
            <input
              id="value"
              type="text"
              value={value}
              onChange={(e) => setValueInput(e.target.value)}
              placeholder="Enter value"
            />
          </div>
        </div>

        <div className="input-group kv-request-id">
          <label htmlFor="requestId">REQUEST ID (OPTIONAL)</label>
          <input
            id="requestId"
            type="text"
            value={requestId}
            onChange={(e) => setRequestId(e.target.value)}
            placeholder="Auto-generated if empty"
          />
        </div>

        <div className="button-group">
          <button onClick={handleGet} className="btn btn-primary" disabled={isLoading}>
            {isLoading ? 'LOADING...' : 'GET'}
          </button>
          <button onClick={handleSet} className="btn btn-success" disabled={isLoading}>
            {isLoading ? 'LOADING...' : 'PUT'}
          </button>
          <button onClick={handleDelete} className="btn btn-danger" disabled={isLoading}>
            {isLoading ? 'LOADING...' : 'DELETE'}
          </button>
        </div>

        <div className={`result-display ${result ? 'result-display-visible' : ''}`}>
          {result ? (
            <>
              <div className="result-block">
                <div style={{
                  fontSize: '0.625rem',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '0.25rem'
                }}>
                  LAST REQUEST
                </div>
                <pre style={{
                  background: 'var(--bg-secondary)',
                  padding: '0.5rem',
                  borderRadius: '4px',
                  fontSize: '0.6875rem',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                  border: '1px solid var(--border-subtle)'
                }}>
                  {result.request}
                </pre>
              </div>
              <div className="result-block">
                <div style={{
                  fontSize: '0.625rem',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '0.25rem'
                }}>
                  STATUS
                </div>
                <span className={`result-status ${result.status === 'SUCCESS' ? 'result-status-success' : 'result-status-failed'}`}>
                  {result.status === 'SUCCESS'
                    ? 'SUCCESS'
                    : result.response.includes('Key not found')
                      ? '404 KEY NOT FOUND'
                      : 'FAILED'}
                </span>
              </div>
              <div className="result-block">
                <div style={{
                  fontSize: '0.625rem',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '0.25rem'
                }}>
                  RESPONSE
                </div>
                <pre style={{
                  background: 'var(--bg-secondary)',
                  padding: '0.75rem',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                  border: '1px solid var(--border-subtle)'
                }}>
                  {result.response}
                </pre>
              </div>
            </>
          ) : (
            <div className="result-empty">Waiting for operation...</div>
          )}
        </div>

        <div className="note">
          <strong>Idempotency:</strong> requestId provides idempotent write handling. Retrying the same requestId does not create a duplicate state-machine operation.
        </div>
      </div>
    </div>
  );
}
