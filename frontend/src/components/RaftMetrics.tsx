import type { NodeInfo } from '../types/api';

interface RaftMetricsProps {
  nodeData: NodeInfo[];
}

export function RaftMetrics({ nodeData }: RaftMetricsProps) {
  const checkConvergence = (metricName: keyof NonNullable<NodeInfo['metrics']>) => {
    const values = nodeData
      .map(n => n.metrics?.[metricName])
      .filter((v): v is number => v !== undefined && v !== null);
    
    if (values.length === 0) return null;
    const first = values[0];
    const allEqual = values.every(v => v === first);
    return allEqual;
  };

  const commitIndexConverged = checkConvergence('commitIndex');
  const lastAppliedConverged = checkConvergence('lastApplied');
  const logLengthConverged = checkConvergence('logLength');

  return (
    <div className="card full-width">
      <h2>Raft Replication Metrics</h2>
      <table className="metrics-table">
        <thead>
          <tr>
            <th>Metric</th>
            {nodeData.map(node => (
              <th key={node.id}>{node.id}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="metric-highlight">Commit Index</td>
            {nodeData.map(node => (
              <td key={node.id} className={commitIndexConverged ? 'metric-converged' : 'metric-diverged'}>
                {node.metrics?.commitIndex ?? '-'}
              </td>
            ))}
          </tr>
          <tr>
            <td className="metric-highlight">Last Applied</td>
            {nodeData.map(node => (
              <td key={node.id} className={lastAppliedConverged ? 'metric-converged' : 'metric-diverged'}>
                {node.metrics?.lastApplied ?? '-'}
              </td>
            ))}
          </tr>
          <tr>
            <td className="metric-highlight">Log Length</td>
            {nodeData.map(node => (
              <td key={node.id} className={logLengthConverged ? 'metric-converged' : 'metric-diverged'}>
                {node.metrics?.logLength ?? '-'}
              </td>
            ))}
          </tr>
          <tr>
            <td>Elections Started</td>
            {nodeData.map(node => (
              <td key={node.id}>{node.metrics?.electionsStarted ?? '-'}</td>
            ))}
          </tr>
          <tr>
            <td>Leader Changes</td>
            {nodeData.map(node => (
              <td key={node.id}>{node.metrics?.leaderChanges ?? '-'}</td>
            ))}
          </tr>
          <tr>
            <td>Replication Failures</td>
            {nodeData.map(node => (
              <td key={node.id}>{node.metrics?.replicationFailures ?? '-'}</td>
            ))}
          </tr>
          <tr>
            <td>Entries Committed</td>
            {nodeData.map(node => (
              <td key={node.id}>{node.metrics?.entriesCommitted ?? '-'}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
