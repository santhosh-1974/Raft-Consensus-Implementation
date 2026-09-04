import type { NodeInfo } from '../types/api';

interface ClusterConvergenceProps {
  nodeData: NodeInfo[];
}

export function ClusterConvergence({ nodeData }: ClusterConvergenceProps) {
  const onlineNodes = nodeData.filter(n => n.health !== null);

  const getConvergenceState = () => {
    if (onlineNodes.length === 0) return 'UNAVAILABLE';
    if (onlineNodes.length < 2) return 'NO_MAJORITY';

    const metrics = onlineNodes.map(n => ({
      id: n.id,
      logLength: n.metrics?.logLength ?? 0,
      commitIndex: n.metrics?.commitIndex ?? 0,
      lastApplied: n.metrics?.lastApplied ?? 0
    }));

    const first = metrics[0];
    const allMatch = metrics.every(m =>
      m.logLength === first.logLength &&
      m.commitIndex === first.commitIndex &&
      m.lastApplied === first.lastApplied
    );

    return allMatch ? 'CONVERGED' : 'CATCH_UP';
  };

  const convergenceState = getConvergenceState();
  const maxLogLength = Math.max(...onlineNodes.map(n => n.metrics?.logLength ?? 0), 0);
  const maxCommitIndex = Math.max(...onlineNodes.map(n => n.metrics?.commitIndex ?? 0), 0);
  const maxLastApplied = Math.max(...onlineNodes.map(n => n.metrics?.lastApplied ?? 0), 0);

  const renderStatusBadge = () => {
    switch (convergenceState) {
      case 'CONVERGED':
        return <span className="convergence-status-banner status-converged">✓ CLUSTER CONVERGED</span>;
      case 'CATCH_UP':
        return <span className="convergence-status-banner status-catchup">⚠ REPLICATION CATCH-UP</span>;
      case 'NO_MAJORITY':
        return <span className="convergence-status-banner status-nomajority">⚠ NO MAJORITY (QUORUM LOST)</span>;
      default:
        return <span className="convergence-status-banner status-nomajority">UNAVAILABLE</span>;
    }
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
        <h2 style={{ margin: 0, border: 'none', padding: 0 }}>CLUSTER CONVERGENCE MATRIX</h2>
        {renderStatusBadge()}
      </div>

      <table className="convergence-table">
        <thead>
          <tr>
            <th>NODE ID</th>
            <th>ROLE</th>
            <th>LOG LENGTH</th>
            <th>COMMIT INDEX</th>
            <th>LAST APPLIED</th>
            <th>CONVERGENCE STATUS</th>
          </tr>
        </thead>
        <tbody>
          {nodeData.map((node) => {
            const isOnline = node.health !== null;
            const role = isOnline ? (node.health?.state || 'FOLLOWER') : 'OFFLINE';
            const logLength = node.metrics?.logLength ?? 0;
            const commitIndex = node.metrics?.commitIndex ?? 0;
            const lastApplied = node.metrics?.lastApplied ?? 0;

            const isSynced = isOnline && logLength === maxLogLength && commitIndex === maxCommitIndex && lastApplied === maxLastApplied;

            return (
              <tr key={node.id}>
                <td>
                  <strong>{node.id}</strong>
                </td>
                <td>
                  <span className={`node-role-badge badge-${role.toLowerCase()}`}>
                    {role}
                  </span>
                </td>
                <td>{isOnline ? logLength : '—'}</td>
                <td>{isOnline ? commitIndex : '—'}</td>
                <td>{isOnline ? lastApplied : '—'}</td>
                <td>
                  {!isOnline ? (
                    <span style={{ color: 'var(--red)', fontWeight: 'bold' }}>UNREACHABLE</span>
                  ) : isSynced ? (
                    <span style={{ color: 'var(--green)', fontWeight: 'bold' }}>✓ SYNCED</span>
                  ) : (
                    <span style={{ color: 'var(--amber)', fontWeight: 'bold' }}>CATCH-UP (LAGGING)</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
