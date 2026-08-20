import express from "express";
import { loadConfig } from "./node/config.js";
import { RaftNode } from "./raft/RaftNode.js";
import { FileStorage } from "./storage/FileStorage.js";
import { DataStorage } from "./state-machine/DataStorage.js";
import { StateMachine } from "./state-machine/StateMachine.js";

const config = loadConfig();

const raftStorage = new FileStorage("/app/data");
const dataStorage = new DataStorage("/app/data");
const stateMachine = new StateMachine(dataStorage);

const raftNode = new RaftNode(
    config,
    raftStorage,
    stateMachine
);

await raftNode.initialize();
process.on("SIGTERM", async () => {
    console.log("Received SIGTERM, shutting down...");

    await raftNode.shutdown();

    process.exit(0);
});

process.on("SIGINT", async () => {
    console.log("Received SIGINT, shutting down...");

    await raftNode.shutdown();

    process.exit(0);
});
const app = express();

app.use(express.json());
app.get("/health", (_req, res) => {
    res.json({
        nodeId: raftNode.getNodeId(),
        state: raftNode.getState(),
        term: raftNode.getTerm()
    });
});
app.post("/kv/set", async (req, res) => {
    const { key, value } = req.body;

    if (!key || value === undefined) {
        return res.status(400).json({
            error: "key and value are required"
        });
    }
    const result = await raftNode.set(key, String(value));
    res.json(result);
});
app.get("/kv/:key", async (req, res) => {
    const result = await raftNode.get(req.params.key);
    if (!result.success) {
        return res.status(307).json(result);
    }
    res.json(result);
});
app.post("/internal/request-vote", async (req, res) => {
    const response = await raftNode.handleRequestVote(req.body);

    res.json(response);
});
app.post("/internal/append-entries", async (req, res) => {
    const response = await raftNode.handleAppendEntries(req.body);

    res.json(response);
});

app.listen(config.port, "0.0.0.0", () => {
    console.log(
        `${config.nodeId} started as ${raftNode.getState()}`
    );
});
