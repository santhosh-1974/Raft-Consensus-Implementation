import { LogEntry } from "../raft/types.js";

export interface RaftPersistentState {
    currentTerm: number;
    votedFor: string | null;
    log: LogEntry[];
    commitIndex: number;
    lastApplied: number;
}