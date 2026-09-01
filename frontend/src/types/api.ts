export type NodeState = 'FOLLOWER' | 'CANDIDATE' | 'LEADER';

export interface HealthResponse {
  nodeId: string;
  state: NodeState;
  term: number;
  leaderId: string | null;
}

export interface MetricsResponse {
  electionsStarted: number;
  leaderChanges: number;
  replicationFailures: number;
  entriesCommitted: number;
  currentTerm: number;
  state: NodeState;
  commitIndex: number;
  lastApplied: number;
  logLength: number;
}

export interface KVSuccessResponse {
  success: true;
  index: number;
}

export interface KVErrorResponse {
  success: false;
  error: string;
}

export interface KVNotLeaderResponse {
  success: false;
  leader: string | null;
}

export type KVResponse = KVSuccessResponse | KVErrorResponse | KVNotLeaderResponse;

export interface KVGetSuccessResponse {
  success: true;
  value: string | null;
  leader: string;
}

export interface KVGetErrorResponse {
  success: false;
  error: string;
}

export interface KVGetNotLeaderResponse {
  success: false;
  leader: string | null;
}

export type KVGetResponse = KVGetSuccessResponse | KVGetErrorResponse | KVGetNotLeaderResponse;

export interface NodeInfo {
  id: string;
  url: string;
  health: HealthResponse | null;
  metrics: MetricsResponse | null;
}
