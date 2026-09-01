import type { NodeInfo } from '../types/api';

interface NodeCardProps {
  nodeInfo: NodeInfo;
}

function NodeCard({ nodeInfo }: NodeCardProps) {
  const { health } = nodeInfo;
  const isOnline = health !== null;

  const getStateBadgeClass = (state: string) => {
    switch (state) {
      case 'LEADER':
        return 'status-leader-badge';
      case 'FOLLOWER':
        return 'status-follower-badge';
      case 'CANDIDATE':
        return 'status-candidate-badge';
      default:
        return '';
    }
  };

  return (
    <div className="node-card">
      <div className="node-card-header">
        <span className="node-id">{nodeInfo.id}</span>
        <span className={`node-status-badge ${isOnline ? 'status-online' : 'status-offline'}`}>
          {isOnline ? 'ONLINE' : 'OFFLINE'}
        </span>
      </div>
      {isOnline && (
        <div className="node-details">
          <div className="node-detail-row">
            <span>State</span>
            <span className={`node-status-badge ${getStateBadgeClass(health.state)}`}>
              {health.state}
            </span>
          </div>
          <div className="node-detail-row">
            <span>Term</span>
            <span className="node-detail-value">{health.term}</span>
          </div>
          <div className="node-detail-row">
            <span>Leader</span>
            <span className="node-detail-value">{health.leaderId || '-'}</span>
          </div>
        </div>
      )}
    </div>
  );
}

interface NodeStatusProps {
  nodeData: NodeInfo[];
}

export function NodeStatus({ nodeData }: NodeStatusProps) {
  if (nodeData.length === 0) {
    return (
      <div className="card full-width">
        <h2>Node Status</h2>
        <div className="loading">Loading node data...</div>
      </div>
    );
  }

  return (
    <div className="card full-width">
      <h2>Node Status</h2>
      <div className="node-cards">
        {nodeData.map((node) => (
          <NodeCard key={node.id} nodeInfo={node} />
        ))}
      </div>
    </div>
  );
}
