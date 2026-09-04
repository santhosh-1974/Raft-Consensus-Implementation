import type { NodeInfo } from '../types/api';

interface TopologyProps {
  nodeData: NodeInfo[];
}

function shortEndpoint(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

function badgeClassFor(health: NodeInfo['health']): string {
  if (health === null) return 'badge-offline';
  if (health.state === 'LEADER') return 'badge-leader';
  if (health.state === 'CANDIDATE') return 'badge-candidate';
  return 'badge-follower';
}

function roleLabelFor(health: NodeInfo['health']): string {
  if (health === null) return 'OFFLINE';
  if (health.state === 'LEADER') return 'LEADER';
  if (health.state === 'CANDIDATE') return 'CANDIDATE';
  return 'FOLLOWER';
}

function NodeCard({ node }: { node: NodeInfo }) {
  const health = node.health;
  const metrics = node.metrics;
  const isOnline = health !== null;
  const isLeader = health?.state === 'LEADER';

  const classes = ['node'];
  if (isLeader) classes.push('node-leader');
  if (!isOnline) classes.push('node-offline');

  return (
    <article className={classes.join(' ')}>
      <header className="node-head">
        <span className={`node-dot ${isOnline ? '' : 'node-dot-dead'}`} />
        <span className="node-id">{node.id}</span>
        <span className={`badge ${badgeClassFor(health)}`}>{roleLabelFor(health)}</span>
      </header>

      {isOnline && health ? (
        <>
          <div className="node-stats">
            <div><span className="stat-label">TERM</span><span className="stat-value">{health.term}</span></div>
            <div><span className="stat-label">LOG</span><span className="stat-value">{metrics?.logLength ?? 0}</span></div>
            <div><span className="stat-label">COMMIT</span><span className="stat-value">{metrics?.commitIndex ?? 0}</span></div>
            <div><span className="stat-label">APPLIED</span><span className="stat-value">{metrics?.lastApplied ?? 0}</span></div>
          </div>
          <footer className="node-foot">
            <span>{shortEndpoint(node.url)}</span>
            <span className="node-foot-dim">leader view: {health.leaderId ?? '—'}</span>
          </footer>
        </>
      ) : (
        <div className="node-dead">
          <span>unreachable</span>
          <span className="node-foot-dim">no response from /health</span>
        </div>
      )}
    </article>
  );
}

export function Topology({ nodeData }: TopologyProps) {
  const onlineNodes = nodeData.filter(n => n.health !== null);
  const leader = onlineNodes.find(n => n.health?.state === 'LEADER') ?? null;
  const peers = leader ? nodeData.filter(n => n.id !== leader.id) : nodeData;
  const columnCount = leader ? 2 : 3;

  const highestTerm = Math.max(0, ...nodeData.map(n => n.health?.term ?? 0));

  return (
    <div className="panel">
      <div className="panel-head">
        <h2 className="panel-title"><span className="panel-index">01</span>CLUSTER TOPOLOGY</h2>
        <div className="panel-meta">
          <span>NODES <strong>{onlineNodes.length}/{nodeData.length}</strong></span>
          <span>TERM <strong>{highestTerm}</strong></span>
          <span>LEADER <strong>{leader ? leader.id : 'none'}</strong></span>
        </div>
      </div>

      <div className="panel-body topo">
        <div className="client-entry" aria-hidden="true">
          <span className="client-chip">CLIENT</span>
          <span className="client-sub">{leader ? 'write → leader' : 'writes unavailable'}</span>
          <span className="client-line" />
        </div>

        {leader ? (
          <NodeCard node={leader} />
        ) : (
          <div className="election-slot">ELECTION IN PROGRESS</div>
        )}

        <div className={`fan fan-${columnCount}`} aria-hidden="true">
          <span className="fan-stem" />
          <span className="fan-bar" />
          {peers.map((n, i) => (
            <span
              key={n.id}
              className={`fan-drop${n.health === null ? ' fan-drop-broken' : ''}`}
              style={{ left: `${((i + 0.5) / columnCount) * 100}%` }}
            />
          ))}
        </div>

        <div className="fan-caption">
          {leader ? 'APPEND ENTRIES · HEARTBEATS · REPLICATION →' : 'NO ACTIVE LEADER — REPLICATION HALTED'}
        </div>

        <div className={`fan-row fan-row-${columnCount}`}>
          {peers.map(n => (
            <NodeCard key={n.id} node={n} />
          ))}
        </div>
      </div>
    </div>
  );
}