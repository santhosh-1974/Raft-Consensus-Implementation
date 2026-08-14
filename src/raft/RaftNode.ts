import { NodeConfig } from "../node/config.js";
import { FileStorage } from "../storage/FileStorage.js";
import { LogEntry, NodeState } from "./types.js";
import { StateMachine } from "../state-machine/StateMachine.js";

export class RaftNode {
    private readonly nodeId: string;
    private readonly port: number;
    private readonly peers: string[];

    private state: NodeState = NodeState.FOLLOWER;
    private currentTerm = 0;
    private votedFor: string | null = null;
    private log: LogEntry[] = [];

    constructor(
        config: NodeConfig,
        private readonly storage: FileStorage,
        private readonly stateMachine: StateMachine
    ){
        this.nodeId = config.nodeId;
        this.port = config.port;
        this.peers = config.peers;
    }

    async initialize(): Promise<void> {
        const savedState = await this.storage.load();
        if (savedState) {
            this.currentTerm = savedState.currentTerm;
            this.votedFor = savedState.votedFor;
            this.log = savedState.log;
        }
        await this.stateMachine.initialize();
        await this.persist();
    }

    private async persist(): Promise<void> {
        await this.storage.save({
            currentTerm: this.currentTerm,
            votedFor: this.votedFor,
            log: this.log
        });
    }

    getState(): NodeState {
        return this.state;
    }

    getTerm(): number {
        return this.currentTerm;
    }

    getNodeId(): string {
        return this.nodeId;
    }
}