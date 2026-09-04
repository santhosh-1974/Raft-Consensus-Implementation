import { useState, useEffect, useRef } from 'react';
import { NODES, getHealth, getMetrics } from '../services/api';
import type { HealthResponse, MetricsResponse, NodeInfo } from '../types/api';

const POLLING_INTERVAL = 2000; // 2 seconds

// Initial state: all nodes are unknown (not yet polled) — health and metrics are null.
// This ensures we NEVER display stale mock data as current cluster state.
const INITIAL_NODE_DATA: NodeInfo[] = NODES.map(node => ({
  id: node.id,
  url: node.url,
  health: null,
  metrics: null,
}));

export function useClusterData() {
  const [nodeData, setNodeData] = useState<NodeInfo[]>(INITIAL_NODE_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const [hasEverPolled, setHasEverPolled] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);

  const fetchNodeData = async () => {
    if (isPollingRef.current) {
      return;
    }

    isPollingRef.current = true;

    try {
      const promises = NODES.map(async (node) => {
        let health: HealthResponse | null = null;
        let metrics: MetricsResponse | null = null;

        try {
          health = await getHealth(node.url);
        } catch {
          // Node is offline — health stays null (clears any previous value)
        }

        try {
          metrics = await getMetrics(node.url);
        } catch {
          // Node is offline — metrics stays null (clears any previous value)
        }

        // Always return current observation: null means unreachable RIGHT NOW.
        return { id: node.id, url: node.url, health, metrics };
      });

      const results = await Promise.all(promises);

      // Always update nodeData with the latest poll results.
      // If a node failed, its health/metrics will be null — this is the correct
      // current state. We must NOT preserve stale values from a previous cycle.
      setNodeData(results);
      setIsLoading(false);
      setHasEverPolled(true);
    } catch (error) {
      console.error('Error fetching cluster data:', error);
    } finally {
      isPollingRef.current = false;
    }
  };

  useEffect(() => {
    fetchNodeData();
    pollingRef.current = setInterval(fetchNodeData, POLLING_INTERVAL);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  return { nodeData, isLoading, hasEverPolled };
}
