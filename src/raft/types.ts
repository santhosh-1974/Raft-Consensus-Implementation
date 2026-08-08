export enum NodeState {
    FOLLOWER = "FOLLOWER",
    CANDIDATE = "CANDIDATE",
    LEADER = "LEADER"
}

export interface LogEntry {
    index: number;
    term: number;
    command: {
        type: string;
        key: string;
        value?: string;
    };
}