import { createApp } from "./app.js";
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

const app = createApp(raftNode, config);

app.listen(config.port, "0.0.0.0", () => {
    console.log(
        `${config.nodeId} started as ${raftNode.getState()}`
    );
});
