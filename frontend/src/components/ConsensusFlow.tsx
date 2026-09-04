import { Fragment } from 'react';
import type { NodeInfo } from '../types/api';
import type { RecentWrite } from './KVStoreDemo';

interface ConsensusFlowProps {
  nodeData: NodeInfo[];
  recentWrite: RecentWrite | null;
}

type StepState = 'done' | 'active' | 'idle';

interface Step {
  label: string;
  value: string;
  sub: string;
  state: StepState;
}

export function ConsensusFlow({ nodeData, recentWrite }: ConsensusFlowProps) {
  const onlineNodes = nodeData.filter(n => n.health !== null);
  const leader = onlineNodes.find(n => n.health?.state === 'LEADER') ?? null;
  const majority = Math.floor(nodeData.length / 2) + 1;

  const committedNodeCount = recentWrite
    ? nodeData.filter(node => node.health !== null && (node.metrics?.commitIndex ?? -1) >= recentWrite.index).length
    : 0;

  const hasCommittedWrite = Boolean(
    recentWrite && leader && (leader.metrics?.commitIndex ?? -1) >= recentWrite.index
  );

  const hasAppliedWrite = Boolean(
    recentWrite && leader && (leader.metrics?.lastApplied ?? -1) >= recentWrite.index
  );

  const leaderCommit = leader?.metrics?.commitIndex ?? 0;
  const leaderLastApplied = leader?.metrics?.lastApplied ?? 0;

  const steps: Step[] = [
    {
      label: 'CLIENT WRITE',
      value: recentWrite ? `${recentWrite.method} /kv/${recentWrite.key}` : '—',
      sub: recentWrite ? `Log index ${recentWrite.index}` : 'Submit operation from KV console',
      state: recentWrite ? 'done' : 'idle',
    },
    {
      label: 'REPLICATED TO MAJORITY',
      value: recentWrite ? `${committedNodeCount} / ${nodeData.length} nodes` : '—',
      sub: `Quorum required: ${majority} of ${nodeData.length}`,
      state: !recentWrite ? 'idle' : committedNodeCount >= majority ? 'done' : 'active',
    },
    {
      label: 'MAJORITY COMMIT',
      value: recentWrite ? (hasCommittedWrite ? `Committed @ #${recentWrite.index}` : 'Committing…') : '—',
      sub: `Leader Commit Index: ${leaderCommit}`,
      state: !recentWrite ? 'idle' : hasCommittedWrite ? 'done' : 'active',
    },
    {
      label: 'STATE MACHINE',
      value: recentWrite
        ? (hasAppliedWrite ? `Applied @ #${recentWrite.index}` : hasCommittedWrite ? 'Applying…' : 'Pending')
        : '—',
      sub: `Leader Last Applied: ${leaderLastApplied}`,
      state: !recentWrite ? 'idle' : hasAppliedWrite ? 'done' : hasCommittedWrite ? 'active' : 'idle',
    },
  ];

  return (
    <div className="card">
      <h2>REPLICATION & CONSENSUS PIPELINE</h2>

      <div className="consensus-flow-strip">
        {steps.map((step, i) => (
          <Fragment key={step.label}>
            {i > 0 && <div className="flow-arrow-icon" aria-hidden="true">↓</div>}
            <div className={`flow-step-box flow-step-box--${step.state}`}>
              <span className="flow-label">{step.label}</span>
              <strong style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--text)' }}>
                {step.value}
              </strong>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)' }}>
                {step.sub}
              </span>
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}