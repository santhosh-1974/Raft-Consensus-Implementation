import { describe, expect, it } from "vitest";
import { RaftNode } from "../src/raft/RaftNode.js";
import { NodeState } from "../src/raft/types.js";

const mockStorage = {
    save: async () => { },
    load: async () => null
};

const mockStateMachine = {
    initialize: async () => { }
};

describe("Raft election", () => {

    it("should start as follower", () => {
        const node = new RaftNode(
            {
                nodeId: "node1",
                port: 5001,
                peers: ["localhost:5002", "localhost:5003"]
            },
            mockStorage as any,
            mockStateMachine as any
        );

        expect(node.getState()).toBe(NodeState.FOLLOWER);
        expect(node.getTerm()).toBe(0);
        expect(node.getNodeId()).toBe("node1");
    });

    it("should not vote for two different candidates in the same term", async () => {
        const node = new RaftNode(
            {
                nodeId: "node1",
                port: 5001,
                peers: []
            },
            mockStorage as any,
            mockStateMachine as any
        );

        const firstVote = await node.handleRequestVote({
            term: 1,
            candidateId: "node2",
            lastLogIndex: 0,
            lastLogTerm: 0
        });

        const secondVote = await node.handleRequestVote({
            term: 1,
            candidateId: "node3",
            lastLogIndex: 0,
            lastLogTerm: 0
        });

        expect(firstVote.voteGranted).toBe(true);
        expect(secondVote.voteGranted).toBe(false);
    });
    it("should update its term when receiving a higher term", async () => {
        const node = new RaftNode(
            {
                nodeId: "node1",
                port: 5001,
                peers: []
            },
            mockStorage as any,
            mockStateMachine as any
        );

        const response = await node.handleRequestVote({
            term: 5,
            candidateId: "node2",
            lastLogIndex: 0,
            lastLogTerm: 0
        });

        expect(response.term).toBe(5);
        expect(response.voteGranted).toBe(true);
        expect(node.getTerm()).toBe(5);
        expect(node.getState()).toBe(NodeState.FOLLOWER);
    });
    it("should reject a candidate with an outdated log", async () => {
        const storage = {
            save: async () => { },
            load: async () => ({
                currentTerm: 1,
                votedFor: null,
                log: [
                    {
                        index: 1,
                        term: 1,
                        command: {
                            type: "SET" as const,
                            key: "x",
                            value: "100"
                        }
                    }
                ],
                commitIndex: 0,
                lastApplied: 0
            })
        };

        const node = new RaftNode(
            {
                nodeId: "node1",
                port: 5001,
                peers: []
            },
            storage as any,
            mockStateMachine as any
        );

        await node.initialize();

        const response = await node.handleRequestVote({
            term: 1,
            candidateId: "node2",
            lastLogIndex: 0,
            lastLogTerm: 0
        });

        expect(response.voteGranted).toBe(false);
    });
    it("should vote for a candidate with a newer log", async () => {
        const storage = {
            save: async () => { },
            load: async () => ({
                currentTerm: 1,
                votedFor: null,
                log: [
                    {
                        index: 1,
                        term: 1,
                        command: {
                            type: "SET" as const,
                            key: "x",
                            value: "100"
                        }
                    }
                ],
                commitIndex: 0,
                lastApplied: 0
            })
        };

        const node = new RaftNode(
            {
                nodeId: "node1",
                port: 5001,
                peers: []
            },
            storage as any,
            mockStateMachine as any
        );

        await node.initialize();

        const response = await node.handleRequestVote({
            term: 2,
            candidateId: "node2",
            lastLogIndex: 2,
            lastLogTerm: 2
        });

        expect(response.voteGranted).toBe(true);
        expect(response.term).toBe(2);
    });
    it("should not become leader without a majority", async () => {
        const storage = {
            save: async () => { },
            load: async () => null
        };

        const node = new RaftNode(
            {
                nodeId: "node1",
                port: 5001,
                peers: ["localhost:5002", "localhost:5003"]
            },
            storage as any,
            mockStateMachine as any
        );

        const response1 = await node.handleRequestVote({
            term: 1,
            candidateId: "node2",
            lastLogIndex: 0,
            lastLogTerm: 0
        });

        const response2 = await node.handleRequestVote({
            term: 1,
            candidateId: "node3",
            lastLogIndex: 0,
            lastLogTerm: 0
        });

        expect(response1.voteGranted).toBe(true);
        expect(response2.voteGranted).toBe(false);
    });
});