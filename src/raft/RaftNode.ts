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
    private readonly rpcTimeoutMs = 1_000;
    private state: NodeState = NodeState.FOLLOWER;
    private currentTerm = 0;
    private votedFor: string | null = null;
    private log: LogEntry[] = [];
    private nextIndex = new Map<string, number>();
    private matchIndex = new Map<string, number>();
    private commitIndex = 0;
    private lastApplied = 0;

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
            this.commitIndex = savedState.commitIndex ?? 0;
            this.lastApplied = savedState.lastApplied ?? 0;
        }
        await this.stateMachine.initialize();
        await this.persist();
        this.electionTimer.start();
    }

    private async persist(): Promise<void> {
        await this.storage.save({
            currentTerm: this.currentTerm,
            votedFor: this.votedFor,
            log: this.log,
            commitIndex: this.commitIndex,
            lastApplied: this.lastApplied
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
                    signal: AbortSignal.timeout(this.rpcTimeoutMs),
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
        if (this.state === NodeState.LEADER) {
            return;
        }
        this.state = NodeState.LEADER;
        this.electionTimer.stop();
        for (const peer of this.peers) {
            this.nextIndex.set(
                peer,
                this.log.length + 1
            );
            this.matchIndex.set(
                peer,
                0
            );
        }
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

        // Check previous log entry
        if (request.prevLogIndex > 0) {
            const previousEntry =
                this.log[request.prevLogIndex - 1];

            if (
                !previousEntry ||
                previousEntry.term !== request.prevLogTerm
            ) {
                return {
                    term: this.currentTerm,
                    success: false
                };
            }
        }

        // Append new entries
        for (const entry of request.entries) {
            const existingEntry = this.log[entry.index - 1];

            if (
                existingEntry &&
                existingEntry.term !== entry.term
            ) {
                this.log.splice(entry.index - 1);
            }

            if (!this.log[entry.index - 1]) {
                this.log.push(entry);
            }
        }

        await this.persist();

        // Update commit index
        if (request.leaderCommit > this.commitIndex) {
            this.commitIndex = Math.min(
                request.leaderCommit,
                this.log.length
            );

            await this.applyCommittedEntries();
        }

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
        if (this.state !== NodeState.LEADER) {
            return;
        }
        await Promise.all(
            this.peers.map(peer =>
                this.replicateToPeer(peer)
            )
        );
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
    async set(key: string, value: string) {
        if (this.state !== NodeState.LEADER) {
            return {
                success: false,
                leader: null
            };
        }

        const entry: LogEntry = {
            index: this.log.length + 1,
            term: this.currentTerm,
            command: {
                type: "SET",
                key,
                value
            }
        };

        this.log.push(entry);
        await this.persist();
        const replicated = await this.replicateEntry(entry);

        return {
            success: replicated,
            index: entry.index
        };
    }
    async get(key: string) {
        if (this.state !== NodeState.LEADER) {
            return {
                success: false,
                leader: null,
                value: null
            };
        }

        const value = await this.stateMachine.get(key);

        return {
            success: true,
            leader: this.nodeId,
            value
        };
    }
    private async replicateEntry(entry: LogEntry): Promise<boolean> {
        await Promise.all(
            this.peers.map(peer =>
                this.replicateToPeer(peer)
            )
        );

        await this.updateCommitIndex();

        return this.commitIndex >= entry.index;
    }
    private async sendLogEntry(peer: string): Promise<boolean> {
        const next = this.nextIndex.get(peer) ?? 1;
        const prevLogIndex = next - 1;
        const prevLogTerm =
            prevLogIndex === 0
                ? 0
                : this.log[prevLogIndex - 1]?.term;

        const entries = this.log.slice(next - 1);

        try {
            const response = await fetch(
                `http://${peer}/internal/append-entries`,
                {
                    method: "POST",
                    signal: AbortSignal.timeout(this.rpcTimeoutMs),
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        term: this.currentTerm,
                        leaderId: this.nodeId,
                        prevLogIndex,
                        prevLogTerm,
                        entries,
                        leaderCommit: this.commitIndex
                    })
                }
            );

            if (!response.ok) {
                return false;
            }

            const result: AppendEntriesResponse =
                await response.json();
            // Follower knows about a newer term
            if (result.term > this.currentTerm) {
                this.currentTerm = result.term;
                this.state = NodeState.FOLLOWER;
                this.votedFor = null;
                await this.persist();
                this.stopHeartbeats();
                return false;
            }
            if (result.success) {
                this.matchIndex.set(
                    peer,
                    this.log.length
                );
                this.nextIndex.set(
                    peer,
                    this.log.length + 1
                );
                return true;
            }
            // Follower rejected because its log doesn't match.
            const newNextIndex = Math.max(
                1,
                next - 1
            );
            this.nextIndex.set(
                peer,
                newNextIndex
            );
            return false;
        } catch {
            return false;
        }
    }
    private async applyCommittedEntries(): Promise<void> {
        while (this.lastApplied < this.commitIndex) {
            this.lastApplied++;

            const entry = this.log[this.lastApplied - 1];

            if (entry.command.type === "SET") {
                await this.stateMachine.set(
                    entry.command.key,
                    entry.command.value!
                );
            }

            if (entry.command.type === "DELETE") {
                await this.stateMachine.delete(
                    entry.command.key
                );
            }
        }

        await this.persist();
    }
    private async replicateToPeer(peer: string): Promise<void> {
        const next = this.nextIndex.get(peer) ?? 1;
        const prevLogIndex = next - 1;
        const prevLogTerm =
            prevLogIndex === 0
                ? 0
                : this.log[prevLogIndex - 1]?.term;

        const entries = this.log.slice(next - 1);
        try {
            const response = await fetch(
                `http://${peer}/internal/append-entries`,
                {
                    method: "POST",
                    signal: AbortSignal.timeout(this.rpcTimeoutMs),
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        term: this.currentTerm,
                        leaderId: this.nodeId,
                        prevLogIndex,
                        prevLogTerm,
                        entries,
                        leaderCommit: this.commitIndex
                    })
                }
            );
            if (!response.ok) {
                return;
            }
            const result: AppendEntriesResponse =
                await response.json();
            if (result.term > this.currentTerm) {
                this.currentTerm = result.term;
                this.state = NodeState.FOLLOWER;
                this.votedFor = null;

                await this.persist();
                this.stopHeartbeats();

                return;
            }
            if (result.success) {
                const lastSentIndex =
                    prevLogIndex + entries.length;

                this.matchIndex.set(
                    peer,
                    lastSentIndex
                );

                this.nextIndex.set(
                    peer,
                    lastSentIndex + 1
                );

                await this.updateCommitIndex();

                return;
            }
            // Follower rejected the previous log position.
            this.nextIndex.set(
                peer,
                Math.max(1, next - 1)
            );
        } catch {
            // Peer unavailable.
        }
    }
    private async updateCommitIndex(): Promise<void> {
        const indexes = [
            this.log.length,
            ...this.matchIndex.values()
        ].sort((a, b) => b - a);

        const majorityIndex =
            indexes[Math.floor(indexes.length / 2)];

        if (majorityIndex <= this.commitIndex) {
            return;
        }
        const entry = this.log[majorityIndex - 1];
        if (!entry) {
            return;
        }
        // Raft only directly commits an entry from
        // the current term using the majority rule.
        if (entry.term !== this.currentTerm) {
            return;
        }
        this.commitIndex = majorityIndex;
        await this.applyCommittedEntries();
    }
}
