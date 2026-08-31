import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { type NodeConfig } from "../src/node/config.js";
import { RaftNode } from "../src/raft/RaftNode.js";
import { NodeState } from "../src/raft/types.js";

const config: NodeConfig = {
    nodeId: "node1",
    port: 5001,
    peers: [],
    addresses: { node1: "node1:5001", node2: "node2:5002" }
};

function createTestNode(): RaftNode {
    const values = new Map<string, string>();
    const processedRequests = new Map<
        string,
        { success: boolean; index: number }
    >();
    const storage = { save: async () => { }, load: async () => null };
    const stateMachine = {
        initialize: async () => { },
        set: async (key: string, value: string) => { values.set(key, value); },
        get: async (key: string) => values.get(key) ?? null,
        delete: async (key: string) => { values.delete(key); },
        getProcessedRequest: (requestId: string) =>
            processedRequests.get(requestId),
        recordProcessedRequest: (
            requestId: string,
            result: { success: boolean; index: number }
        ) => { processedRequests.set(requestId, result); },
        getAll: async () => Object.fromEntries(values)
    };
    const node = new RaftNode(config, storage as any, stateMachine as any);
    (node as any).state = NodeState.LEADER;
    return node;
}

function makeFollower() {
    const node = createTestNode();
    (node as any).state = NodeState.FOLLOWER;
    (node as any).leaderId = "node2";
    return node;
}

describe("KV HTTP API", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("should store a value with PUT", async () => {
        const response = await request(createApp(createTestNode(), config))
            .put("/kv/name").send({ value: "Santhosh" });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, index: 1 });
    });

    it("should return a stored value with GET", async () => {
        const app = createApp(createTestNode(), config);
        await request(app).put("/kv/name").send({ value: "Santhosh" });
        const response = await request(app).get("/kv/name");

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ success: true, value: "Santhosh" });
    });

    it("should delete a value with DELETE", async () => {
        const app = createApp(createTestNode(), config);
        await request(app).put("/kv/name").send({ value: "Santhosh" });
        const response = await request(app).delete("/kv/name");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, index: 2 });
    });

    it("should reject PUT when value is missing", async () => {
        const response = await request(createApp(createTestNode(), config))
            .put("/kv/name").send({});

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
            success: false,
            error: "key and value are required"
        });
    });

    it("should return unavailable when a follower has no known leader", async () => {
        const node = createTestNode();
        (node as any).state = NodeState.FOLLOWER;
        const response = await request(createApp(node, config)).get("/kv/name");

        expect(response.status).toBe(503);
        expect(response.body).toEqual({ success: false, leader: null });
    });

    it("should report node health", async () => {
        const response = await request(createApp(createTestNode(), config)).get("/health");

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            nodeId: "node1", state: NodeState.LEADER, leaderId: null
        });
    });

    it("should forward PUT from follower to leader", async () => {
        const fetchMock = vi.fn(async () => ({
            status: 200,
            json: async () => ({ success: true, index: 1 })
        }));
        vi.stubGlobal("fetch", fetchMock);

        const response = await request(createApp(makeFollower(), config))
            .put("/kv/name").send({ value: "Santhosh" });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, index: 1 });
        expect(fetchMock).toHaveBeenCalledWith(
            "http://node2:5002/kv/name",
            expect.objectContaining({ method: "PUT" })
        );
    });

    it("should forward GET from follower to leader", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => ({
            status: 200,
            json: async () => ({ success: true, value: "Santhosh" })
        })));

        const response = await request(createApp(makeFollower(), config)).get("/kv/name");

        expect(response.status).toBe(200);
        expect(response.body.value).toBe("Santhosh");
    });

    it("should forward DELETE from follower to leader", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => ({
            status: 200,
            json: async () => ({ success: true, index: 2 })
        })));

        const response = await request(createApp(makeFollower(), config)).delete("/kv/name");

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
    });

    it("should preserve a leader error status when forwarding", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => ({
            status: 503,
            json: async () => ({ success: false, leader: null })
        })));

        const response = await request(createApp(makeFollower(), config)).get("/kv/name");

        expect(response.status).toBe(503);
        expect(response.body).toEqual({ success: false, leader: null });
    });

    it("should pass request-vote RPCs to the Raft node", async () => {
        const node = createTestNode();
        const handleRequestVote = vi.spyOn(node, "handleRequestVote")
            .mockResolvedValue({ term: 3, voteGranted: true });

        const response = await request(createApp(node, config))
            .post("/internal/request-vote")
            .send({ term: 3, candidateId: "node2", lastLogIndex: 0, lastLogTerm: 0 });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ term: 3, voteGranted: true });
        expect(handleRequestVote).toHaveBeenCalled();
    });

    it("should pass append-entries RPCs to the Raft node", async () => {
        const node = createTestNode();
        const handleAppendEntries = vi.spyOn(node, "handleAppendEntries")
            .mockResolvedValue({ term: 3, success: true });

        const response = await request(createApp(node, config))
            .post("/internal/append-entries")
            .send({
                term: 3, leaderId: "node2", prevLogIndex: 0,
                prevLogTerm: 0, entries: [], leaderCommit: 0
            });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ term: 3, success: true });
        expect(handleAppendEntries).toHaveBeenCalled();
    });

    it("should make duplicate PUT requests idempotent", async () => {
        const raftNode = createTestNode();
        const app = createApp(raftNode, config);

        const first = await request(app)
            .put("/kv/idempotent")
            .send({
                value: "hello",
                requestId: "req-123"
            });

        const second = await request(app)
            .put("/kv/idempotent")
            .send({
                value: "hello",
                requestId: "req-123"
            });

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);

        expect(first.body.success).toBe(true);
        expect(second.body.success).toBe(true);

        expect(second.body.index).toBe(first.body.index);
    });

    it("should process different request IDs separately", async () => {
        const raftNode = createTestNode();
        const app = createApp(raftNode, config);

        const first = await request(app)
            .put("/kv/idempotent")
            .send({
                value: "hello",
                requestId: "req-1"
            });

        const second = await request(app)
            .put("/kv/idempotent")
            .send({
                value: "world",
                requestId: "req-2"
            });

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);

        expect(first.body.index).not.toBe(
            second.body.index
        );
    });
    it("should ignore a retry with the same request ID even if the value differs", async () => {
        const raftNode = createTestNode();
        const app = createApp(raftNode, config);

        const first = await request(app)
            .put("/kv/idempotent")
            .send({
                value: "hello",
                requestId: "req-456"
            });

        const second = await request(app)
            .put("/kv/idempotent")
            .send({
                value: "different",
                requestId: "req-456"
            });

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);

        expect(second.body.index).toBe(
            first.body.index
        );

        const value = await request(app)
            .get("/kv/idempotent");

        expect(value.body.value).toBe("hello");
    });

    it("should handle concurrent duplicate PUT requests idempotently", async () => {
        const raftNode = createTestNode();
        const app = createApp(raftNode, config);

        const requests = Array.from({ length: 10 }, () =>
            request(app)
                .put("/kv/concurrent-idempotent")
                .send({
                    value: "hello",
                    requestId: "concurrent-req-1"
                })
        );

        const responses = await Promise.all(requests);

        for (const response of responses) {
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        }

        const indexes = responses.map(
            response => response.body.index
        );

        expect(new Set(indexes).size).toBe(1);
    });
    it("should make duplicate DELETE requests idempotent", async () => {
        const raftNode = createTestNode();
        const app = createApp(raftNode, config);

        const put = await request(app)
            .put("/kv/delete-idempotent")
            .send({
                value: "hello",
                requestId: "put-req"
            });

        expect(put.status).toBe(200);

        const first = await request(app)
            .delete("/kv/delete-idempotent")
            .send({
                requestId: "delete-req"
            });

        const second = await request(app)
            .delete("/kv/delete-idempotent")
            .send({
                requestId: "delete-req"
            });

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);

        expect(first.body.success).toBe(true);
        expect(second.body.success).toBe(true);

        expect(second.body.index).toBe(first.body.index);
    });
    it("should handle concurrent duplicate DELETE requests idempotently", async () => {
        const raftNode = createTestNode();
        const app = createApp(raftNode, config);

        await request(app)
            .put("/kv/concurrent-delete")
            .send({
                value: "hello",
                requestId: "put-delete-test"
            });

        const requests = Array.from({ length: 10 }, () =>
            request(app)
                .delete("/kv/concurrent-delete")
                .send({
                    requestId: "concurrent-delete-req"
                })
        );

        const responses = await Promise.all(requests);

        for (const response of responses) {
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        }

        const indexes = responses.map(
            response => response.body.index
        );

        expect(new Set(indexes).size).toBe(1);
    });
});
