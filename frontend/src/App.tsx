import { useState, useEffect } from 'react';
import { ClusterOverview } from './components/ClusterOverview';
import { NodeStatus } from './components/NodeStatus';
import { RaftMetrics } from './components/RaftMetrics';
import { RaftArchitecture } from './components/RaftArchitecture';
import { ClusterConvergence } from './components/ClusterConvergence';
import { ClusterEvents } from './components/ClusterEvents';
import { KVStoreDemo, type RecentWrite } from './components/KVStoreDemo';
import { FailureSimulation } from './components/FailureSimulation';
import { useClusterData } from './hooks/useClusterData';

function App() {
  const { nodeData } = useClusterData();
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [activeSection, setActiveSection] = useState('overview');
  const [recentWrite, setRecentWrite] = useState<RecentWrite | null>(null);

  useEffect(() => {
    setLastUpdated(new Date());
  }, [nodeData]);

  const getTimeSinceUpdate = () => {
    const seconds = Math.floor((new Date().getTime() - lastUpdated.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  };

  const onlineNodes = nodeData.filter(n => n.health !== null);
  const leaders = onlineNodes.filter(n => n.health?.state === 'LEADER');
  const currentLeader = leaders.length > 0 ? leaders[0].health?.nodeId : null;
  const currentTerm = leaders.length > 0 ? leaders[0].health?.term : 0;
  const isHealthy = onlineNodes.length === 3 && currentLeader !== null;

  const sections = [
    { id: 'overview', label: 'Overview', glyph: '01' },
    { id: 'topology', label: 'Topology', glyph: '02' },
    { id: 'replication', label: 'Replication', glyph: '03' },
    { id: 'activity', label: 'Activity', glyph: '04' },
    { id: 'operations', label: 'Operations', glyph: '05' },
  ];

  const navigateTo = (section: string) => {
    setActiveSection(section);
    document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="control-plane">
      <header className="control-plane-header">
        <div className="brand-lockup">
          <div className="brand-mark">R</div>
          <div className="brand">
            <h1>RAFT CONTROL PLANE</h1>
            <p className="brand-subtitle">Consensus observability / localhost</p>
          </div>
        </div>
        <div className="header-right">
          <div className="cluster-status-indicator">
            <div className={`status-dot ${isHealthy ? 'status-healthy' : 'status-degraded'}`}></div>
            <span className="status-text">{isHealthy ? 'OPERATIONAL' : 'DEGRADED'}</span>
          </div>
          <div className="header-metrics">
            <span className="header-metric">
              <span className="metric-label">CURRENT TERM</span>
              <span className="metric-value">{currentTerm}</span>
            </span>
            <span className="header-metric">
              <span className="metric-label">LEADER</span>
              <span className="metric-value">{currentLeader || 'None'}</span>
            </span>
          </div>
          <div className="live-indicator">
            <div className="live-dot"></div>
            <span className="live-text">MONITORING</span>
            <span className="live-updated">{getTimeSinceUpdate()}</span>
          </div>
        </div>
      </header>

      <div className="control-plane-body">
        <aside className="sidebar">
          <nav className="sidebar-nav" aria-label="Dashboard sections">
            <div className="sidebar-label">CONTROL SURFACES</div>
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
            <span>3 nodes configured</span>
          </div>
        </aside>

        <main className="main-content">
          <div className="content-section">
            <section id="overview" className="dashboard-section">
              <ClusterOverview nodeData={nodeData} />
              <NodeStatus nodeData={nodeData} />
            </section>
            <section id="topology" className="dashboard-section">
              <RaftArchitecture nodeData={nodeData} recentWrite={recentWrite} />
              <RaftMetrics nodeData={nodeData} />
            </section>
            <section id="replication" className="dashboard-section">
              <ClusterConvergence nodeData={nodeData} />
            </section>
            <section id="activity" className="dashboard-section">
              <ClusterEvents nodeData={nodeData} />
            </section>
            <section id="operations" className="dashboard-section operations-grid">
              <div><KVStoreDemo onSuccessfulWrite={setRecentWrite} /></div>
              <FailureSimulation nodeData={nodeData} />
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
