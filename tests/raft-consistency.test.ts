import { afterEach, describe, expect, it, vi } from "vitest";

import { RaftNode } from "../src/raft/RaftNode.js";
import { NodeState } from "../src/raft/types.js";

const nodeIds = ["node1", "node2", "node3"];

describe("Raft cluster consistency", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("should replicate concurrent writes across all nodes", async () => {
        const nodes = new Map<string, RaftNode>();
        const values = new Map<string, Map<string, string>>();
        const storage = { save: async () => {}, load: async () => null };

        for (const nodeId of nodeIds) {
            const nodeValues = new Map<string, string>();
            values.set(nodeId, nodeValues);

            nodes.set(nodeId, new RaftNode(
                {
                    nodeId,
                    port: 0,
                    peers: nodeIds.filter(peer => peer !== nodeId)
                },
                storage as any,
                {
                    initialize: async () => {},
                    set: async (key: string, value: string) => {
                        nodeValues.set(key, value);
                    },
                    get: async (key: string) => nodeValues.get(key) ?? null,
                    delete: async (key: string) => { nodeValues.delete(key); }
                } as any
            ));
        }

        const leader = nodes.get("node1")!;
        (leader as any).state = NodeState.LEADER;
        (leader as any).currentTerm = 1;

        for (const peer of ["node2", "node3"]) {
            (leader as any).nextIndex.set(peer, 1);
            (leader as any).matchIndex.set(peer, 0);
        }

        vi.stubGlobal("fetch", vi.fn(async (url, options) => {
            const node = nodes.get(new URL(String(url)).hostname);
            if (!node) return { ok: false };

            const request = JSON.parse(String(options?.body));
            const result = await node.handleAppendEntries(request);

            return { ok: true, json: async () => result };
        }));

        try {
            const writes = Array.from({ length: 10 }, (_, i) => ({
                key: `consistency-key-${i}`,
                value: `value-${i}`
            }));

            const results = await Promise.all(
                writes.map(({ key, value }) => leader.set(key, value))
            );

            expect(results.every(result => result.success)).toBe(true);

            // The final heartbeat carries the final commit index to followers.
            await (leader as any).sendHeartbeats();

            for (const { key, value } of writes) {
                for (const nodeId of nodeIds) {
                    expect(values.get(nodeId)?.get(key)).toBe(value);
                }
            }
        } finally {
            for (const node of nodes.values()) {
                (node as any).stopHeartbeats();
            }
        }
    });
});
