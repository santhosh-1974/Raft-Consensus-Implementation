import express, { type Express } from "express";
import cors from "cors";
import { type NodeConfig } from "./node/config.js";
import { RaftNode } from "./raft/RaftNode.js";
import { NodeState } from "./raft/types.js";

export function createApp(
    raftNode: RaftNode,
    config: NodeConfig
): Express {
    const app = express();
    const frontendOrigin = "http://localhost:3000";

    app.use(cors({
        origin: frontendOrigin,
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"]
    }));
    app.use(express.json());

    app.get("/health", (_req, res) => {
        res.json({
            nodeId: raftNode.getNodeId(),
            state: raftNode.getState(),
            term: raftNode.getTerm(),
            leaderId: raftNode.getLeaderId()
        });
    });

    app.get("/metrics", (_req, res) => {
        res.json(raftNode.getMetrics());
    });

    async function forwardToLeader(
        method: "PUT" | "GET" | "DELETE",
        key: string,
        value?: string,
        requestId?: string
    ) {
        const leaderId = raftNode.getLeaderId();

        if (!leaderId) {
            return null;
        }

        const leaderAddress = config.addresses[leaderId];

        if (!leaderAddress) {
            return null;
        }

        const options: RequestInit = {
            method,
            headers: {
                "Content-Type": "application/json"
            }
        };

        if (value !== undefined || requestId !== undefined) {
            options.body = JSON.stringify({ value, requestId });
        }

        const response = await fetch(
            `http://${leaderAddress}/kv/${encodeURIComponent(key)}`,
            options
        );

        return {
            status: response.status,
            body: await response.json()
        };
    }

    app.put("/kv/:key", async (req, res) => {
        const { key } = req.params;
        const { value, requestId } = req.body;

        if (!key || value === undefined) {
            return res.status(400).json({
                success: false,
                error: "key and value are required"
            });
        }

        if (raftNode.getState() !== NodeState.LEADER) {
            const forwarded = await forwardToLeader(
                "PUT",
                key,
                String(value),
                requestId
            );

            if (!forwarded) {
                return res.status(503).json({
                    success: false,
                    leader: null
                });
            }

            return res.status(forwarded.status).json(forwarded.body);
        }

        const result = await raftNode.set(
            key,
            String(value),
            requestId
        );

        return res.status(result.success ? 200 : 503).json(result);
    });

    app.get("/kv/:key", async (req, res) => {
        const { key } = req.params;
        if (!key) {
            return res.status(400).json({
                success: false,
                error: "key is required"
            });
        }

        if (raftNode.getState() !== NodeState.LEADER) {
            const forwarded = await forwardToLeader("GET", key);

            if (!forwarded) {
                return res.status(503).json({
                    success: false,
                    leader: null
                });
            }

            return res.status(forwarded.status).json(forwarded.body);
        }

        const result = await raftNode.get(key);

        return res.status(result.success ? 200 : 503).json(result);
    });

    app.delete("/kv/:key", async (req, res) => {
        const { key } = req.params;
        const { requestId } = req.body ?? {};

        if (!key) {
            return res.status(400).json({
                success: false,
                error: "key is required"
            });
        }

        if (raftNode.getState() !== NodeState.LEADER) {
            const forwarded = await forwardToLeader(
                "DELETE",
                key,
                undefined,
                requestId
            );

            if (!forwarded) {
                return res.status(503).json({
                    success: false,
                    leader: null
                });
            }

            return res.status(forwarded.status).json(forwarded.body);
        }

        const result = await raftNode.delete(key, requestId);

        return res.status(result.success ? 200 : 503).json(result);
    });

    app.post("/internal/request-vote", async (req, res) => {
        const response = await raftNode.handleRequestVote(req.body);

        res.json(response);
    });
    app.post("/internal/append-entries", async (req, res) => {
        const response = await raftNode.handleAppendEntries(req.body);

        res.json(response);
    });

    return app;
}
