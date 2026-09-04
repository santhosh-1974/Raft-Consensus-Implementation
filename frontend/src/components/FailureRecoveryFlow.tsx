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
    const online = nodeData.filter(n => n.health !== null);
    if (online.length < 2) return false;

    const metrics = online.map(n => ({
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
    if (offlineNodes.length > 0 && !failedNode) {
      setFailedNode(offlineNodes[0].id);
    }

    if (currentLeader !== previousLeader) {
      setPreviousLeader(currentLeader || null);
    }

    if (offlineNodes.length === 0 && currentLeader && isConverged && !failedNode && !recoveryStarted) {
      setCurrentStage('HEALTHY');
    } else if (offlineNodes.length > 0) {
      setCurrentStage('FAILURE_DETECTED');
    } else if (currentLeader && previousLeader && currentLeader !== previousLeader && failedNode) {
      setCurrentStage('LEADER_CHANGE');
    } else if (failedNode && offlineNodes.length === 0 && !isConverged) {
      setCurrentStage('NODE_RECOVERED');
      setRecoveryStarted(true);
    } else if (failedNode && offlineNodes.length === 0 && isConverged) {
      setCurrentStage('CONVERGED');
    } else if (offlineNodes.length === 0 && currentLeader && isConverged && recoveryStarted) {
      setCurrentStage('CONVERGED');
    } else {
      setCurrentStage('HEALTHY');
    }

    if (failedNode && offlineNodes.length === 0 && isConverged) {
      const timer = setTimeout(() => {
        setFailedNode(null);
        setRecoveryStarted(false);
      }, 5000);
      return () => clearTimeout(timer);
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
    if (stage.completed && !stage.active) return '✓';
    if (stage.active) return '●';
    return '○';
  };

  const getStageClass = (stage: Stage) => {
    if (stage.id === 'HEALTHY' || stage.id === 'CONVERGED') {
      return stage.active ? 'failure-stage--healthy-active' : stage.completed ? 'failure-stage--completed' : 'failure-stage--pending';
    }
    return stage.active ? 'failure-stage--active' : stage.completed ? 'failure-stage--completed' : 'failure-stage--pending';
  };

  return (
    <div>
      <div className="failure-flow">
        {stages.map((stage, index) => (
          <div key={stage.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div className={`failure-stage ${getStageClass(stage)}`}>
              <span>{getStageIcon(stage)}</span>
              <span>{stage.label}</span>
            </div>
            {index < stages.length - 1 && (
              <span className="failure-stage-arrow">→</span>
            )}
          </div>
        ))}
      </div>

      {failedNode && offlineNodes.length > 0 && (
        <div className="alert-banner alert-banner--danger">
          <strong>Node Down: {failedNode}</strong>
          <div className="alert-banner-sub">Restart container via PowerShell to begin recovery.</div>
        </div>
      )}

      {isConverged && offlineNodes.length === 0 && (
        <div className="alert-banner alert-banner--success">
          <strong>✓ CLUSTER CONVERGED</strong>
          <div className="alert-banner-sub">
            Active quorum healthy. (Term {currentTerm ?? '—'}, leader: {currentLeader ?? '—'})
          </div>
        </div>
      )}
    </div>
  );
}
