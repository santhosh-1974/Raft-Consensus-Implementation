import { useState, useEffect } from 'react';
import { ClusterOverview } from './components/ClusterOverview';
import { NodeStatus } from './components/NodeStatus';
import { RaftMetrics } from './components/RaftMetrics';
import { KVStoreDemo } from './components/KVStoreDemo';
import { FailureSimulation } from './components/FailureSimulation';
import { useClusterData } from './hooks/useClusterData';

function App() {
  const { nodeData } = useClusterData();
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    setLastUpdated(new Date());
  }, [nodeData]);

  const getTimeSinceUpdate = () => {
    const seconds = Math.floor((new Date().getTime() - lastUpdated.getTime()) / 1000);
    if (seconds < 60) return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div className="header-title">
            <h1>Raft Consensus Cluster</h1>
            <p className="subtitle">3-Node Distributed Key-Value Store</p>
          </div>
          <div className="live-status">
            <div className="live-indicator"></div>
            <span>LIVE</span>
            <span className="last-updated">Last updated: {getTimeSinceUpdate()}</span>
          </div>
        </div>
      </header>
      <main className="main">
        <div className="dashboard-grid">
          <ClusterOverview nodeData={nodeData} />
          <NodeStatus nodeData={nodeData} />
          <RaftMetrics nodeData={nodeData} />
          <KVStoreDemo />
          <FailureSimulation nodeData={nodeData} />
        </div>
      </main>
    </div>
  );
}

export default App;
