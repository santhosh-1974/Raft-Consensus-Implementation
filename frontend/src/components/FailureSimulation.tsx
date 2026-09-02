import { useState, useEffect } from 'react';
import type { NodeInfo } from '../types/api';
import { FailureRecoveryFlow } from './FailureRecoveryFlow';

interface FailureSimulationProps {
  nodeData: NodeInfo[];
}

type ClusterPhase = 'STABLE' | 'FAILURE' | 'ELECTION' | 'NEW_LEADER' | 'RECOVERY' | 'CONVERGED';

export function FailureSimulation({ nodeData }: FailureSimulationProps) {
  const onlineNodes = nodeData.filter(n => n.health !== null);
  const leaders = onlineNodes.filter(n => n.health?.state === 'LEADER');
  const currentLeader = leaders.length > 0 ? leaders[0].health?.nodeId : null;
  const candidates = onlineNodes.filter(n => n.health?.state === 'CANDIDATE');
  const offlineNodes = nodeData.filter(n => n.health === null);

  const [previousLeader, setPreviousLeader] = useState<string | null>(null);
  const [phase, setPhase] = useState<ClusterPhase>('STABLE');

  const getContainerName = (nodeId: string) => {
    const map: Record<string, string> = {
      'node1': 'raft-node-1',
      'node2': 'raft-node-2',
      'node3': 'raft-node-3'
    };
    return map[nodeId] || nodeId;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const checkConvergence = () => {
    const metrics = nodeData
      .filter(n => n.health !== null)
      .map(n => ({
        id: n.id,
        commitIndex: n.metrics?.commitIndex ?? 0,
        lastApplied: n.metrics?.lastApplied ?? 0,
        logLength: n.metrics?.logLength ?? 0
      }));

    if (metrics.length < 2) return false;

    const first = metrics[0];
    const allMatch = metrics.every(m => 
      m.commitIndex === first.commitIndex &&
      m.lastApplied === first.lastApplied &&
      m.logLength === first.logLength
    );

    return allMatch;
  };

  const isConverged = checkConvergence();

  useEffect(() => {
    // Track leader changes for phase detection
    if (currentLeader !== previousLeader) {
      setPreviousLeader(currentLeader || null);
    }

    // Determine phase
    if (offlineNodes.length === 0 && currentLeader && isConverged) {
      setPhase('CONVERGED');
    } else if (offlineNodes.length === 0 && currentLeader) {
      setPhase('STABLE');
    } else if (!currentLeader && offlineNodes.length > 0) {
      setPhase('FAILURE');
    } else if (candidates.length > 0) {
      setPhase('ELECTION');
    } else if (currentLeader && previousLeader && currentLeader !== previousLeader) {
      setPhase('NEW_LEADER');
    } else if (offlineNodes.length > 0 && currentLeader) {
      setPhase('RECOVERY');
    }
  }, [nodeData, currentLeader, previousLeader, candidates, offlineNodes, isConverged]);

  const getPhaseColor = (p: ClusterPhase) => {
    switch (p) {
      case 'STABLE': return 'var(--accent-success)';
      case 'FAILURE': return 'var(--accent-danger)';
      case 'ELECTION': return 'var(--accent-warning)';
      case 'NEW_LEADER': return 'var(--accent-primary)';
      case 'RECOVERY': return 'var(--accent-primary)';
      case 'CONVERGED': return 'var(--accent-success)';
      default: return 'var(--text-secondary)';
    }
  };

  return (
    <div className="card">
      <h2>FAILURE & RECOVERY</h2>
      
      <div className="failure-controls">
        <FailureRecoveryFlow nodeData={nodeData} />

        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ 
            fontSize: '0.6875rem', 
            color: 'var(--text-muted)', 
            textTransform: 'uppercase', 
            letterSpacing: '0.05em',
            marginBottom: '0.5rem'
          }}>
            CLUSTER PHASE
          </div>
          <div style={{
            padding: '0.75rem',
            background: 'var(--bg-tertiary)',
            borderRadius: '4px',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: getPhaseColor(phase),
              animation: 'pulse 2s infinite'
            }}></div>
            <span style={{ 
              fontSize: '0.8125rem', 
              fontWeight: '700', 
              color: getPhaseColor(phase),
              letterSpacing: '0.05em'
            }}>
              {phase.replace('_', ' ')}
            </span>
          </div>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{
            padding: '1rem',
            background: 'var(--bg-tertiary)',
            borderRadius: '6px',
            border: '1px solid var(--border-subtle)'
          }}>
            <div style={{ 
              fontSize: '0.625rem', 
              color: 'var(--text-muted)', 
              textTransform: 'uppercase', 
              letterSpacing: '0.05em',
              marginBottom: '0.5rem'
            }}>
              CURRENT LEADER
            </div>
            <div style={{ 
              fontSize: '1.25rem', 
              fontWeight: '700', 
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)'
            }}>
              {currentLeader || 'Election in progress...'}
            </div>
          </div>
        </div>

        {currentLeader && (
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ 
              fontSize: '0.6875rem', 
              color: 'var(--text-muted)', 
              textTransform: 'uppercase', 
              letterSpacing: '0.05em',
              marginBottom: '0.5rem'
            }}>
              SIMULATE LEADER FAILURE
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
              Stop the current leader container to trigger a Raft election:
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div className="docker-command docker-command-stop" style={{ flex: 1 }}>
                docker stop {getContainerName(currentLeader)}
              </div>
              <button 
                onClick={() => copyToClipboard(`docker stop ${getContainerName(currentLeader)}`)}
                className="btn btn-primary"
                style={{ padding: '0.625rem 1rem', fontSize: '0.75rem' }}
              >
                COPY
              </button>
            </div>
          </div>
        )}

        {offlineNodes.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ 
              fontSize: '0.6875rem', 
              color: 'var(--text-muted)', 
              textTransform: 'uppercase', 
              letterSpacing: '0.05em',
              marginBottom: '0.5rem'
            }}>
              RESTART FAILED NODE
            </div>
            {offlineNodes.map((node) => (
              <div key={node.id} style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div className="docker-command docker-command-start" style={{ flex: 1 }}>
                    docker start {getContainerName(node.id)}
                  </div>
                  <button 
                    onClick={() => copyToClipboard(`docker start ${getContainerName(node.id)}`)}
                    className="btn btn-success"
                    style={{ padding: '0.625rem 1rem', fontSize: '0.75rem' }}
                  >
                    COPY
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{
          padding: '1rem',
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: '6px',
          fontSize: '0.75rem',
          color: 'var(--accent-warning)'
        }}>
          <strong>Workflow:</strong> Leader failure → Election → New leader → Node recovery → Cluster convergence
        </div>
      </div>
    </div>
  );
}
