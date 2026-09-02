import type { NodeInfo } from '../types/api';

interface NodeCardProps {
  nodeInfo: NodeInfo;
}

function NodeCard({ nodeInfo }: NodeCardProps) {
  const { health, metrics } = nodeInfo;
  const isOnline = health !== null;

  const getStateBadgeClass = (state: string) => {
    switch (state) {
      case 'LEADER':
        return 'status-leader-badge';
      case 'FOLLOWER':
        return 'status-follower-badge';
      case 'CANDIDATE':
        return 'status-candidate-badge';
      default:
        return '';
    }
  };

  return (
    <div className="node-card" style={{
      background: 'var(--bg-tertiary)',
      border: `1px solid ${isOnline ? 'var(--border-subtle)' : 'var(--accent-danger)'}`,
      borderRadius: '8px',
      padding: '1.25rem',
      transition: 'border-color 0.2s ease'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem',
        paddingBottom: '0.75rem',
        borderBottom: '1px solid var(--border-subtle)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: isOnline ? 'var(--accent-success)' : 'var(--accent-danger)',
            animation: isOnline ? 'pulse 2s infinite' : 'none'
          }}></div>
          <span style={{
            fontWeight: '700',
            color: 'var(--text-primary)',
            fontSize: '1rem',
            fontFamily: 'var(--font-mono)'
          }}>
            {nodeInfo.id}
          </span>
        </div>
        <span className={`node-status-badge ${isOnline ? 'status-online' : 'status-offline'}`}>
          {isOnline ? '● ONLINE' : '○ OFFLINE'}
        </span>
      </div>

      {isOnline && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.5rem',
            background: 'var(--bg-secondary)',
            borderRadius: '4px',
            border: '1px solid var(--border-subtle)'
          }}>
            <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              STATE
            </span>
            <span className={`node-status-badge ${getStateBadgeClass(health.state)}`}>
              {health.state}
            </span>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '0.5rem'
          }}>
            <div style={{
              padding: '0.5rem',
              background: 'var(--bg-secondary)',
              borderRadius: '4px',
              border: '1px solid var(--border-subtle)'
            }}>
              <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
                TERM
              </div>
              <div style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                {health.term}
              </div>
            </div>
            <div style={{
              padding: '0.5rem',
              background: 'var(--bg-secondary)',
              borderRadius: '4px',
              border: '1px solid var(--border-subtle)'
            }}>
              <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
                LEADER
              </div>
              <div style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                {health.leaderId || '-'}
              </div>
            </div>
          </div>

          {metrics && (
            <div style={{
              padding: '0.75rem',
              background: 'var(--bg-secondary)',
              borderRadius: '4px',
              border: '1px solid var(--border-subtle)',
              marginTop: '0.25rem'
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '0.5rem',
                marginBottom: '0.5rem'
              }}>
                <div>
                  <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
                    COMMIT
                  </div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                    {metrics.commitIndex ?? 0}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
                    APPLIED
                  </div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                    {metrics.lastApplied ?? 0}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
                    LOG
                  </div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                    {metrics.logLength ?? 0}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div style={{
            fontSize: '0.6875rem',
            color: 'var(--text-muted)',
            paddingTop: '0.5rem',
            borderTop: '1px solid var(--border-subtle)',
            textAlign: 'center'
          }}>
            Cluster member
          </div>
        </div>
      )}

      {!isOnline && (
        <div style={{
          padding: '1rem',
          textAlign: 'center',
          color: 'var(--accent-danger)',
          fontSize: '0.8125rem'
        }}>
          Unable to reach node
        </div>
      )}
    </div>
  );
}

interface NodeStatusProps {
  nodeData: NodeInfo[];
}

export function NodeStatus({ nodeData }: NodeStatusProps) {
  if (nodeData.length === 0) {
    return (
      <div className="card">
        <h2>NODE STATUS</h2>
        <div className="loading">Loading node data...</div>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>NODE STATUS</h2>
      <div className="node-cards">
        {nodeData.map((node) => (
          <NodeCard key={node.id} nodeInfo={node} />
        ))}
      </div>
    </div>
  );
}
