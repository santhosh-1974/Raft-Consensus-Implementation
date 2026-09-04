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

    setEvents(prev => [newEvent, ...prev].slice(0, 20));
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
      addEvent('MONITORING_STARTED', 'Cluster observability stream started');
      setInitialized(true);
      return;
    }

    const onlineNodes = nodeData.filter(n => n.health !== null);
    const leaders = onlineNodes.filter(n => n.health?.state === 'LEADER');
    const currentLeader: string | null = leaders.length > 0 ? (leaders[0].health?.nodeId ?? null) : null;
    const currentTerm: number | null = leaders.length > 0 ? (leaders[0].health?.term ?? null) : null;
    const isConverged = checkConvergence();

    if (currentLeader !== previousStateRef.current.leader) {
      if (currentLeader && !previousStateRef.current.leader) {
        addEvent('LEADER_DETECTED', `Leader detected: ${currentLeader}`, `Term: ${currentTerm}`);
      } else if (currentLeader && previousStateRef.current.leader) {
        addEvent('LEADER_CHANGED', `Leader changed`, `${previousStateRef.current.leader} → ${currentLeader} (Term: ${currentTerm})`);
      } else if (!currentLeader && previousStateRef.current.leader) {
        addEvent('LEADER_CHANGED', `Leader lost`, `${previousStateRef.current.leader} → None (Election in progress)`);
      }
      previousStateRef.current.leader = currentLeader;
    }

    nodeData.forEach(node => {
      const prevState = previousStateRef.current.nodeStates[node.id];
      const isOnline = node.health !== null;
      const currentState = node.health?.state || null;
      const currentTerm = node.health?.term ?? null;

      if (!prevState) {
        previousStateRef.current.nodeStates[node.id] = { online: isOnline, hasBeenOnline: isOnline, state: currentState, term: currentTerm };
        return;
      }

      if (prevState.online !== isOnline) {
        if (!isOnline) {
          addEvent('NODE_OFFLINE', `Node failure detected: ${node.id}`);
        } else if (prevState.hasBeenOnline) {
          addEvent('NODE_RECOVERED', `Node recovered: ${node.id}`);
        }
      }

      if (isOnline && prevState.online && prevState.state !== currentState) {
        addEvent('NODE_ROLE_CHANGED', `Role changed for ${node.id}`, `Transitioned to ${currentState} (Term: ${currentTerm})`);
      }

      previousStateRef.current.nodeStates[node.id] = {
        online: isOnline,
        hasBeenOnline: prevState.hasBeenOnline || isOnline,
        state: currentState,
        term: currentTerm
      };
    });

    if (previousStateRef.current.converged !== null && previousStateRef.current.converged !== isConverged) {
      if (isConverged) {
        addEvent('CLUSTER_CONVERGED', '✓ Cluster state converged', 'All online nodes synchronized');
      } else {
        addEvent('CLUSTER_CONVERGENCE_LOST', '⚠ Cluster convergence lost', 'Log catch-up in progress');
      }
    }
    previousStateRef.current.converged = isConverged;
  }, [nodeData, initialized]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const getEventStyle = (type: EventType) => {
    switch (type) {
      case 'MONITORING_STARTED':
      case 'LEADER_DETECTED':
      case 'CLUSTER_CONVERGED':
        return { color: 'var(--green)', bg: 'var(--green-dim)', border: 'var(--green-border)', icon: '✓' };
      case 'LEADER_CHANGED':
      case 'NODE_ROLE_CHANGED':
      case 'CLUSTER_CONVERGENCE_LOST':
        return { color: 'var(--amber)', bg: 'var(--amber-dim)', border: 'var(--amber-border)', icon: '↻' };
      case 'NODE_OFFLINE':
        return { color: 'var(--red)', bg: 'var(--red-dim)', border: 'var(--red-border)', icon: '✕' };
      case 'NODE_RECOVERED':
        return { color: 'var(--cyan)', bg: 'var(--cyan-dim)', border: 'var(--cyan-border)', icon: '↺' };
      default:
        return { color: 'var(--muted)', bg: 'var(--surface-soft)', border: 'var(--line)', icon: '•' };
    }
  };

  return (
    <div className="card">
      <h2>OBSERVED CLUSTER EVENT STREAM</h2>
      <div className="events-panel">
        {events.length === 0 ? (
          <div className="events-empty">No cluster events observed yet.</div>
        ) : (
          events.map((event) => {
            const style = getEventStyle(event.type);
            return (
              <div key={event.id} className="event-item">
                <div
                  className="event-indicator"
                  style={{ color: style.color, background: style.bg, borderColor: style.border }}
                >
                  {style.icon}
                </div>
                <div className="event-body">
                  <div className="event-header">
                    <span className="event-time">[{formatTime(event.timestamp)}]</span>
                    <span className="event-message" style={{ color: style.color }}>{event.message}</span>
                  </div>
                  {event.details && (
                    <div className="event-details">{event.details}</div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
