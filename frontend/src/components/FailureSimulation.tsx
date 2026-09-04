import { useState } from 'react';
import type { NodeInfo } from '../types/api';
import { FailureRecoveryFlow } from './FailureRecoveryFlow';

interface FailureSimulationProps {
  nodeData: NodeInfo[];
}

export function FailureSimulation({ nodeData }: FailureSimulationProps) {
  const onlineNodes = nodeData.filter(n => n.health !== null);
  const leaders = onlineNodes.filter(n => n.health?.state === 'LEADER');
  const currentLeader = leaders.length > 0 ? leaders[0].health?.nodeId : null;
  const offlineNodes = nodeData.filter(n => n.health === null);

  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

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
    setCopiedCmd(text);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  return (
    <div className="card">
      <h2>FAILURE & RECOVERY CONTROLS</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        {/* Compact Workflow Stage Indicator */}
        <FailureRecoveryFlow nodeData={nodeData} />

        {/* Current Leader Status */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-soft)', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)' }}>
          <span className="metric-label">CURRENT CLUSTER LEADER</span>
          <span className="metric-hero-sm" style={{ fontSize: '14px', color: currentLeader ? 'var(--green)' : 'var(--red)' }}>
            {currentLeader ? currentLeader : 'ELECTION IN PROGRESS'}
          </span>
        </div>

        {/* Manual Docker Stop Command Snippet */}
        {currentLeader && (
          <div>
            <div className="ops-section-label">SIMULATE LEADER FAILURE (POWERSHELL / TERMINAL)</div>
            <div style={{ color: 'var(--muted)', fontSize: '11px', margin: '2px 0 6px' }}>
              Run in your terminal to stop the active leader container and trigger a Raft election:
            </div>
            <div className="ops-command-row">
              <div className="docker-command docker-command-stop">
                docker stop {getContainerName(currentLeader)}
              </div>
              <button
                onClick={() => copyToClipboard(`docker stop ${getContainerName(currentLeader)}`)}
                className="btn btn-ghost"
              >
                {copiedCmd === `docker stop ${getContainerName(currentLeader)}` ? 'COPIED ✓' : 'COPY'}
              </button>
            </div>
          </div>
        )}

        {/* Manual Docker Start Command Snippet */}
        {offlineNodes.length > 0 && (
          <div>
            <div className="ops-section-label">RESTART FAILED NODE CONTAINER</div>
            {offlineNodes.map((node) => (
              <div key={node.id} className="ops-command-row">
                <div className="docker-command docker-command-start">
                  docker start {getContainerName(node.id)}
                </div>
                <button
                  onClick={() => copyToClipboard(`docker start ${getContainerName(node.id)}`)}
                  className="btn btn-success"
                >
                  {copiedCmd === `docker start ${getContainerName(node.id)}` ? 'COPIED ✓' : 'COPY'}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="alert-banner alert-banner--warning" style={{ marginTop: 0 }}>
          <strong>Operator Note:</strong> Browser monitors Raft endpoints strictly via polling. Execute Docker commands manually in shell to simulate node outage/recovery.
        </div>
      </div>
    </div>
  );
}
