import { LogEntry } from "../raft/types.js";

export interface PersistentState {
    currentTerm: number;
    votedFor: string | null;
    log: LogEntry[];
}