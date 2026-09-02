import type { NodeInfo } from '../types/api';

interface RaftArchitectureProps {
  nodeData: NodeInfo[];
}

export function RaftArchitecture({ nodeData }: RaftArchitectureProps) {
  const onlineNodes = nodeData.filter(n => n.health !== null);
  const leaders = onlineNodes.filter(n => n.health?.state === 'LEADER');
  const currentLeader = leaders.length > 0 ? leaders[0] : null;
  const followers = onlineNodes.filter(n => n.health?.state === 'FOLLOWER');
  const candidates = onlineNodes.filter(n => n.health?.state === 'CANDIDATE');
  const offlineNodes = nodeData.filter(n => n.health === null);

  const getCommitIndex = () => {
    if (currentLeader) {
      return currentLeader.metrics?.commitIndex ?? 0;
    }
    if (followers.length > 0) {
      return followers[0].metrics?.commitIndex ?? 0;
    }
    if (candidates.length > 0) {
      return candidates[0].metrics?.commitIndex ?? 0;
    }
    return 0;
  };

  const commitIndex = getCommitIndex();
  const currentTerm = currentLeader?.health?.term ?? followers[0]?.health?.term ?? candidates[0]?.health?.term ?? 0;

  const renderNode = (node: NodeInfo) => {
    const isLeader = node.health?.state === 'LEADER';
    const isCandidate = node.health?.state === 'CANDIDATE';
    const isOffline = node.health === null;

    const borderColor = isLeader ? 'var(--accent-success)' :
      isCandidate ? 'var(--accent-warning)' :
        isOffline ? 'var(--accent-danger)' :
          'var(--accent-primary)';

    const bgColor = isLeader ? 'rgba(16, 185, 129, 0.1)' :
      isCandidate ? 'rgba(245, 158, 11, 0.1)' :
        isOffline ? 'rgba(239, 68, 68, 0.1)' :
          'rgba(59, 130, 246, 0.1)';

    const stateLabel = isLeader ? 'LEADER' :
      isCandidate ? 'CANDIDATE' :
        isOffline ? 'OFFLINE' :
          'FOLLOWER';

    const term = node.health?.term ?? 0;
    const nodeCommitIndex = node.metrics?.commitIndex ?? 0;
    const logLength = node.metrics?.logLength ?? 0;

    return (
      <div key={node.id} style={{
        background: bgColor,
        border: `2px solid ${borderColor}`,
        borderRadius: '8px',
        padding: '1rem',
        minWidth: '140px',
        textAlign: 'center',
        fontSize: '0.8125rem',
        transition: 'all 0.2s ease'
      }}>
        <div style={{
          fontWeight: '700',
          color: borderColor,
          marginBottom: '0.5rem',
          fontSize: '0.6875rem',
          letterSpacing: '0.05em',
          textTransform: 'uppercase'
        }}>
          {stateLabel}
        </div>
        <div style={{
          color: 'var(--text-primary)',
          fontWeight: '700',
          marginBottom: '0.5rem',
          fontSize: '1rem',
          fontFamily: 'var(--font-mono)'
        }}>
          {node.id}
        </div>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem',
          fontSize: '0.6875rem',
          color: 'var(--text-secondary)'
        }}>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>TERM</span>{' '}
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{term}</span>
          </div>
          {!isOffline && (
            <>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>COMMIT</span>{' '}
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{nodeCommitIndex}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>LOG</span>{' '}
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{logLength}</span>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="card">
      <h2>RAFT TOPOLOGY</h2>

      <div className="topology-layout" style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '2rem',
        padding: '2rem 0'
      }}>
        {/* Node Diagram */}
        <div className="topology-diagram" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
          {/* Client */}
          <div className="topology-client" style={{
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            padding: '0.5rem 1.25rem',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            fontWeight: '600',
            letterSpacing: '0.05em',
            textTransform: 'uppercase'
          }}>
            CLIENT
          </div>

          {/* Arrow down */}
          <div style={{ color: 'var(--border-color)', fontSize: '1.5rem' }}>│</div>

          {/* Leader */}
          {currentLeader ? (
            renderNode(currentLeader)
          ) : (
            <div style={{
              background: 'var(--bg-tertiary)',
              border: '1px dashed var(--border-color)',
              borderRadius: '8px',
              padding: '1rem',
              minWidth: '140px',
              textAlign: 'center',
              fontSize: '0.8125rem',
              color: 'var(--text-muted)'
            }}>
              <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                ELECTION
              </div>
              <div style={{ fontSize: '0.6875rem' }}>
                in progress...
              </div>
            </div>
          )}

          {/* Replication arrows */}
          {currentLeader && (
            <>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.6875rem', fontWeight: '600', letterSpacing: '0.05em' }}>
                APPENDENTRIES / REPLICATION
              </div>
              <div style={{ display: 'flex', gap: '3rem', alignItems: 'center' }}>
                <div style={{ color: 'var(--border-color)', fontSize: '1.5rem' }}>╱</div>
                <div style={{ color: 'var(--border-color)', fontSize: '1.5rem' }}>╲</div>
              </div>
            </>
          )}

          {/* Followers */}
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            {followers.map(renderNode)}
            {candidates.map(renderNode)}
            {offlineNodes.map(renderNode)}
          </div>
        </div>

        {/* Commit Flow */}
        <div className="topology-flow topology-sequence" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          flexWrap: 'wrap',
          justifyContent: 'center',
          fontSize: '0.6875rem',
          color: 'var(--text-muted)',
          padding: '1rem',
          background: 'var(--bg-tertiary)',
          borderRadius: '4px',
          border: '1px solid var(--border-subtle)',
          width: '100%'
        }}>
          <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>CLIENT WRITE</span>
          <span>→</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>LEADER LOG</span>
          <span>→</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>REPLICATED TO MAJORITY</span>
          <span>→</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>COMMIT INDEX</span>
          <span>→</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>STATE MACHINE</span>
        </div>

        {/* Current State */}
        <div className="topology-state" style={{
          display: 'flex',
          gap: '2rem',
          flexWrap: 'wrap',
          justifyContent: 'center',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          padding: '1rem',
          background: 'var(--bg-tertiary)',
          borderRadius: '4px',
          border: '1px solid var(--border-subtle)',
          width: '100%'
        }}>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>LEADER:</span>{' '}
            <span style={{ color: 'var(--text-primary)', fontWeight: '600', fontFamily: 'var(--font-mono)' }}>
              {currentLeader ? currentLeader.id : 'Election in progress...'}
            </span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>TERM:</span>{' '}
            <span style={{ color: 'var(--text-primary)', fontWeight: '600', fontFamily: 'var(--font-mono)' }}>
              {currentTerm}
            </span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>COMMIT INDEX:</span>{' '}
            <span style={{ color: 'var(--text-primary)', fontWeight: '600', fontFamily: 'var(--font-mono)' }}>
              {commitIndex}
            </span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>CLUSTER:</span>{' '}
            <span style={{ color: 'var(--accent-success)', fontWeight: '600' }}>
              {onlineNodes.length === 3 ? 'CONVERGED' : `${onlineNodes.length}/3 ONLINE`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
