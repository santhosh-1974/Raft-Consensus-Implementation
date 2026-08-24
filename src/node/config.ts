export interface NodeConfig {
    nodeId: string;
    port: number;
    peers: string[];
    addresses: Record<string, string>;
}

export function loadConfig(): NodeConfig {
    const nodeId = process.env.NODE_ID;
    const port = Number(process.env.PORT);
    const peers = process.env.PEERS?.split(",") ?? [];

    if (!nodeId) {
        throw new Error("NODE_ID is required");
    }
    if (!port) {
        throw new Error("PORT is required");
    }

    const addresses: Record<string, string> = {
        [nodeId]: `${nodeId}:${port}`
    };

    for (const peer of peers) {
        const [peerId, peerPort] = peer.split(":");

        if (!peerId || !peerPort) {
            throw new Error(`Invalid peer configuration: ${peer}`);
        }

        addresses[peerId] = peer;
    }

    return {
        nodeId,
        port,
        peers,
        addresses
    };
}
