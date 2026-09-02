import type { NodeInfo } from '../types/api';

interface RaftMetricsProps {
  nodeData: NodeInfo[];
}

export function RaftMetrics({ nodeData }: RaftMetricsProps) {
  const getElectionsTotal = () => nodeData.reduce((sum, n) => sum + (n.metrics?.electionsStarted ?? 0), 0);
  const getLeaderChangesTotal = () => nodeData.reduce((sum, n) => sum + (n.metrics?.leaderChanges ?? 0), 0);
  const getReplicationFailuresTotal = () => nodeData.reduce((sum, n) => sum + (n.metrics?.replicationFailures ?? 0), 0);
  const getEntriesCommittedTotal = () => nodeData.reduce((sum, n) => sum + (n.metrics?.entriesCommitted ?? 0), 0);

  const onlineNodes = nodeData.filter(n => n.health !== null);
  const leaders = onlineNodes.filter(n => n.health?.state === 'LEADER');
  const currentTerm = leaders.length > 0 ? leaders[0].health?.term : 0;
  const currentCommitIndex = leaders.length > 0 ? leaders[0].metrics?.commitIndex ?? 0 : 0;
  const currentLastApplied = leaders.length > 0 ? leaders[0].metrics?.lastApplied ?? 0 : 0;
  const currentLogLength = leaders.length > 0 ? leaders[0].metrics?.logLength ?? 0 : 0;

  return (
    <div className="card">
      <h2>RAFT METRICS</h2>

      <div className="metrics-summary" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        <div style={{
          padding: '1rem',
          background: 'var(--bg-tertiary)',
          borderRadius: '6px',
          border: '1px solid var(--border-subtle)'
        }}>
          <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
            ELECTIONS
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {getElectionsTotal()}
          </div>
        </div>
        <div style={{
          padding: '1rem',
          background: 'var(--bg-tertiary)',
          borderRadius: '6px',
          border: '1px solid var(--border-subtle)'
        }}>
          <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
            LEADER CHANGES
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {getLeaderChangesTotal()}
          </div>
        </div>
        <div style={{
          padding: '1rem',
          background: 'var(--bg-tertiary)',
          borderRadius: '6px',
          border: '1px solid var(--border-subtle)'
        }}>
          <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
            ENTRIES COMMITTED
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {getEntriesCommittedTotal()}
          </div>
        </div>
        <div style={{
          padding: '1rem',
          background: 'var(--bg-tertiary)',
          borderRadius: '6px',
          border: '1px solid var(--border-subtle)'
        }}>
          <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
            REPLICATION FAILURES
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: '700', color: getReplicationFailuresTotal() > 0 ? 'var(--accent-danger)' : 'var(--accent-success)', fontFamily: 'var(--font-mono)' }}>
            {getReplicationFailuresTotal()}
          </div>
        </div>
      </div>

      <div className="metrics-current" style={{
        padding: '1rem',
        background: 'var(--bg-tertiary)',
        borderRadius: '6px',
        border: '1px solid var(--border-subtle)'
      }}>
        <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
          CURRENT STATE
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '1rem'
        }}>
          <div>
            <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
              TERM
            </div>
            <div style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {currentTerm}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
              COMMIT INDEX
            </div>
            <div style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {currentCommitIndex}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
              LAST APPLIED
            </div>
            <div style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {currentLastApplied}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
              LOG LENGTH
            </div>
            <div style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {currentLogLength}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
