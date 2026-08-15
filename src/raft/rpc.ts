export interface RequestVoteRequest {
    term: number;
    candidateId: string;
}

export interface RequestVoteResponse {
    term: number;
    voteGranted: boolean;
}