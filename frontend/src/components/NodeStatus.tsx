import type { NodeInfo } from '../types/api';

interface NodeCardProps {
  nodeInfo: NodeInfo;
}

function roleIcon(state: string | undefined, isOnline: boolean): string {
  if (!isOnline) return '✕';
  switch (state) {
    case 'LEADER': return '★';
    case 'CANDIDATE': return '?';
    default: return '◆';
  }
}

function roleClass(state: string | undefined, isOnline: boolean): string {
  if (!isOnline) return 'offline';
  switch (state) {
    case 'LEADER': return 'leader';
    case 'CANDIDATE': return 'candidate';
    default: return 'follower';
  }
}

function NodeCard({ nodeInfo }: NodeCardProps) {
  const { health, metrics } = nodeInfo;
  const isOnline = health !== null;
  const role = roleClass(health?.state, isOnline);

  const getStateBadgeClass = (state: string) => {
    switch (state) {
      case 'LEADER': return 'status-leader-badge';
      case 'FOLLOWER': return 'status-follower-badge';
      case 'CANDIDATE': return 'status-candidate-badge';
      default: return '';
    }
  };

  return (
    <div className={`node-card node-card--${role}`}>
      <div className="node-card-inner">
        <div className="node-card-header">
          <div className="node-card-identity">
            <div className={`node-role-icon node-role-icon--${role}`}>
              {roleIcon(health?.state, isOnline)}
            </div>
            <span className="node-id">{nodeInfo.id}</span>
          </div>
          <span className={`node-status-badge ${isOnline ? 'status-online' : 'status-offline'}`}>
            {isOnline ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>

        {isOnline && health && (
          <>
            <div className="node-state-row">
              <span className="metric-label">STATE</span>
              <span className={`node-status-badge ${getStateBadgeClass(health.state)}`}>
                {health.state}
              </span>
            </div>

            <div className="node-metrics-grid">
              <div className="node-metric-cell">
                <span className="metric-label">TERM</span>
                <span className="metric-hero-sm">{health.term}</span>
              </div>
              <div className="node-metric-cell">
                <span className="metric-label">LEADER</span>
                <span className="metric-secondary">{health.leaderId || '—'}</span>
              </div>
            </div>

            {metrics && (
              <div className="node-log-metrics">
                <div className="node-log-metrics-grid">
                  <div className="node-log-metric">
                    <span className="metric-label">COMMIT</span>
                    <span className="metric-secondary">{metrics.commitIndex ?? 0}</span>
                  </div>
                  <div className="node-log-metric">
                    <span className="metric-label">APPLIED</span>
                    <span className="metric-secondary">{metrics.lastApplied ?? 0}</span>
                  </div>
                  <div className="node-log-metric">
                    <span className="metric-label">LOG</span>
                    <span className="metric-secondary">{metrics.logLength ?? 0}</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {!isOnline && (
          <div style={{ padding: '12px 0', color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: '11px' }}>
            ● UNREACHABLE — Endpoint not responding to /health
          </div>
        )}
      </div>
    </div>
  );
}

interface NodeStatusProps {
  nodeData: NodeInfo[];
}

export function NodeStatus({ nodeData }: NodeStatusProps) {
  if (nodeData.length === 0) {
    return (
      <div className="card">
        <h2>NODE STATUS</h2>
        <div style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: '12px' }}>Loading node data...</div>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>NODE STATUS</h2>
      <div className="node-cards">
        {nodeData.map((node) => (
          <NodeCard key={node.id} nodeInfo={node} />
        ))}
      </div>
    </div>
  );
}
