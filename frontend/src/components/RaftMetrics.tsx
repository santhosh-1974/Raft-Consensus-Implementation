import type { NodeInfo } from '../types/api';

interface RaftMetricsProps {
  nodeData: NodeInfo[];
  hasEverPolled: boolean;
}

export function RaftMetrics({ nodeData, hasEverPolled }: RaftMetricsProps) {
  const onlineNodes = nodeData.filter(n => n.health !== null);
  const leaders = onlineNodes.filter(n => n.health?.state === 'LEADER');
  const isDisconnected = hasEverPolled && onlineNodes.length === 0;

  // Cumulative counters: use highest observed value across currently reachable nodes only.
  // When no nodes respond, show '—' to avoid presenting stale values as current.
  const getElectionsTotal = () => {
    if (isDisconnected) return null;
    return onlineNodes.reduce((max, n) => Math.max(max, n.metrics?.electionsStarted ?? 0), 0);
  };

  const getLeaderChangesTotal = () => {
    if (isDisconnected) return null;
    return onlineNodes.reduce((max, n) => Math.max(max, n.metrics?.leaderChanges ?? 0), 0);
  };

  const getReplicationFailuresTotal = () => {
    if (isDisconnected) return null;
    return onlineNodes.reduce((sum, n) => sum + (n.metrics?.replicationFailures ?? 0), 0);
  };

  const getEntriesCommittedTotal = () => {
    if (isDisconnected) return null;
    return onlineNodes.reduce((max, n) => Math.max(max, n.metrics?.entriesCommitted ?? 0), 0);
  };

  // Term, commit index, last applied and log length come from the current leader.
  // If no leader is reachable, they are UNKNOWN — show '—', NOT stale cached values.
  const currentTerm = (() => {
    if (isDisconnected) return null;
    if (leaders.length > 0) return leaders[0].health?.term ?? null;
    // No leader but some nodes online: show highest observed term
    const terms = onlineNodes.map(n => n.health?.term ?? 0);
    return terms.length > 0 ? Math.max(...terms) : null;
  })();

  const currentCommitIndex = isDisconnected ? null
    : leaders.length > 0 ? (leaders[0].metrics?.commitIndex ?? null) : null;

  const currentLastApplied = isDisconnected ? null
    : leaders.length > 0 ? (leaders[0].metrics?.lastApplied ?? null) : null;

  const currentLogLength = isDisconnected ? null
    : leaders.length > 0 ? (leaders[0].metrics?.logLength ?? null) : null;

  const replicationFailures = getReplicationFailuresTotal();

  // Format value: null means unknown/disconnected → show '—'
  const fmt = (v: number | null) => v === null ? '—' : v.toString();

  return (
    <div className="card">
      <h2>RAFT PERFORMANCE METRICS</h2>

      {isDisconnected && (
        <div
          style={{
            marginBottom: 'var(--space-md)',
            padding: '8px 12px',
            background: 'var(--red-dim)',
            border: '1px solid var(--red-border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--red)',
            fontFamily: 'var(--mono)',
            fontSize: '11px',
            fontWeight: 'bold',
          }}
        >
          ✕ CLUSTER DISCONNECTED — 0/3 NODES REACHABLE
        </div>
      )}

      <div className="metrics-dense-grid">
        <div className="metric-dense-card">
          <span className="metric-label">ELECTIONS STARTED</span>
          <span className="metric-hero-sm">{fmt(getElectionsTotal())}</span>
          <span style={{ fontSize: '10px', color: 'var(--dim)', fontFamily: 'var(--mono)' }}>
            {isDisconnected ? 'No nodes reachable' : 'Cumulative elections'}
          </span>
        </div>

        <div className="metric-dense-card">
          <span className="metric-label">LEADER CHANGES</span>
          <span className="metric-hero-sm">{fmt(getLeaderChangesTotal())}</span>
          <span style={{ fontSize: '10px', color: 'var(--dim)', fontFamily: 'var(--mono)' }}>
            {isDisconnected ? 'No nodes reachable' : 'Successful transitions'}
          </span>
        </div>

        <div className="metric-dense-card">
          <span className="metric-label">TOTAL ENTRIES COMMITTED</span>
          <span className="metric-hero-sm">{fmt(getEntriesCommittedTotal())}</span>
          <span style={{ fontSize: '10px', color: 'var(--dim)', fontFamily: 'var(--mono)' }}>
            {isDisconnected ? 'No nodes reachable' : 'Cumulative operational writes'}
          </span>
        </div>

        <div className="metric-dense-card">
          <span className="metric-label">REPLICATION FAILURES</span>
          <span
            className="metric-hero-sm"
            style={{ color: replicationFailures === null ? 'var(--muted)' : replicationFailures > 0 ? 'var(--red)' : 'var(--green)' }}
          >
            {fmt(replicationFailures)}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--dim)', fontFamily: 'var(--mono)' }}>
            {isDisconnected ? 'No nodes reachable' : 'RPC timeout count'}
          </span>
        </div>

        <div className="metric-dense-card">
          <span className="metric-label">CURRENT TERM</span>
          <span
            className="metric-hero-sm metric-hero-accent"
            style={{ color: currentTerm === null ? 'var(--muted)' : undefined }}
          >
            {fmt(currentTerm)}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--dim)', fontFamily: 'var(--mono)' }}>
            {isDisconnected ? 'Unavailable' : 'Monotonic term counter'}
          </span>
        </div>

        <div className="metric-dense-card">
          <span className="metric-label">CURRENT COMMIT INDEX</span>
          <span
            className="metric-hero-sm"
            style={{ color: currentCommitIndex === null ? 'var(--muted)' : undefined }}
          >
            {fmt(currentCommitIndex)}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--dim)', fontFamily: 'var(--mono)' }}>
            {isDisconnected ? 'Unavailable' : leaders.length === 0 ? 'No active leader' : 'Active leader log position'}
          </span>
        </div>

        <div className="metric-dense-card">
          <span className="metric-label">LAST APPLIED</span>
          <span
            className="metric-hero-sm"
            style={{ color: currentLastApplied === null ? 'var(--muted)' : undefined }}
          >
            {fmt(currentLastApplied)}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--dim)', fontFamily: 'var(--mono)' }}>
            {isDisconnected ? 'Unavailable' : leaders.length === 0 ? 'No active leader' : 'State machine index'}
          </span>
        </div>

        <div className="metric-dense-card">
          <span className="metric-label">LOG LENGTH</span>
          <span
            className="metric-hero-sm"
            style={{ color: currentLogLength === null ? 'var(--muted)' : undefined }}
          >
            {fmt(currentLogLength)}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--dim)', fontFamily: 'var(--mono)' }}>
            {isDisconnected ? 'Unavailable' : leaders.length === 0 ? 'No active leader' : 'Total log entries'}
          </span>
        </div>
      </div>
    </div>
  );
}
