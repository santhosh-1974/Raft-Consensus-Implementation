import { useState, useEffect, useRef } from 'react';
import { NODES, getHealth, getMetrics } from '../services/api';
import type { HealthResponse, MetricsResponse, NodeInfo } from '../types/api';

const POLLING_INTERVAL = 2000; // 2 seconds

export function useClusterData() {
  const [nodeData, setNodeData] = useState<NodeInfo[]>(
    NODES.map(node => ({ id: node.id, url: node.url, health: null, metrics: null }))
  );
  const [isLoading, setIsLoading] = useState(true);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);

  const fetchNodeData = async () => {
    if (isPollingRef.current) {
      return; // Prevent overlapping requests
    }

    isPollingRef.current = true;

    try {
      const promises = NODES.map(async (node) => {
        let health: HealthResponse | null = null;
        let metrics: MetricsResponse | null = null;

        try {
          health = await getHealth(node.url);
        } catch (error) {
          // Node is offline, health remains null
        }

        try {
          metrics = await getMetrics(node.url);
        } catch (error) {
          // Node is offline, metrics remains null
        }

        return { id: node.id, url: node.url, health, metrics };
      });

      const results = await Promise.all(promises);
      setNodeData(results);
      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching cluster data:', error);
    } finally {
      isPollingRef.current = false;
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchNodeData();

    // Set up polling
    pollingRef.current = setInterval(fetchNodeData, POLLING_INTERVAL);

    // Cleanup on unmount
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  return { nodeData, isLoading };
}
