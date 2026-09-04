import type { NodeInfo } from '../types/api';
import type { RecentWrite } from './KVStoreDemo';

interface RaftArchitectureProps {
  nodeData: NodeInfo[];
  recentWrite: RecentWrite | null;
  hasEverPolled: boolean;
}

type NodeRole = 'leader' | 'follower' | 'candidate' | 'offline';

function getNodeRole(node: NodeInfo): NodeRole {
  if (node.health === null) return 'offline';
  if (node.health.state === 'LEADER') return 'leader';
  if (node.health.state === 'CANDIDATE') return 'candidate';
  return 'follower';
}

function roleBadgeClass(role: NodeRole): string {
  switch (role) {
    case 'leader': return 'badge-leader';
    case 'follower': return 'badge-follower';
    case 'candidate': return 'badge-candidate';
    case 'offline': return 'badge-offline';
  }
}

export function RaftArchitecture({ nodeData, hasEverPolled }: RaftArchitectureProps) {
  const onlineNodes = nodeData.filter(n => n.health !== null);
  const leaderNodes = nodeData.filter(n => n.health?.state === 'LEADER');
  const nonLeaderNodes = nodeData.filter(n => n.health?.state !== 'LEADER');
  const isDisconnected = hasEverPolled && onlineNodes.length === 0;

  // Only show active replication arrows when there is a current leader AND followers.
  const hasActiveReplication = leaderNodes.length > 0 && onlineNodes.length > 1;

  // Determine replication arrow color/opacity based on actual cluster state.
  const replicationStroke = hasActiveReplication ? '#2ea043' : '#484f58';
  const replicationStrokeDash = hasActiveReplication ? '' : '6 4';
  const replicationOpacity = hasActiveReplication ? 1 : 0.35;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)', paddingBottom: 'var(--space-sm)', borderBottom: '1px solid var(--line)' }}>
        <h2 style={{ margin: 0, padding: 0, border: 'none' }}>CLUSTER TOPOLOGY — LIVE REPLICATION VIEW</h2>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)' }}>
          Per-node live state & AppendEntries RPC replication path
        </span>
      </div>

      {/* Disconnected cluster banner */}
      {isDisconnected && (
        <div
          style={{
            marginBottom: 'var(--space-md)',
            padding: '10px 16px',
            background: 'var(--red-dim)',
            border: '1px solid var(--red-border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--red)',
            fontFamily: 'var(--mono)',
            fontSize: '12px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>✕</span>
          <span>CLUSTER STATUS: DISCONNECTED — ALL NODES UNREACHABLE</span>
        </div>
      )}

      <div className="topology-centerpiece">
        {/* SVG Network Visualizer Canvas */}
        <div style={{ position: 'relative', width: '100%', minHeight: '380px', padding: '16px 0' }}>
          
          {/* Top Client Entry Badge */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '5px 14px',
                background: 'var(--surface-raised)',
                border: '1px solid var(--line-bright)',
                borderRadius: 'var(--radius-sm)',
                fontFamily: 'var(--mono)',
                fontSize: '10px',
                color: 'var(--muted)'
              }}
            >
              <span style={{ fontWeight: 'bold', color: 'var(--text)' }}>CLIENT CONSOLE</span>
              <span>- HTTP PUT / GET / DELETE</span>
            </div>
          </div>

          {/* Explicit In-Canvas Diagram Legend (Top-Right) */}
          <div
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              zIndex: 10,
              background: 'var(--surface-raised)',
              border: '1px solid var(--line-bright)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 12px',
              fontFamily: 'var(--mono)',
              fontSize: '10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}
          >
            <div style={{ fontWeight: 'bold', color: 'var(--text)', borderBottom: '1px solid var(--line)', paddingBottom: '4px' }}>
              DIAGRAM LEGEND
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ display: 'inline-block', width: '16px', height: '3px', background: 'var(--green)' }} />
              <span style={{ color: 'var(--green)' }}>AppendEntries RPC (Replication Path)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ display: 'inline-block', width: '16px', height: '0', borderTop: '1.5px dashed #484f58' }} />
              <span style={{ color: 'var(--muted)' }}>Client HTTP Request Path</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--cyan)' }} />
              <span style={{ color: 'var(--cyan)' }}>150ms Heartbeat Ping</span>
            </div>
          </div>

          {/* SVG Directed Edges & Replication Vectors */}
          <svg
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 1
            }}
            viewBox="0 0 900 380"
            preserveAspectRatio="none"
          >
            <defs>
              {/* Sleek Chevron Arrowhead for Leader -> Followers — green when active */}
              <marker
                id="chevron-green"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
              >
                <path d="M 0 0 L 8 4 L 0 8 L 2 4 Z" fill={replicationStroke} />
              </marker>

              {/* Subdued Chevron Arrowhead for Client -> Leader */}
              <marker
                id="chevron-gray"
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
              >
                <path d="M 0 0 L 6 3 L 0 6 L 1.5 3 Z" fill="#484f58" />
              </marker>
            </defs>

            {/* Path 1: Client -> Leader (Subdued thin dashed gray line) */}
            <line
              x1="450" y1="36"
              x2="450" y2="92"
              stroke="#484f58"
              strokeWidth="1.5"
              strokeDasharray="3 3"
              markerEnd="url(#chevron-gray)"
            />

            {/* Replication Vectors: Leader -> Follower 1 (Left) */}
            <path
              d="M 380 180 Q 250 205 210 236"
              fill="none"
              stroke={replicationStroke}
              strokeWidth={hasActiveReplication ? 3 : 1.5}
              strokeDasharray={replicationStrokeDash}
              opacity={replicationOpacity}
              className={hasActiveReplication ? 'topology-edge-flow' : undefined}
              markerEnd="url(#chevron-green)"
            />

            {/* Replication Vectors: Leader -> Follower 2 (Right) */}
            <path
              d="M 520 180 Q 650 205 690 236"
              fill="none"
              stroke={replicationStroke}
              strokeWidth={hasActiveReplication ? 3 : 1.5}
              strokeDasharray={replicationStrokeDash}
              opacity={replicationOpacity}
              className={hasActiveReplication ? 'topology-edge-flow' : undefined}
              markerEnd="url(#chevron-green)"
            />
          </svg>

          {/* Node Cards Layer positioned in Graph Hierarchy */}
          <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', gap: '32px' }}>
            
            {/* Top Level: Active Leader Node */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: '320px' }}>
                {leaderNodes.map(node => (
                  <RenderNodeCard key={node.id} node={node} />
                ))}
                {leaderNodes.length === 0 && (
                  <div
                    style={{
                      padding: '16px',
                      textAlign: 'center',
                      background: 'var(--surface-raised)',
                      border: isDisconnected ? '1px solid var(--red-border)' : '1px solid var(--amber-border)',
                      borderRadius: 'var(--radius-sm)',
                      color: isDisconnected ? 'var(--red)' : 'var(--amber)',
                      fontFamily: 'var(--mono)',
                      fontSize: '11px'
                    }}
                  >
                    {isDisconnected
                      ? 'NO ACTIVE LEADER (CLUSTER DISCONNECTED)'
                      : 'NO ACTIVE LEADER (ELECTION IN PROGRESS)'}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Level: Follower / Candidate / Offline Nodes */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px', maxWidth: '680px', margin: '0 auto', width: '100%' }}>
              {nonLeaderNodes.map(node => (
                <RenderNodeCard key={node.id} node={node} />
              ))}
            </div>

          </div>
        </div>

        {/* Dynamic Topology Status Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 16px',
            background: 'var(--surface-raised)',
            border: `1px solid ${isDisconnected ? 'var(--red-border)' : 'var(--line)'}`,
            borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--mono)',
            fontSize: '10px'
          }}
        >
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            {hasActiveReplication ? (
              <span style={{ color: 'var(--green)', fontWeight: 'bold' }}>AppendEntries RPC Active</span>
            ) : isDisconnected ? (
              <span style={{ color: 'var(--red)', fontWeight: 'bold' }}>✕ No Active Replication — Cluster Disconnected</span>
            ) : (
              <span style={{ color: 'var(--amber)', fontWeight: 'bold' }}>⚠ Replication Inactive — No Leader</span>
            )}
            {!isDisconnected && (
              <span style={{ color: 'var(--muted)' }}>| Heartbeat period: 150ms</span>
            )}
          </div>
          <div style={{ color: isDisconnected ? 'var(--red)' : 'var(--cyan)', fontWeight: isDisconnected ? 'bold' : undefined }}>
            Quorum: {hasEverPolled ? `${onlineNodes.length}/3` : '?/3'} Nodes Online
          </div>
        </div>
      </div>
    </div>
  );
}

function RenderNodeCard({ node }: { node: NodeInfo }) {
  const role = getNodeRole(node);
  const isOnline = node.health !== null;
  const term = node.health?.term ?? 0;
  const logLength = node.metrics?.logLength ?? 0;
  const commitIndex = node.metrics?.commitIndex ?? 0;
  const lastApplied = node.metrics?.lastApplied ?? 0;

  return (
    <div className={`node-card node-card--${role}`}>
      <div className="node-card-header">
        <div className="node-id-lockup">
          <span className="node-id">{node.id}</span>
          {role === 'leader' && (
            <span style={{ color: 'var(--green)', fontSize: '11px', fontWeight: 'bold' }}>[LEADER]</span>
          )}
        </div>
        <span className={`node-role-badge ${roleBadgeClass(role)}`}>
          {role.toUpperCase()}
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="metric-label">HEALTH</span>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: '11px',
            fontWeight: 'bold',
            color: isOnline ? 'var(--green)' : 'var(--red)'
          }}
        >
          {isOnline ? 'ONLINE' : 'OFFLINE'}
        </span>
      </div>

      {isOnline ? (
        <div className="node-metrics-table">
          <div className="node-metric-cell">
            <span className="metric-label">TERM</span>
            <span className="metric-value">{term}</span>
          </div>
          <div className="node-metric-cell">
            <span className="metric-label">LOG LEN</span>
            <span className="metric-value">{logLength}</span>
          </div>
          <div className="node-metric-cell">
            <span className="metric-label">COMMIT</span>
            <span className="metric-value">{commitIndex}</span>
          </div>
          <div className="node-metric-cell">
            <span className="metric-label">APPLIED</span>
            <span className="metric-value">{lastApplied}</span>
          </div>
        </div>
      ) : (
        <div
          style={{
            padding: '8px 12px',
            textAlign: 'center',
            background: 'var(--red-dim)',
            color: 'var(--red)',
            fontFamily: 'var(--mono)',
            fontSize: '11px',
            fontWeight: 'bold'
          }}
        >
          UNREACHABLE
        </div>
      )}

      <div style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', marginTop: '4px' }}>
        endpoint: {node.url.replace(/^https?:\/\//, '')}
      </div>
    </div>
  );
}
