import type { NodeInfo } from '../types/api';

interface ClusterOverviewProps {
  nodeData: NodeInfo[];
  hasEverPolled: boolean;
}

export function ClusterOverview({ nodeData, hasEverPolled }: ClusterOverviewProps) {
  const onlineNodes = nodeData.filter(n => n.health !== null);
  const leaders = onlineNodes.filter(n => n.health?.state === 'LEADER');
  const currentLeader = leaders.length > 0 ? leaders[0].health?.nodeId ?? null : null;
  const onlineCount = onlineNodes.length;
  const isHealthy = onlineCount === 3 && currentLeader !== null;
  const isDisconnected = hasEverPolled && onlineCount === 0;

  // Only compute log delta from currently online nodes.
  const logLengths = onlineNodes.map(n => n.metrics?.logLength ?? 0);
  const maxLog = logLengths.length > 0 ? Math.max(...logLengths) : 0;
  const minLog = logLengths.length > 0 ? Math.min(...logLengths) : 0;
  const logDelta = onlineNodes.length > 0 ? maxLog - minLog : 0;

  // Determine active leader label based on current poll state only.
  const leaderLabel = () => {
    if (!hasEverPolled) return 'CONNECTING…';
    if (isDisconnected) return 'NONE';
    if (currentLeader) return currentLeader;
    return 'ELECTION IN PROGRESS…';
  };

  const leaderColor = () => {
    if (!hasEverPolled) return 'var(--muted)';
    if (isDisconnected || !currentLeader) return 'var(--red)';
    return 'var(--green)';
  };

  const quorumLabel = () => {
    if (!hasEverPolled) return 'Waiting for first poll…';
    if (isDisconnected) return 'CLUSTER DISCONNECTED — 0/3 ONLINE';
    if (isHealthy) return `Quorum Healthy (${onlineCount}/3 Nodes)`;
    return `Quorum Attention Required (${onlineCount}/3 Online)`;
  };

  return (
    <div className="overview-summary-grid">
      {/* Top border color dynamically maps to actual leader health */}
      <div className={`overview-summary-tile ${currentLeader && !isDisconnected ? 'overview-summary-tile--leader-active' : 'overview-summary-tile--leader-degraded'}`}>
        <span className="metric-label">ACTIVE LEADER</span>
        <span
          className="metric-hero-sm"
          style={{ color: leaderColor() }}
        >
          {leaderLabel()}
        </span>
        <span className="brand-subtitle" style={{ fontSize: '10px' }}>
          {quorumLabel()}
        </span>
      </div>

      <div className="overview-summary-tile overview-summary-tile--term">
        <span className="metric-label">REPLICATION LAG</span>
        <span className="metric-hero metric-hero-accent">
          {isDisconnected || onlineNodes.length === 0
            ? '—'
            : logDelta === 0 ? '0 ms' : `${logDelta * 5} ms`}
        </span>
        <span className="brand-subtitle" style={{ fontSize: '10px' }}>
          {isDisconnected || onlineNodes.length === 0
            ? 'No nodes online'
            : `Max Log Delta: ${logDelta} entries`}
        </span>
      </div>

      <div className="overview-summary-tile overview-summary-tile--commit">
        <span className="metric-label">HEARTBEAT INTERVAL</span>
        <span className="metric-hero">150 ms</span>
        <span className="brand-subtitle" style={{ fontSize: '10px' }}>
          Leader Ping Period (AppendEntries)
        </span>
      </div>

      <div className="overview-summary-tile overview-summary-tile--nodes">
        <span className="metric-label">ELECTION TIMEOUT</span>
        <span className="metric-hero-sm">
          150 – 300 <span style={{ color: 'var(--muted)', fontSize: '0.75em' }}>ms</span>
        </span>
        <span className="brand-subtitle" style={{ fontSize: '10px' }}>
          Randomized Candidate Timer
        </span>
      </div>
    </div>
  );
}
