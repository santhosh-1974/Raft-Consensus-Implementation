import { NodeConfig } from "../node/config.js";
import { FileStorage } from "../storage/FileStorage.js";
import { LogEntry, NodeState } from "./types.js";
import { StateMachine } from "../state-machine/StateMachine.js";
import { ElectionTimer } from "./ElectionTimer.js";
import { AppendEntriesRequest, AppendEntriesResponse, RequestVoteRequest, RequestVoteResponse } from "./rpc.js";

export class RaftNode {
    private readonly nodeId: string;
    private readonly port: number;
    private readonly peers: string[];
    private readonly electionTimer: ElectionTimer;

    private heartbeatTimer: NodeJS.Timeout | null = null;
    private state: NodeState = NodeState.FOLLOWER;
    private currentTerm = 0;
    private votedFor: string | null = null;
    private log: LogEntry[] = [];

    constructor(
        config: NodeConfig,
        private readonly storage: FileStorage,
        private readonly stateMachine: StateMachine
    ) {
        this.nodeId = config.nodeId;
        this.port = config.port;
        this.peers = config.peers;

        this.electionTimer = new ElectionTimer(
            1500,
            3000,
            () => {
                if (this.state !== NodeState.LEADER) {
                    void this.startElection();
                }
            }
        );
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
        this.electionTimer.start();
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
    private async startElection(): Promise<void> {
        if (this.state === NodeState.LEADER) {
            return;
        }

        this.electionTimer.stop();

        this.state = NodeState.CANDIDATE;
        this.currentTerm++;
        this.votedFor = this.nodeId;

        await this.persist();

        const electionTerm = this.currentTerm;

        let votes = 1;

        const results = await Promise.all(
            this.peers.map(peer =>
                this.requestVoteFromPeer(peer, electionTerm)
            )
        );

        if (
            this.state !== NodeState.CANDIDATE ||
            this.currentTerm !== electionTerm
        ) {
            return;
        }

        for (const granted of results) {
            if (granted) {
                votes++;
            }
        }

        const majority =
            Math.floor((this.peers.length + 1) / 2) + 1;

        console.log(
            `${this.nodeId} received ${votes}/${majority} votes for term ${electionTerm}`
        );

        if (votes >= majority) {
            this.becomeLeader();
        } else {
            this.electionTimer.reset();
        }
    }
    async handleRequestVote(
        request: RequestVoteRequest
    ): Promise<RequestVoteResponse> {

        if (request.term < this.currentTerm) {
            return {
                term: this.currentTerm,
                voteGranted: false
            };
        }

        if (request.term > this.currentTerm) {
            this.currentTerm = request.term;
            this.state = NodeState.FOLLOWER;
            this.votedFor = null;

            await this.persist();
        }

        const logUpToDate = this.isCandidateLogUpToDate(
            request.lastLogIndex,
            request.lastLogTerm
        );

        const canVote =
            (this.votedFor === null ||
                this.votedFor === request.candidateId) &&
            logUpToDate;

        if (!canVote) {
            return {
                term: this.currentTerm,
                voteGranted: false
            };
        }

        this.votedFor = request.candidateId;
        await this.persist();
        this.electionTimer.reset();

        return {
            term: this.currentTerm,
            voteGranted: true
        };
    }
    private async requestVoteFromPeer(
        peer: string,
        electionTerm: number
    ): Promise<boolean> {
        try {
            const response = await fetch(
                `http://${peer}/internal/request-vote`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        term: electionTerm,
                        candidateId: this.nodeId,
                        lastLogIndex: this.getLastLogIndex(),
                        lastLogTerm: this.getLastLogTerm()
                    })
                }
            );

            if (!response.ok) {
                return false;
            }

            const result = await response.json();

            if (result.term > this.currentTerm) {
                this.currentTerm = result.term;
                this.state = NodeState.FOLLOWER;
                this.votedFor = null;

                await this.persist();
                this.electionTimer.reset();

                return false;
            }

            if (
                this.state !== NodeState.CANDIDATE ||
                this.currentTerm !== electionTerm
            ) {
                return false;
            }
            return result.voteGranted;
        } catch {
            return false;
        }
    }
    private becomeLeader(): void {
        this.state = NodeState.LEADER;
        this.electionTimer.stop();
        this.startHeartbeats();

        console.log(
            `${this.nodeId} became LEADER for term ${this.currentTerm}`
        );
    }
    async handleAppendEntries(
        request: AppendEntriesRequest
    ): Promise<AppendEntriesResponse> {

        if (request.term < this.currentTerm) {
            return {
                term: this.currentTerm,
                success: false
            };
        }

        if (request.term > this.currentTerm) {
            this.currentTerm = request.term;
            this.votedFor = null;
            await this.persist();
        }

        this.state = NodeState.FOLLOWER;
        this.electionTimer.reset();

        return {
            term: this.currentTerm,
            success: true
        };
    }
    private startHeartbeats(): void {
        this.stopHeartbeats();
        this.heartbeatTimer = setInterval(() => {
            void this.sendHeartbeats();
        }, 500);
    }
    private stopHeartbeats(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }
    private async sendHeartbeats(): Promise<void> {
        if (this.state !== NodeState.LEADER) return;
        await Promise.all(
            this.peers.map(peer =>
                this.sendHeartbeat(peer)
            )
        );
    }
    private async sendHeartbeat(peer: string): Promise<void> {
        try {
            const response = await fetch(
                `http://${peer}/internal/append-entries`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        term: this.currentTerm,
                        leaderId: this.nodeId
                    })
                }
            );

            if (!response.ok) {
                return;
            }

            const result = await response.json();

            if (result.term > this.currentTerm) {
                this.currentTerm = result.term;
                this.state = NodeState.FOLLOWER;
                this.votedFor = null;

                await this.persist();

                this.stopHeartbeats();
            }
        } catch {
            // Peer may be unavailable.
        }
    }
    private getLastLogIndex(): number {
        return this.log.length;
    }

    private getLastLogTerm(): number {
        if (this.log.length === 0) return 0;
        return this.log[this.log.length - 1].term;
    }
    private isCandidateLogUpToDate(
        candidateLastIndex: number,
        candidateLastTerm: number
    ): boolean {
        const myLastIndex = this.getLastLogIndex();
        const myLastTerm = this.getLastLogTerm();

        if (candidateLastTerm !== myLastTerm) {
            return candidateLastTerm > myLastTerm;
        }

        return candidateLastIndex >= myLastIndex;
    }

}