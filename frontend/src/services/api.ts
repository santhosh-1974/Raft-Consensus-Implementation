import type {
  HealthResponse,
  MetricsResponse,
  KVResponse,
  KVGetResponse,
} from '../types/api';

const NODES = [
  { id: 'node1', url: 'http://localhost:5001' },
  { id: 'node2', url: 'http://localhost:5002' },
  { id: 'node3', url: 'http://localhost:5003' },
];

export async function getHealth(nodeUrl: string): Promise<HealthResponse> {
  const response = await fetch(`${nodeUrl}/health`);
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }
  return response.json();
}

export async function getMetrics(nodeUrl: string): Promise<MetricsResponse> {
  const response = await fetch(`${nodeUrl}/metrics`);
  if (!response.ok) {
    throw new Error(`Metrics fetch failed: ${response.status}`);
  }
  return response.json();
}

export async function getValue(nodeUrl: string, key: string): Promise<KVGetResponse> {
  const response = await fetch(`${nodeUrl}/kv/${encodeURIComponent(key)}`);
  return response.json();
}

export async function setValue(
  nodeUrl: string,
  key: string,
  value: string,
  requestId?: string
): Promise<KVResponse> {
  const response = await fetch(`${nodeUrl}/kv/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ value, requestId }),
  });
  return response.json();
}

export async function deleteValue(
  nodeUrl: string,
  key: string,
  requestId?: string
): Promise<KVResponse> {
  const response = await fetch(`${nodeUrl}/kv/${encodeURIComponent(key)}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requestId }),
  });
  return response.json();
}

export { NODES };
