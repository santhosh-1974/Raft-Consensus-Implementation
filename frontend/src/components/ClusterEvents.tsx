import { useState, useEffect, useRef } from 'react';
import type { NodeInfo } from '../types/api';

type EventType =
  | 'MONITORING_STARTED'
  | 'LEADER_DETECTED'
  | 'LEADER_CHANGED'
  | 'NODE_OFFLINE'
  | 'NODE_RECOVERED'
  | 'NODE_ROLE_CHANGED'
  | 'CLUSTER_CONVERGED'
  | 'CLUSTER_CONVERGENCE_LOST';

interface ClusterEvent {
  id: string;
  timestamp: Date;
  type: EventType;
  message: string;
  details?: string;
}

interface ClusterEventsProps {
  nodeData: NodeInfo[];
}

export function ClusterEvents({ nodeData }: ClusterEventsProps) {
  const [events, setEvents] = useState<ClusterEvent[]>([]);
  const [initialized, setInitialized] = useState(false);

  const previousStateRef = useRef<{
    leader: string | null;
    nodeStates: Record<string, { online: boolean; hasBeenOnline: boolean; state: string | null; term: number | null }>;
    converged: boolean | null;
  }>({
    leader: null,
    nodeStates: {},
    converged: null
  });

  const lastEventRef = useRef<string>('');

  const addEvent = (type: EventType, message: string, details?: string) => {
    const eventId = `${type}:${message}:${details || ''}`;
    if (lastEventRef.current === eventId) return;

    lastEventRef.current = eventId;
    const newEvent: ClusterEvent = {
      id: Date.now().toString(),
      timestamp: new Date(),
      type,
      message,
      details
    };

    setEvents(prev => [newEvent, ...prev].slice(0, 15));
  };

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

  useEffect(() => {
    if (!initialized) {
      addEvent('MONITORING_STARTED', 'Cluster monitoring started');
      setInitialized(true);
      return;
    }

    const onlineNodes = nodeData.filter(n => n.health !== null);
    const leaders = onlineNodes.filter(n => n.health?.state === 'LEADER');
    const currentLeader: string | null = leaders.length > 0 ? (leaders[0].health?.nodeId ?? null) : null;
    const currentTerm: number | null = leaders.length > 0 ? (leaders[0].health?.term ?? null) : null;
    const isConverged = checkConvergence();

    // Leader detection/change
    if (currentLeader !== previousStateRef.current.leader) {
      if (currentLeader && !previousStateRef.current.leader) {
        addEvent('LEADER_DETECTED', `Leader detected: ${currentLeader}`, `Term: ${currentTerm}`);
      } else if (currentLeader && previousStateRef.current.leader) {
        addEvent('LEADER_CHANGED', `Leader changed`, `${previousStateRef.current.leader} → ${currentLeader}\nTerm: ${currentTerm}`);
      } else if (!currentLeader && previousStateRef.current.leader) {
        addEvent('LEADER_CHANGED', `Leader lost`, `${previousStateRef.current.leader} → None`);
      }
      previousStateRef.current.leader = currentLeader;
    }

    // Node availability and role changes
    nodeData.forEach(node => {
      const prevState = previousStateRef.current.nodeStates[node.id];
      const isOnline = node.health !== null;
      const currentState = node.health?.state || null;
      const currentTerm = node.health?.term ?? null;

      if (!prevState) {
        previousStateRef.current.nodeStates[node.id] = { online: isOnline, hasBeenOnline: isOnline, state: currentState, term: currentTerm };
        return;
      }

      // Availability change
      if (prevState.online !== isOnline) {
        if (!isOnline) {
          addEvent('NODE_OFFLINE', `${node.id} became OFFLINE`);
        } else if (prevState.hasBeenOnline) {
          addEvent('NODE_RECOVERED', `${node.id} recovered`);
        }
      }

      // Role change (only if online)
      if (isOnline && prevState.online && prevState.state !== currentState) {
        addEvent('NODE_ROLE_CHANGED', `${node.id} became ${currentState}`, `Term: ${currentTerm}`);
      }

      previousStateRef.current.nodeStates[node.id] = { online: isOnline, hasBeenOnline: prevState.hasBeenOnline || isOnline, state: currentState, term: currentTerm };
    });

    // Convergence change
    if (previousStateRef.current.converged !== null && previousStateRef.current.converged !== isConverged) {
      if (isConverged) {
        addEvent('CLUSTER_CONVERGED', '✓ Cluster converged', 'All online nodes synchronized');
      } else {
        addEvent('CLUSTER_CONVERGENCE_LOST', '⚠ Cluster convergence lost', 'Replication catch-up required');
      }
    }
    previousStateRef.current.converged = isConverged;
  }, [nodeData, initialized]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const getEventIndicator = (type: EventType) => {
    switch (type) {
      case 'MONITORING_STARTED': return '●';
      case 'LEADER_DETECTED': return '●';
      case 'LEADER_CHANGED': return '↻';
      case 'NODE_OFFLINE': return '!';
      case 'NODE_RECOVERED': return '↺';
      case 'NODE_ROLE_CHANGED': return '↻';
      case 'CLUSTER_CONVERGED': return '✓';
      case 'CLUSTER_CONVERGENCE_LOST': return '⚠';
      default: return '•';
    }
  };

  const getEventColor = (type: EventType) => {
    switch (type) {
      case 'MONITORING_STARTED': return 'var(--accent-success)';
      case 'LEADER_DETECTED': return 'var(--accent-success)';
      case 'LEADER_CHANGED': return 'var(--accent-warning)';
      case 'NODE_OFFLINE': return 'var(--accent-danger)';
      case 'NODE_RECOVERED': return 'var(--accent-primary)';
      case 'NODE_ROLE_CHANGED': return 'var(--accent-warning)';
      case 'CLUSTER_CONVERGED': return 'var(--accent-success)';
      case 'CLUSTER_CONVERGENCE_LOST': return 'var(--accent-warning)';
      default: return 'var(--text-secondary)';
    }
  };

  return (
    <div className="card">
      <h2>RECENT ACTIVITY</h2>
      <div style={{
        background: 'var(--bg-tertiary)',
        padding: '1rem',
        borderRadius: '6px',
        border: '1px solid var(--border-subtle)',
        maxHeight: '350px',
        overflowY: 'auto'
      }}>
        {events.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'center', padding: '2rem' }}>
            No recent cluster events.
          </div>
        ) : (
          events.map((event) => (
            <div key={event.id} style={{
              marginBottom: '0.75rem',
              fontSize: '0.75rem',
              color: 'var(--text-primary)',
              borderBottom: '1px solid var(--border-subtle)',
              paddingBottom: '0.75rem'
            }}>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <span style={{
                  color: getEventColor(event.type),
                  fontSize: '0.875rem',
                  minWidth: '20px',
                  textAlign: 'center'
                }}>
                  {getEventIndicator(event.type)}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <span style={{
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.6875rem',
                      minWidth: '60px'
                    }}>
                      {formatTime(event.timestamp)}
                    </span>
                    <span style={{
                      color: getEventColor(event.type),
                      fontWeight: '600',
                      fontSize: '0.8125rem'
                    }}>
                      {event.message}
                    </span>
                  </div>
                  {event.details && (
                    <div style={{
                      color: 'var(--text-muted)',
                      fontSize: '0.6875rem',
                      marginLeft: '0.25rem',
                      whiteSpace: 'pre-line',
                      fontFamily: 'var(--font-mono)'
                    }}>
                      {event.details}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
