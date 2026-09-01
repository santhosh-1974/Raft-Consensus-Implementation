import { NodeConfig } from "../node/config.js";
import { FileStorage } from "../storage/FileStorage.js";
import { LogEntry, NodeState } from "./types.js";
import { StateMachine } from "../state-machine/StateMachine.js";
import { ElectionTimer } from "./ElectionTimer.js";
import { AppendEntriesRequest, AppendEntriesResponse, RequestVoteRequest, RequestVoteResponse } from "./rpc.js";

type RaftNodeConfig = Pick<
    NodeConfig,
    "nodeId" | "port" | "peers"
> & {
    timing?: {
        electionMinTimeoutMs?: number;
        electionMaxTimeoutMs?: number;
        heartbeatIntervalMs?: number;
        rpcTimeoutMs?: number;
        replicationMaxRetries?: number;
        replicationRetryDelayMs?: number;
    };
};

export class RaftNode {
    private readonly nodeId: string;
    private readonly port: number;
    private readonly peers: string[];
    private readonly electionTimer: ElectionTimer;

    private heartbeatTimer: NodeJS.Timeout | null = null;
    private readonly rpcTimeoutMs: number;
    private readonly heartbeatIntervalMs: number;
    private readonly replicationMaxRetries: number;
    private readonly replicationRetryDelayMs: number;
    private state: NodeState = NodeState.FOLLOWER;
    private leaderId: string | null = null;
    private currentTerm = 0;
    private votedFor: string | null = null;
    private log: LogEntry[] = [];
    private nextIndex = new Map<string, number>();
    private matchIndex = new Map<string, number>();
    private replicating = new Map<string, Promise<number>>();
    private commitIndex = 0;
    private lastApplied = 0;
    private electionInProgress = false;
    private writeQueue: Promise<void> = Promise.resolve();
    private metrics = {
        electionsStarted: 0,
        leaderChanges: 0,
        replicationFailures: 0,
        entriesCommitted: 0
    };

    constructor(
        config: RaftNodeConfig,
        private readonly storage: FileStorage,
        private readonly stateMachine: StateMachine
    ) {
        this.nodeId = config.nodeId;
        this.port = config.port;
        this.peers = config.peers;
        this.rpcTimeoutMs = config.timing?.rpcTimeoutMs ?? 1_000;
        this.heartbeatIntervalMs =
            config.timing?.heartbeatIntervalMs ?? 500;
        this.replicationMaxRetries =
            config.timing?.replicationMaxRetries ?? 2;
        this.replicationRetryDelayMs =
            config.timing?.replicationRetryDelayMs ?? 50;

        this.electionTimer = new ElectionTimer(
            config.timing?.electionMinTimeoutMs ?? 1500,
            config.timing?.electionMaxTimeoutMs ?? 3000,
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
        this.rebuildProcessedRequests();
        await this.persist();
        this.electionTimer.start();
    }

    private rebuildProcessedRequests(): void {
        for (const entry of this.log) {
            if (entry.index > this.lastApplied) {
                break;
            }

            if (entry.command.requestId) {
                this.stateMachine.recordProcessedRequest(
                    entry.command.requestId,
                    {
                        success: true,
                        index: entry.index
                    }
                );
            }
        }
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

    getLeaderId(): string | null {
        return this.leaderId;
    }

    public getMetrics() {
        return {
            ...this.metrics,
            currentTerm: this.currentTerm,
            state: this.state,
            commitIndex: this.commitIndex,
            lastApplied: this.lastApplied,
            logLength: this.log.length
        };
    }

    private async startElection(): Promise<void> {
        if (
            this.state === NodeState.LEADER ||
            this.electionInProgress
        ) {
            return;
        }

        this.electionInProgress = true;

        try {
            this.electionTimer.stop();

            this.state = NodeState.CANDIDATE;
            this.currentTerm++;
            this.metrics.electionsStarted++;
            this.votedFor = this.nodeId;

            await this.persist();

            const electionTerm = this.currentTerm;

            let votes = 1;

            const results = await Promise.all(
                this.peers.map(peer =>
                    this.requestVoteFromPeer(
                        peer,
                        electionTerm
                    )
                )
            );

            // Election is no longer relevant.
            // Another election or a higher term may have taken over.
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
        } finally {
            this.electionInProgress = false;
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
        this.metrics.leaderChanges++;
        this.leaderId = this.nodeId;
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
        this.leaderId = request.leaderId;
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
        }, this.heartbeatIntervalMs);
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
    private async confirmLeadership(): Promise<boolean> {
        if (this.state !== NodeState.LEADER) {
            return false;
        }

        const majority =
            Math.floor((this.peers.length + 1) / 2) + 1;

        // The leader itself counts as one.
        let acknowledgements = 1;

        if (acknowledgements >= majority) {
            return true;
        }

        const term = this.currentTerm;

        const results = await Promise.all(
            this.peers.map(async (peer) => {
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
                                term,
                                leaderId: this.nodeId,
                                prevLogIndex: this.log.length,
                                prevLogTerm: this.getLastLogTerm(),
                                entries: [],
                                leaderCommit: this.commitIndex
                            })
                        }
                    );

                    if (!response.ok) {
                        return false;
                    }

                    const result: AppendEntriesResponse =
                        await response.json();

                    if (result.term > this.currentTerm) {
                        this.currentTerm = result.term;
                        this.state = NodeState.FOLLOWER;
                        this.votedFor = null;

                        await this.persist();

                        this.stopHeartbeats();

                        return false;
                    }

                    return (
                        this.state === NodeState.LEADER &&
                        this.currentTerm === term &&
                        result.success
                    );
                } catch {
                    return false;
                }
            })
        );

        for (const success of results) {
            if (success) {
                acknowledgements++;

                if (acknowledgements >= majority) {
                    return true;
                }
            }
        }

        return false;
    }
    async set(key: string, value: string, requestId?: string) {
        if (this.state !== NodeState.LEADER) {
            return {
                success: false,
                leader: this.leaderId
            };
        }

        if (requestId) {
            const previous =
                this.stateMachine.getProcessedRequest(requestId);

            if (previous) {
                return previous;
            }
        }

        let result!: {
            success: boolean;
            index: number;
        };

        const operation = this.writeQueue.then(async () => {
            if (this.state !== NodeState.LEADER) {
                result = {
                    success: false,
                    index: -1
                };
                return;
            }

            const entry: LogEntry = {
                index: this.log.length + 1,
                term: this.currentTerm,
                command: {
                    type: "SET",
                    key,
                    value,
                    requestId
                }
            };

            this.log.push(entry);

            await this.persist();

            const replicated = await this.replicateEntry(entry);

            result = {
                success: replicated,
                index: entry.index
            };

        });

        this.writeQueue = operation.catch(() => { });

        await operation;

        return result;
    }
    async get(key: string) {
        if (this.state !== NodeState.LEADER) {
            return {
                success: false,
                leader: this.leaderId,
                value: null
            };
        }

        const leadershipConfirmed =
            await this.confirmLeadership();

        if (!leadershipConfirmed) {
            return {
                success: false,
                leader: this.nodeId,
                value: null,
                error: "leader could not confirm majority"
            };
        }

        const value = await this.stateMachine.get(key);

        return {
            success: true,
            leader: this.nodeId,
            value
        };
    }
    async delete(key: string, requestId?: string) {
        if (this.state !== NodeState.LEADER) {
            return {
                success: false,
                leader: this.leaderId
            };
        }

        if (requestId) {
            const previous =
                this.stateMachine.getProcessedRequest(requestId);

            if (previous) {
                return previous;
            }
        }

        let result!: {
            success: boolean;
            index: number;
        };

        const operation = this.writeQueue.then(async () => {
            if (this.state !== NodeState.LEADER) {
                result = {
                    success: false,
                    index: -1
                };
                return;
            }

            const entry: LogEntry = {
                index: this.log.length + 1,
                term: this.currentTerm,
                command: {
                    type: "DELETE",
                    key,
                    requestId
                }
            };

            this.log.push(entry);

            await this.persist();

            const replicated = await this.replicateEntry(entry);

            result = {
                success: replicated,
                index: entry.index
            };

        });

        this.writeQueue = operation.catch(() => { });

        await operation;

        return result;
    }
    private async replicateEntry(entry: LogEntry): Promise<boolean> {
        const majority =
            Math.floor((this.peers.length + 1) / 2) + 1;

        const replicationPromises = this.peers.map(peer =>
            this.replicateToPeer(peer)
        );

        let replicatedCount = 1;

        if (replicatedCount >= majority) {
            await this.updateCommitIndex();
            return this.commitIndex >= entry.index;
        }

        await new Promise<void>((resolve) => {
            let remaining = replicationPromises.length;
            let resolved = false;

            for (const promise of replicationPromises) {
                promise.then((replicatedIndex) => {
                    if (resolved) {
                        return;
                    }

                    if (replicatedIndex >= entry.index) {
                        replicatedCount++;

                        if (replicatedCount >= majority) {
                            resolved = true;
                            resolve();
                            return;
                        }
                    }

                    remaining--;

                    if (remaining === 0) {
                        resolved = true;
                        resolve();
                    }
                });
            }
        });

        if (replicatedCount < majority) {
            for (
                let retry = 0;
                retry <= this.replicationMaxRetries;
                retry++
            ) {
                await this.sleep(this.replicationRetryDelayMs);
                await this.updateCommitIndex();

                if (this.commitIndex >= entry.index) {
                    return true;
                }
            }

            return false;
        }

        await this.updateCommitIndex();

        // Notify followers of the newly advanced commit index.
        await Promise.all(
            this.peers.map(peer =>
                this.replicateToPeerInternal(peer)
            )
        );

        return this.commitIndex >= entry.index;
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

            if (entry.command.requestId) {
                this.stateMachine.recordProcessedRequest(
                    entry.command.requestId,
                    {
                        success: true,
                        index: entry.index
                    }
                );
            }
        }

        await this.persist();
    }

    private replicateToPeer(peer: string): Promise<number> {
        const inFlight = this.replicating.get(peer);

        if (inFlight) {
            return inFlight;
        }

        const replication =
            this.replicateToPeerInternal(peer);

        this.replicating.set(peer, replication);

        void replication.finally(() => {
            if (this.replicating.get(peer) === replication) {
                this.replicating.delete(peer);
            }
        });

        return replication;
    }
    private async sleep(ms: number): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, ms));
    }
    private async replicateToPeerInternal(
        peer: string
    ): Promise<number> {
        const maxEntriesPerAppend = 64;

        try {
            while (this.state === NodeState.LEADER) {
                const next =
                    this.nextIndex.get(peer) ?? 1;

                const prevLogIndex = next - 1;

                const prevLogTerm =
                    prevLogIndex === 0
                        ? 0
                        : this.log[prevLogIndex - 1]?.term;

                const entries = this.log.slice(
                    next - 1,
                    next - 1 + maxEntriesPerAppend
                );

                const replicationTerm =
                    this.currentTerm;

                try {
                    let response: Response | undefined;

                    for (
                        let attempt = 0;
                        attempt <= this.replicationMaxRetries;
                        attempt++
                    ) {
                        try {
                            response = await fetch(
                                `http://${peer}/internal/append-entries`,
                                {
                                    method: "POST",
                                    signal: AbortSignal.timeout(
                                        this.rpcTimeoutMs
                                    ),
                                    headers: {
                                        "Content-Type": "application/json"
                                    },
                                    body: JSON.stringify({
                                        term: replicationTerm,
                                        leaderId: this.nodeId,
                                        prevLogIndex,
                                        prevLogTerm,
                                        entries,
                                        leaderCommit: this.commitIndex
                                    })
                                }
                            );

                            if (response.ok) {
                                break;
                            }
                        } catch {
                            if (attempt === this.replicationMaxRetries) {
                                this.metrics.replicationFailures++;
                                return -1;
                            }

                            await this.sleep(
                                this.replicationRetryDelayMs
                            );
                            continue;
                        }

                        if (attempt === this.replicationMaxRetries) {
                            this.metrics.replicationFailures++;
                            return -1;
                        }

                        await this.sleep(this.replicationRetryDelayMs);
                    }

                    if (!response || !response.ok) {
                        this.metrics.replicationFailures++;
                        return -1;
                    }

                    const result: AppendEntriesResponse =
                        await response.json();

                    /*
                     * Follower has a newer term.
                     */
                    if (result.term > this.currentTerm) {
                        this.metrics.replicationFailures++;
                        this.currentTerm = result.term;
                        this.state = NodeState.FOLLOWER;
                        this.votedFor = null;

                        await this.persist();
                        this.stopHeartbeats();

                        return -1;
                    }

                    /*
                     * Response belongs to an old term.
                     */
                    if (
                        this.state !== NodeState.LEADER ||
                        this.currentTerm !== replicationTerm
                    ) {
                        return -1;
                    }

                    /*
                     * Replication succeeded.
                     */
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

                        return lastSentIndex;
                    }

                    /*
                     * Log mismatch.
                     *
                     * Move nextIndex backwards and retry.
                     */
                    this.nextIndex.set(
                        peer,
                        Math.max(
                            1,
                            next - maxEntriesPerAppend
                        )
                    );
                    this.metrics.replicationFailures++;

                } catch {
                    /*
                     * Peer unavailable / timeout.
                     */
                    this.metrics.replicationFailures++;
                    return -1;
                }
            }

            return -1;
        } finally {
            // No cleanup required here.
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
        this.metrics.entriesCommitted +=
            majorityIndex - this.commitIndex;
        this.commitIndex = majorityIndex;
        await this.applyCommittedEntries();
    }
    async shutdown(): Promise<void> {
        this.electionTimer.stop();
        this.stopHeartbeats();

        this.state = NodeState.FOLLOWER;

        await this.persist();
    }
}
