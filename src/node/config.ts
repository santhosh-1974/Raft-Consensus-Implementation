export interface NodeConfig {
    nodeId: string;
    port: number;
    peers: string[];
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
    return {
        nodeId,
        port,
        peers
    };
}