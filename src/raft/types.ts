export enum NodeState {
    FOLLOWER = "FOLLOWER",
    CANDIDATE = "CANDIDATE",
    LEADER = "LEADER"
}

export interface LogEntry {
    index: number;
    term: number;
    command: {
        type: "SET" | "DELETE";
        key: string;
        value?: string;
        requestId?: string;
    };
}