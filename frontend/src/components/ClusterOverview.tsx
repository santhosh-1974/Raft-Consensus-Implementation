import type { NodeInfo } from '../types/api';

interface ClusterOverviewProps {
  nodeData: NodeInfo[];
}

export function ClusterOverview({ nodeData }: ClusterOverviewProps) {
  const onlineNodes = nodeData.filter(n => n.health !== null);
  
  const leaders = onlineNodes.filter(n => n.health?.state === 'LEADER');
  const currentLeader = leaders.length > 0 ? leaders[0].health?.nodeId : null;
  const currentTerm = leaders.length > 0 ? leaders[0].health?.term : 0;
  const commitIndex = leaders.length > 0 ? leaders[0].metrics?.commitIndex ?? 0 : 0;
  const isHealthy = onlineNodes.length === 3 && currentLeader !== null;

  return (
    <div className="card">
      <h2>CLUSTER STATUS</h2>
      <div style={{ 
        padding: '1.5rem',
        background: 'var(--bg-tertiary)',
        borderRadius: '6px',
        border: '1px solid var(--border-subtle)'
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '1rem',
          marginBottom: '1.5rem'
        }}>
          <div style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: isHealthy ? 'var(--accent-success)' : 'var(--accent-danger)',
            animation: 'pulse 2s infinite'
          }}></div>
          <div>
            <div style={{ 
              fontSize: '1rem', 
              fontWeight: '700', 
              color: isHealthy ? 'var(--accent-success)' : 'var(--accent-danger)',
              letterSpacing: '0.05em'
            }}>
              {isHealthy ? '● OPERATIONAL' : '● DEGRADED'}
            </div>
            <div style={{ 
              fontSize: '0.75rem', 
              color: 'var(--text-muted)',
              marginTop: '0.25rem'
            }}>
              {isHealthy ? 'Consensus cluster healthy' : 'Cluster requires attention'}
            </div>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '1rem',
          padding: '1rem',
          background: 'var(--bg-secondary)',
          borderRadius: '4px',
          border: '1px solid var(--border-subtle)'
        }}>
          <div>
            <div style={{ 
              fontSize: '0.625rem', 
              color: 'var(--text-muted)', 
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '0.25rem'
            }}>
              LEADER
            </div>
            <div style={{ 
              fontSize: '0.875rem', 
              fontWeight: '600', 
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)'
            }}>
              {currentLeader || 'None'}
            </div>
          </div>
          <div>
            <div style={{ 
              fontSize: '0.625rem', 
              color: 'var(--text-muted)', 
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '0.25rem'
            }}>
              TERM
            </div>
            <div style={{ 
              fontSize: '0.875rem', 
              fontWeight: '600', 
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)'
            }}>
              {currentTerm}
            </div>
          </div>
          <div>
            <div style={{ 
              fontSize: '0.625rem', 
              color: 'var(--text-muted)', 
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '0.25rem'
            }}>
              COMMIT INDEX
            </div>
            <div style={{ 
              fontSize: '0.875rem', 
              fontWeight: '600', 
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)'
            }}>
              {commitIndex}
            </div>
          </div>
          <div>
            <div style={{ 
              fontSize: '0.625rem', 
              color: 'var(--text-muted)', 
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '0.25rem'
            }}>
              NODES
            </div>
            <div style={{ 
              fontSize: '0.875rem', 
              fontWeight: '600', 
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)'
            }}>
              {onlineNodes.length} / {nodeData.length}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
