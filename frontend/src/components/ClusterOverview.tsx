import type { NodeInfo } from '../types/api';

interface ClusterOverviewProps {
  nodeData: NodeInfo[];
}

export function ClusterOverview({ nodeData }: ClusterOverviewProps) {
  const onlineNodes = nodeData.filter(n => n.health !== null);
  
  const leaders = onlineNodes.filter(n => n.health?.state === 'LEADER');
  const currentLeader = leaders.length > 0 ? leaders[0].health?.nodeId : null;
  const currentTerm = onlineNodes.length > 0 ? onlineNodes[0].health?.term : 0;
  const isHealthy = onlineNodes.length === 3 && currentLeader !== null;

  return (
    <div className="card full-width">
      <h2>Cluster Overview</h2>
      <div className="cluster-info">
        <div className="info-item">
          <span className="label">Cluster Status</span>
          <span className={`value ${isHealthy ? 'status-healthy' : 'status-unhealthy'}`}>
            {isHealthy ? 'Healthy' : 'Degraded'}
          </span>
        </div>
        <div className="info-item">
          <span className="label">Online Nodes</span>
          <span className="value">{onlineNodes.length} / {nodeData.length}</span>
        </div>
        <div className="info-item">
          <span className="label">Leader</span>
          <span className="value">{currentLeader || 'No Leader'}</span>
        </div>
        <div className="info-item">
          <span className="label">Term</span>
          <span className="value">{currentTerm}</span>
        </div>
      </div>
    </div>
  );
}
