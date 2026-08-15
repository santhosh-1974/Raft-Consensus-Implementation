export interface AppendEntriesRequest {
    term: number;
    leaderId: string;
}

export interface AppendEntriesResponse {
    term: number;
    success: boolean;
}

export interface RequestVoteRequest {
    term: number;
    candidateId: string;
}

export interface RequestVoteResponse {
    term: number;
    voteGranted: boolean;
}