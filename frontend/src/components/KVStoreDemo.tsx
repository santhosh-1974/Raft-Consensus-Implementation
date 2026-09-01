import { useState } from 'react';
import { NODES, getValue, setValue as apiSetValue, deleteValue } from '../services/api';
import type { KVResponse, KVGetResponse } from '../types/api';

interface OperationResult {
  request: string;
  response: string;
  status: 'SUCCESS' | 'FAILED';
}

export function KVStoreDemo() {
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
    <div className="card full-width">
      <h2>KV Store Demo</h2>
      <div className="kv-controls">
        <div className="input-group">
          <label htmlFor="targetNode">Target Node</label>
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
        <div className="input-group">
          <label htmlFor="key">Key</label>
          <input
            id="key"
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Enter key"
          />
        </div>
        <div className="input-group">
          <label htmlFor="value">Value</label>
          <input
            id="value"
            type="text"
            value={value}
            onChange={(e) => setValueInput(e.target.value)}
            placeholder="Enter value"
          />
        </div>
        <div className="input-group">
          <label htmlFor="requestId">Request ID</label>
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
            {isLoading ? 'Loading...' : 'GET'}
          </button>
          <button onClick={handleSet} className="btn btn-success" disabled={isLoading}>
            {isLoading ? 'Loading...' : 'SET'}
          </button>
          <button onClick={handleDelete} className="btn btn-danger" disabled={isLoading}>
            {isLoading ? 'Loading...' : 'DELETE'}
          </button>
        </div>
        
        {result && (
          <div className="result-display">
            <div>
              <strong>Last Request</strong>
              <pre>{result.request}</pre>
            </div>
            <div>
              <strong>Status</strong>
              <span className={`result-status ${result.status === 'SUCCESS' ? 'result-status-success' : 'result-status-failed'}`}>
                {result.status}
              </span>
            </div>
            <div>
              <strong>Response</strong>
              <pre>{result.response}</pre>
            </div>
          </div>
        )}

        <div className="note">
          <strong>Idempotency:</strong> requestId provides idempotent write handling. Retrying the same requestId does not create a duplicate state-machine operation.
        </div>
      </div>
    </div>
  );
}
