import type { NodeInfo } from '../types/api';

interface ClusterConvergenceProps {
  nodeData: NodeInfo[];
}

export function ClusterConvergence({ nodeData }: ClusterConvergenceProps) {
  const onlineNodes = nodeData.filter(n => n.health !== null);

  const getConvergenceState = () => {
    if (onlineNodes.length === 0) {
      return 'UNAVAILABLE';
    }
    if (onlineNodes.length < 2) {
      return 'NO_MAJORITY';
    }

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
  const maxLogLength = Math.max(
    ...onlineNodes.map(n => n.metrics?.logLength ?? 0),
    1
  );

  return (
    <div className="card">
      <h2>REPLICATION</h2>

      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{
          padding: '1rem',
          background: 'var(--bg-tertiary)',
          borderRadius: '6px',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
              ONLINE NODES
            </div>
            <div style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {onlineNodes.length} / {nodeData.length}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
              CONVERGENCE
            </div>
            <div style={{
              fontSize: '0.875rem',
              fontWeight: '700',
              color: convergenceState === 'CONVERGED' ? 'var(--accent-success)' :
                convergenceState === 'CATCH_UP' ? 'var(--accent-warning)' :
                  'var(--accent-danger)',
              fontFamily: 'var(--font-mono)'
            }}>
              {convergenceState === 'CONVERGED' && '✓ CONVERGED'}
              {convergenceState === 'CATCH_UP' && '⚠ CATCH-UP'}
              {convergenceState === 'NO_MAJORITY' && '⚠ NO MAJORITY'}
              {convergenceState === 'UNAVAILABLE' && 'UNAVAILABLE'}
            </div>
          </div>
        </div>
      </div>

      <div className="replication-table-wrap">
        <div className="replication-row replication-heading">
          <span>NODE</span>
          <span>LOG</span>
          <span>COMMIT</span>
          <span>APPLIED</span>
          <span>STATUS</span>
        </div>
        {nodeData.map((node) => {
          const isOnline = node.health !== null;
          const metrics = node.metrics;

          if (!isOnline) {
            return (
              <div key={node.id} className="replication-row replication-row-offline">
                <span>{node.id}</span>
                <span>--</span>
                <span>--</span>
                <span>--</span>
                <span>○ OFFLINE</span>
              </div>
            );
          }

          const logLength = metrics?.logLength ?? 0;
          const commitIndex = metrics?.commitIndex ?? 0;
          const lastApplied = metrics?.lastApplied ?? 0;
          const isBehind = logLength < maxLogLength ||
            commitIndex !== Math.max(...onlineNodes.map(n => n.metrics?.commitIndex ?? 0)) ||
            lastApplied !== Math.max(...onlineNodes.map(n => n.metrics?.lastApplied ?? 0));
          const difference = maxLogLength - logLength;

          return (
            <div key={node.id} className="replication-row">
              <span>{node.id}</span>
              <span>{logLength}</span>
              <span>{commitIndex}</span>
              <span>{lastApplied}</span>
              <span className={isBehind ? 'replication-status-behind' : 'replication-status-synced'}>
                {isBehind ? `CATCH-UP -${difference}` : '✓ SYNCED'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
