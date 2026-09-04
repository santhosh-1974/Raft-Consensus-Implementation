import { useState, useEffect } from 'react';
import { ClusterOverview } from './components/ClusterOverview';
import { RaftArchitecture } from './components/RaftArchitecture';
import { ConsensusFlow } from './components/ConsensusFlow';
import { RaftMetrics } from './components/RaftMetrics';
import { ClusterConvergence } from './components/ClusterConvergence';
import { ClusterEvents } from './components/ClusterEvents';
import { KVStoreDemo, type RecentWrite } from './components/KVStoreDemo';
import { FailureSimulation } from './components/FailureSimulation';
import { useClusterData } from './hooks/useClusterData';

function App() {
  const { nodeData, isLoading, hasEverPolled } = useClusterData();
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [activeSection, setActiveSection] = useState('topology');
  const [recentWrite, setRecentWrite] = useState<RecentWrite | null>(null);

  useEffect(() => {
    if (hasEverPolled) {
      setLastUpdated(new Date());
    }
  }, [nodeData, hasEverPolled]);

  const getTimeSinceUpdate = () => {
    const seconds = Math.floor((new Date().getTime() - lastUpdated.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  };

  // Derive current state ONLY from live poll results, never from stale data.
  const onlineNodes = nodeData.filter(n => n.health !== null);
  const leaders = onlineNodes.filter(n => n.health?.state === 'LEADER');
  const currentLeader = leaders.length > 0 ? leaders[0].health?.nodeId ?? null : null;
  const onlineCount = onlineNodes.length;

  // Cluster is healthy only when all 3 nodes respond AND a leader is present.
  const isHealthy = onlineCount === 3 && currentLeader !== null;
  // Cluster is fully disconnected after first poll and zero nodes responded.
  const isDisconnected = hasEverPolled && onlineCount === 0;

  const getStatusLabel = () => {
    if (!hasEverPolled || isLoading) return 'CONNECTING';
    if (isDisconnected) return 'DISCONNECTED';
    if (isHealthy) return 'OPERATIONAL';
    return 'DEGRADED';
  };

  const getStatusDotClass = () => {
    if (!hasEverPolled || isLoading) return 'status-connecting';
    if (isDisconnected) return 'status-disconnected';
    if (isHealthy) return 'status-healthy';
    return 'status-degraded';
  };

  const sections = [
    { id: 'topology', label: 'Topology', glyph: '01' },
    { id: 'consensus-metrics', label: 'Consensus & Metrics', glyph: '02' },
    { id: 'convergence-activity', label: 'Convergence & Events', glyph: '03' },
    { id: 'operations', label: 'Operations & Failure', glyph: '04' },
  ];

  const navigateTo = (section: string) => {
    setActiveSection(section);
    document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="control-plane">
      {/* 1. TOP HEADER */}
      <header className="control-plane-header">
        <div className="brand-lockup">
          <div className="brand-mark">R</div>
          <div className="brand">
            <h1>RAFT CONTROL PLANE</h1>
            <p className="brand-subtitle">distributed consensus monitoring console</p>
          </div>
        </div>
        
        <div className="header-right">
          <div className="cluster-status-indicator">
            <div className={`status-dot ${getStatusDotClass()}`} />
            <span className="status-text">{getStatusLabel()}</span>
          </div>

          <div className="live-indicator">
            <div className="live-dot" />
            <span className="live-text">LIVE</span>
            <span className="live-updated">{hasEverPolled ? getTimeSinceUpdate() : '—'}</span>
          </div>
        </div>
      </header>

      <div className="control-plane-body">
        {/* SIDEBAR NAVIGATION */}
        <aside className="sidebar">
          <div className="sidebar-label">MONITORING SURFACES</div>
          <nav className="sidebar-nav" aria-label="Dashboard sections">
            {sections.map((section) => (
              <button
                key={section.id}
                className={`nav-item ${activeSection === section.id ? 'nav-item-active' : ''}`}
                onClick={() => navigateTo(section.id)}
              >
                <span className="nav-icon">{section.glyph}</span>
                <span>{section.label}</span>
              </button>
            ))}
          </nav>
          <div className="sidebar-footer">
            <span className="sidebar-footer-dot" />
            <span>3 Raft Nodes Configured</span>
          </div>
        </aside>

        {/* MAIN MONITORING SURFACE — DUAL-COLUMN GRID LAYOUT */}
        <main className="main-content">
          <div className="content-section">
            
            {/* ROW 1: Distinct Raft Protocol Overview Metrics */}
            <ClusterOverview nodeData={nodeData} hasEverPolled={hasEverPolled} />

            {/* ROW 2: CLUSTER TOPOLOGY — VISUAL CENTERPIECE */}
            <section id="topology" className="dashboard-section">
              <RaftArchitecture nodeData={nodeData} recentWrite={recentWrite} hasEverPolled={hasEverPolled} />
            </section>

            {/* ROW 3: CONSENSUS PIPELINE (60%) + RAFT METRICS (40%) */}
            <section id="consensus-metrics" className="dashboard-section section-dual-grid-60-40">
              <ConsensusFlow nodeData={nodeData} recentWrite={recentWrite} />
              <RaftMetrics nodeData={nodeData} hasEverPolled={hasEverPolled} />
            </section>

            {/* ROW 4: CLUSTER CONVERGENCE (50%) + OBSERVED EVENTS (50%) */}
            <section id="convergence-activity" className="dashboard-section section-dual-grid-50-50">
              <ClusterConvergence nodeData={nodeData} />
              <ClusterEvents nodeData={nodeData} />
            </section>

            {/* ROW 5: KV STORE CONSOLE (50%) + FAILURE SIMULATION (50%) */}
            <section id="operations" className="dashboard-section section-dual-grid-50-50">
              <KVStoreDemo onSuccessfulWrite={setRecentWrite} />
              <FailureSimulation nodeData={nodeData} />
            </section>

          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
