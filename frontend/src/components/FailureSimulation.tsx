import type { NodeInfo } from '../types/api';

interface FailureSimulationProps {
  nodeData: NodeInfo[];
}

export function FailureSimulation({ nodeData }: FailureSimulationProps) {
  const onlineNodes = nodeData.filter(n => n.health !== null);
  const leaders = onlineNodes.filter(n => n.health?.state === 'LEADER');
  const currentLeader = leaders.length > 0 ? leaders[0].health?.nodeId : null;

  const getContainerName = (nodeId: string) => {
    const map: Record<string, string> = {
      'node1': 'raft-node-1',
      'node2': 'raft-node-2',
      'node3': 'raft-node-3'
    };
    return map[nodeId] || nodeId;
  };

  const getNodeStatus = (nodeInfo: NodeInfo) => {
    if (nodeInfo.health === null) return 'OFFLINE';
    return nodeInfo.health.state;
  };

  const recoveryChecklist = [
    {
      label: 'Leader detected',
      complete: currentLeader !== null
    },
    {
      label: 'All nodes online',
      complete: onlineNodes.length === 3
    },
    {
      label: 'Cluster has majority',
      complete: onlineNodes.length >= 2
    },
    {
      label: 'No candidates (stable)',
      complete: onlineNodes.filter(n => n.health?.state === 'CANDIDATE').length === 0
    }
  ];

  return (
    <div className="card full-width">
      <h2>Failure & Recovery Demo</h2>
      
      <div className="failure-controls">
        <div className="failure-section">
          <h3>Current State</h3>
          <div className="cluster-info">
            <div className="info-item">
              <span className="label">Current Leader</span>
              <span className="value">{currentLeader || 'No Leader'}</span>
            </div>
            <div className="info-item">
              <span className="label">Online Nodes</span>
              <span className="value">{onlineNodes.length}/3</span>
            </div>
          </div>
        </div>

        <div className="failure-section">
          <h3>Failure Scenario</h3>
          <div style={{ 
            background: '#0d1117', 
            padding: '1rem', 
            borderRadius: '4px', 
            fontSize: '0.8125rem',
            lineHeight: '1.8',
            color: '#8b949e'
          }}>
            <div>Leader active</div>
            <div>↓</div>
            <div>Node stopped (via Docker)</div>
            <div>↓</div>
            <div>Election triggered</div>
            <div>↓</div>
            <div>New leader elected</div>
            <div>↓</div>
            <div>Cluster continues operating</div>
            <div>↓</div>
            <div>Failed node restarted</div>
            <div>↓</div>
            <div>Log catches up via replication</div>
          </div>
        </div>

        <div className="failure-section">
          <h3>Docker Commands</h3>
          <p style={{ fontSize: '0.8125rem', color: '#8b949e', marginBottom: '1rem' }}>
            Run these commands in your terminal to simulate failures:
          </p>
          {nodeData.map((node) => (
            <div key={node.id} style={{ marginBottom: '1rem' }}>
              <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#c9d1d9', fontSize: '0.875rem' }}>
                {node.id} ({getNodeStatus(node)})
              </div>
              <div className="docker-command docker-command-stop">
                docker stop {getContainerName(node.id)}
              </div>
              <div className="docker-command docker-command-start">
                docker start {getContainerName(node.id)}
              </div>
            </div>
          ))}
        </div>

        <div className="failure-section">
          <h3>Recovery Checklist</h3>
          <div style={{ background: '#0d1117', padding: '1rem', borderRadius: '4px', border: '1px solid #21262d' }}>
            {recoveryChecklist.map((item, index) => (
              <div key={index} className="checklist-item">
                <span style={{ 
                  color: item.complete ? '#3fb950' : '#6e7681'
                }}>
                  {item.complete ? '✓' : '○'}
                </span>
                <span className={item.complete ? 'checklist-complete' : 'checklist-incomplete'}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="failure-section">
          <h3>Demo Steps</h3>
          <ol style={{ paddingLeft: '1.25rem', lineHeight: '1.8', fontSize: '0.8125rem', color: '#8b949e' }}>
            <li>Identify the current leader from the dashboard</li>
            <li>Run <code style={{ background: '#161b22', padding: '0.125rem 0.375rem', borderRadius: '3px', color: '#c9d1d9' }}>docker stop [container-name]</code> on the leader</li>
            <li>Watch the dashboard - a new election will occur</li>
            <li>Observe a new leader being elected from remaining nodes</li>
            <li>Run <code style={{ background: '#161b22', padding: '0.125rem 0.375rem', borderRadius: '3px', color: '#c9d1d9' }}>docker start [container-name]</code> to restart the failed node</li>
            <li>Watch the node recover and its log catch up via replication</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
