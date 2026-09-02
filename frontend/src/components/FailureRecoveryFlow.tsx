import { useState, useEffect } from 'react';
import type { NodeInfo } from '../types/api';

interface FailureRecoveryFlowProps {
  nodeData: NodeInfo[];
}

type FlowStage = 'HEALTHY' | 'FAILURE_DETECTED' | 'LEADER_CHANGE' | 'NODE_RECOVERED' | 'CONVERGED';

interface Stage {
  id: FlowStage;
  label: string;
  completed: boolean;
  active: boolean;
}

export function FailureRecoveryFlow({ nodeData }: FailureRecoveryFlowProps) {
  const [failedNode, setFailedNode] = useState<string | null>(null);
  const [previousLeader, setPreviousLeader] = useState<string | null>(null);
  const [currentStage, setCurrentStage] = useState<FlowStage>('HEALTHY');
  const [recoveryStarted, setRecoveryStarted] = useState(false);

  const onlineNodes = nodeData.filter(n => n.health !== null);
  const leaders = onlineNodes.filter(n => n.health?.state === 'LEADER');
  const currentLeader = leaders.length > 0 ? leaders[0].health?.nodeId : null;
  const currentTerm = leaders.length > 0 ? leaders[0].health?.term : null;
  const offlineNodes = nodeData.filter(n => n.health === null);

  const checkConvergence = () => {
    const onlineNodes = nodeData.filter(n => n.health !== null);
    if (onlineNodes.length < 2) return false;

    const metrics = onlineNodes.map(n => ({
      logLength: n.metrics?.logLength ?? 0,
      commitIndex: n.metrics?.commitIndex ?? 0,
      lastApplied: n.metrics?.lastApplied ?? 0
    }));

    const first = metrics[0];
    return metrics.every(m =>
      m.logLength === first.logLength &&
      m.commitIndex === first.commitIndex &&
      m.lastApplied === first.lastApplied
    );
  };

  const isConverged = checkConvergence();

  useEffect(() => {
    // Track failed node
    if (offlineNodes.length > 0 && !failedNode) {
      setFailedNode(offlineNodes[0].id);
    }

    // Track leader changes
    if (currentLeader !== previousLeader) {
      setPreviousLeader(currentLeader || null);
    }

    // Determine stage based on observed state
    if (offlineNodes.length === 0 && currentLeader && isConverged && !failedNode && !recoveryStarted) {
      // Normal healthy state, no failure occurred
      setCurrentStage('HEALTHY');
    } else if (offlineNodes.length > 0) {
      // Node is offline
      setCurrentStage('FAILURE_DETECTED');
    } else if (currentLeader && previousLeader && currentLeader !== previousLeader && failedNode) {
      // Leader changed after failure
      setCurrentStage('LEADER_CHANGE');
    } else if (failedNode && offlineNodes.length === 0 && !isConverged) {
      // Failed node recovered but not converged
      setCurrentStage('NODE_RECOVERED');
      setRecoveryStarted(true);
    } else if (failedNode && offlineNodes.length === 0 && isConverged) {
      // Cluster converged after recovery
      setCurrentStage('CONVERGED');
    } else if (offlineNodes.length === 0 && currentLeader && isConverged && recoveryStarted) {
      // Back to healthy after full recovery cycle
      setCurrentStage('CONVERGED');
    } else {
      setCurrentStage('HEALTHY');
    }

    // Reset failed node if it's back online and we're converged
    if (failedNode && offlineNodes.length === 0 && isConverged) {
      setTimeout(() => {
        setFailedNode(null);
        setRecoveryStarted(false);
      }, 5000);
    }
  }, [nodeData, currentLeader, previousLeader, offlineNodes, failedNode, isConverged, recoveryStarted]);

  const stages: Stage[] = [
    { id: 'HEALTHY', label: 'HEALTHY', completed: true, active: currentStage === 'HEALTHY' },
    { id: 'FAILURE_DETECTED', label: 'FAILURE DETECTED', completed: ['FAILURE_DETECTED', 'LEADER_CHANGE', 'NODE_RECOVERED', 'CONVERGED'].includes(currentStage), active: currentStage === 'FAILURE_DETECTED' },
    { id: 'LEADER_CHANGE', label: 'LEADER CHANGE', completed: ['LEADER_CHANGE', 'NODE_RECOVERED', 'CONVERGED'].includes(currentStage), active: currentStage === 'LEADER_CHANGE' },
    { id: 'NODE_RECOVERED', label: 'NODE RECOVERED', completed: ['NODE_RECOVERED', 'CONVERGED'].includes(currentStage), active: currentStage === 'NODE_RECOVERED' },
    { id: 'CONVERGED', label: 'CONVERGED', completed: currentStage === 'CONVERGED', active: currentStage === 'CONVERGED' }
  ];

  const getStageIcon = (stage: Stage) => {
    if (stage.completed) return '✓';
    if (stage.active) return '●';
    return '○';
  };

  const getStageColor = (stage: Stage) => {
    if (stage.completed) return '#3fb950';
    if (stage.active) return '#58a6ff';
    return '#6e7681';
  };

  const getContainerName = (nodeId: string) => {
    const map: Record<string, string> = {
      'node1': 'raft-node-1',
      'node2': 'raft-node-2',
      'node3': 'raft-node-3'
    };
    return map[nodeId] || nodeId;
  };

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.8125rem', color: '#8b949e', marginBottom: '0.25rem' }}>
          Current Leader
        </div>
        <div style={{ fontSize: '1rem', fontWeight: '600', color: '#c9d1d9' }}>
          {currentLeader || 'Election in progress...'}
          {currentTerm && <span style={{ fontSize: '0.8125rem', color: '#8b949e', marginLeft: '0.5rem' }}>Term {currentTerm}</span>}
        </div>
      </div>

      <div className="failure-flow" style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        marginBottom: '1.5rem',
        flexWrap: 'wrap'
      }}>
        {stages.map((stage, index) => (
          <div key={stage.id} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <div style={{
              padding: '0.375rem 0.75rem',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: '600',
              background: stage.active ? getStageColor(stage) : 'rgba(48, 54, 61, 0.5)',
              color: stage.active ? '#ffffff' : getStageColor(stage),
              border: stage.active ? `1px solid ${getStageColor(stage)}` : '1px solid #30363d',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem'
            }}>
              <span>{getStageIcon(stage)}</span>
              <span>{stage.label}</span>
            </div>
            {index < stages.length - 1 && (
              <span style={{ color: '#6e7681', fontSize: '0.75rem' }}>→</span>
            )}
          </div>
        ))}
      </div>

      {failedNode && offlineNodes.length > 0 && (
        <div style={{
          background: 'rgba(248, 81, 73, 0.1)',
          border: '1px solid rgba(248, 81, 73, 0.4)',
          padding: '1rem',
          borderRadius: '4px',
          marginBottom: '1rem'
        }}>
          <div style={{ fontSize: '0.8125rem', color: '#8b949e', marginBottom: '0.25rem' }}>
            Failed Node
          </div>
          <div style={{ fontSize: '1rem', fontWeight: '600', color: '#f85149', marginBottom: '0.5rem' }}>
            {failedNode}
          </div>
          <div style={{ fontSize: '0.8125rem', color: '#8b949e', marginBottom: '0.5rem' }}>
            Recovery:
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div className="docker-command docker-command-start" style={{ flex: 1 }}>
              docker start {getContainerName(failedNode)}
            </div>
          </div>
        </div>
      )}

      {isConverged && offlineNodes.length === 0 && (
        <div style={{
          background: 'rgba(63, 185, 80, 0.1)',
          border: '1px solid rgba(63, 185, 80, 0.4)',
          padding: '1rem',
          borderRadius: '4px',
          color: '#3fb950',
          fontSize: '0.8125rem'
        }}>
          <strong>✓ CLUSTER CONVERGED</strong>
          <div style={{ marginTop: '0.5rem', color: '#8b949e' }}>
            All online nodes have synchronized (commitIndex / logLength / lastApplied)
          </div>
        </div>
      )}
    </div>
  );
}
