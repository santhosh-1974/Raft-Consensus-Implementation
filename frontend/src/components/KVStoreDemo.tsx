import { useState } from 'react';
import { NODES, getValue, setValue as apiSetValue, deleteValue } from '../services/api';
import type { KVResponse, KVGetResponse } from '../types/api';

interface OperationResult {
  operation: 'GET' | 'PUT' | 'DELETE';
  key: string;
  value?: string;
  request: string;
  response: string;
  status: 'SUCCESS' | 'FAILED';
  statusText: string;
}

export interface RecentWrite {
  method: 'PUT' | 'DELETE';
  key: string;
  index: number;
}

interface KVStoreDemoProps {
  onSuccessfulWrite: (write: RecentWrite) => void;
}

// Initial clean sample result showing a healthy operator console
const INITIAL_SAMPLE_RESULT: OperationResult = {
  operation: 'GET',
  key: 'config.timeout',
  value: '5000ms',
  request: 'GET http://localhost:8001/kv/config.timeout',
  response: JSON.stringify({ success: true, value: '5000ms', leader: 'node1' }, null, 2),
  status: 'SUCCESS',
  statusText: '200 OK'
};

export function KVStoreDemo({ onSuccessfulWrite }: KVStoreDemoProps) {
  const [key, setKey] = useState('');
  const [value, setValueInput] = useState('');
  const [requestId, setRequestId] = useState('');
  const [selectedNode, setSelectedNode] = useState(NODES[0].url);
  const [result, setResult] = useState<OperationResult | null>(INITIAL_SAMPLE_RESULT);
  const [isLoading, setIsLoading] = useState(false);

  const generateRequestId = () => {
    return `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  };

  const handleGet = async () => {
    if (!key.trim()) {
      setResult({
        operation: 'GET',
        key,
        request: `GET /kv/${key}`,
        response: 'Error: Key is required',
        status: 'FAILED',
        statusText: 'INVALID PARAMETER'
      });
      return;
    }

    setIsLoading(true);
    try {
      const response: KVGetResponse = await getValue(selectedNode, key);
      const isSuccess = response.success === true;
      let statusText = isSuccess ? '200 OK' : 'FAILED';
      if (!isSuccess && 'error' in response && response.error?.includes('Key not found')) {
        statusText = '404 NOT FOUND';
      } else if (!isSuccess && 'leader' in response) {
        statusText = 'NOT LEADER';
      }

      setResult({
        operation: 'GET',
        key,
        value: isSuccess ? (response.value ?? 'null') : undefined,
        request: `GET ${selectedNode}/kv/${key}`,
        response: JSON.stringify(response, null, 2),
        status: isSuccess ? 'SUCCESS' : 'FAILED',
        statusText
      });
    } catch (error) {
      setResult({
        operation: 'GET',
        key,
        request: `GET ${selectedNode}/kv/${key}`,
        response: `Error: ${error instanceof Error ? error.message : 'Network error'}`,
        status: 'FAILED',
        statusText: 'NETWORK ERROR'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSet = async () => {
    if (!key.trim() || !value.trim()) {
      setResult({
        operation: 'PUT',
        key,
        value,
        request: `PUT /kv/${key}`,
        response: 'Error: Key and value are required',
        status: 'FAILED',
        statusText: 'INVALID PARAMETER'
      });
      return;
    }

    setIsLoading(true);
    const id = requestId.trim() || generateRequestId();
    try {
      const response: KVResponse = await apiSetValue(selectedNode, key, value, id);
      const isSuccess = response.success === true;
      if (isSuccess && 'index' in response) {
        onSuccessfulWrite({ method: 'PUT', key, index: response.index });
      }

      let statusText = isSuccess ? '200 COMMITTED' : 'FAILED';
      if (!isSuccess && 'leader' in response) {
        statusText = 'NOT LEADER';
      }

      setResult({
        operation: 'PUT',
        key,
        value,
        request: `PUT ${selectedNode}/kv/${key} (requestId: ${id})`,
        response: JSON.stringify(response, null, 2),
        status: isSuccess ? 'SUCCESS' : 'FAILED',
        statusText
      });
    } catch (error) {
      setResult({
        operation: 'PUT',
        key,
        value,
        request: `PUT ${selectedNode}/kv/${key}`,
        response: `Error: ${error instanceof Error ? error.message : 'Network error'}`,
        status: 'FAILED',
        statusText: 'NETWORK ERROR'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!key.trim()) {
      setResult({
        operation: 'DELETE',
        key,
        request: `DELETE /kv/${key}`,
        response: 'Error: Key is required',
        status: 'FAILED',
        statusText: 'INVALID PARAMETER'
      });
      return;
    }

    setIsLoading(true);
    const id = requestId.trim() || generateRequestId();
    try {
      const response: KVResponse = await deleteValue(selectedNode, key, id);
      const isSuccess = response.success === true;
      if (isSuccess && 'index' in response) {
        onSuccessfulWrite({ method: 'DELETE', key, index: response.index });
      }

      let statusText = isSuccess ? '200 DELETED' : 'FAILED';
      if (!isSuccess && 'error' in response && response.error?.includes('Key not found')) {
        statusText = '404 NOT FOUND';
      } else if (!isSuccess && 'leader' in response) {
        statusText = 'NOT LEADER';
      }

      setResult({
        operation: 'DELETE',
        key,
        request: `DELETE ${selectedNode}/kv/${key} (requestId: ${id})`,
        response: JSON.stringify(response, null, 2),
        status: isSuccess ? 'SUCCESS' : 'FAILED',
        statusText
      });
    } catch (error) {
      setResult({
        operation: 'DELETE',
        key,
        request: `DELETE ${selectedNode}/kv/${key}`,
        response: `Error: ${error instanceof Error ? error.message : 'Network error'}`,
        status: 'FAILED',
        statusText: 'NETWORK ERROR'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="card">
      <h2>KEY-VALUE OPERATOR CONSOLE</h2>

      <div className="kv-controls">
        <div className="input-group">
          <label htmlFor="targetNode">TARGET NODE ENDPOINT</label>
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
          <div className="input-group">
            <label htmlFor="key">KEY</label>
            <input
              id="key"
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="e.g. config.timeout"
            />
          </div>
          <div className="input-group">
            <label htmlFor="value">VALUE (FOR PUT)</label>
            <input
              id="value"
              type="text"
              value={value}
              onChange={(e) => setValueInput(e.target.value)}
              placeholder="e.g. 5000ms"
            />
          </div>
        </div>

        <div className="input-group">
          <label htmlFor="requestId">IDEMPOTENCY REQUEST ID (OPTIONAL)</label>
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
            {isLoading ? 'EXECUTING…' : 'GET'}
          </button>
          <button onClick={handleSet} className="btn btn-success" disabled={isLoading}>
            {isLoading ? 'EXECUTING…' : 'PUT'}
          </button>
          <button onClick={handleDelete} className="btn btn-danger" disabled={isLoading}>
            {isLoading ? 'EXECUTING…' : 'DELETE'}
          </button>
        </div>

        <div className="result-display">
          {result ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="metric-label">LAST OPERATOR COMMAND</span>
                <span className={`result-status ${result.status === 'SUCCESS' ? 'result-status-success' : 'result-status-failed'}`}>
                  {result.statusText}
                </span>
              </div>
              <div style={{ color: 'var(--muted)', fontSize: '11px', fontFamily: 'var(--mono)' }}>
                {result.request}
              </div>
              {result.value !== undefined && (
                <div style={{ color: 'var(--cyan)', fontSize: '11px', fontFamily: 'var(--mono)' }}>
                  VALUE: {result.value}
                </div>
              )}
              <pre>{result.response}</pre>
            </>
          ) : (
            <div style={{ color: 'var(--dim)', fontStyle: 'italic' }}>
              Console ready. Enter key/value and trigger GET, PUT, or DELETE.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
