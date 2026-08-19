import { afterEach, describe, expect, it, vi } from "vitest";
import { RaftNode } from "../src/raft/RaftNode.js";
import { NodeState } from "../src/raft/types.js";

const mockStorage = {
    save: async () => { },
    load: async () => null
};

const mockStateMachine = {
    initialize: async () => { }
};

describe("Raft cluster integration", () => {

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("should elect exactly one leader", async () => {
        const nodes = new Map<string, RaftNode>();

        for (const nodeId of ["node1", "node2", "node3"]) {
            nodes.set(
                nodeId,
                new RaftNode(
                    {
                        nodeId,
                        port: 0,
                        peers: ["node1", "node2", "node3"].filter(
                            peer => peer !== nodeId
                        )
                    },
                    mockStorage as any,
                    mockStateMachine as any
                )
            );
        }

        vi.stubGlobal("fetch", vi.fn(async (url, options) => {
            const nodeId = new URL(String(url)).hostname;
            const node = nodes.get(nodeId);

            if (!node) {
                return { ok: false };
            }

            const request = JSON.parse(String(options?.body));
            const result = await node.handleRequestVote(request);

            return {
                ok: true,
                json: async () => result
            };
        }));

        try {
            await (nodes.get("node1") as any).startElection();

            const leaders = [...nodes.values()].filter(
                node => node.getState() === NodeState.LEADER
            );

            expect(leaders).toHaveLength(1);
            expect(leaders[0]?.getNodeId()).toBe("node1");
            expect(leaders[0]?.getTerm()).toBe(1);
        } finally {
            for (const node of nodes.values()) {
                (node as any).stopHeartbeats();
            }
        }
    });
    it("should not become leader without a majority", async () => {
        const nodes = new Map<string, RaftNode>();

        for (const nodeId of ["node1", "node2", "node3"]) {
            nodes.set(
                nodeId,
                new RaftNode(
                    {
                        nodeId,
                        port: 0,
                        peers: ["node1", "node2", "node3"].filter(
                            peer => peer !== nodeId
                        )
                    },
                    mockStorage as any,
                    mockStateMachine as any
                )
            );
        }

        vi.stubGlobal(
            "fetch",
            vi.fn(async (url, options) => {
                const nodeId = new URL(String(url)).hostname;
                const node = nodes.get(nodeId);

                if (!node) {
                    return { ok: false };
                }

                // Simulate both peers rejecting the candidate.
                return {
                    ok: true,
                    json: async () => ({
                        term: 1,
                        voteGranted: false
                    })
                };
            })
        );

        try {
            await (nodes.get("node1") as any).startElection();

            expect(nodes.get("node1")?.getState())
                .toBe(NodeState.CANDIDATE);

            expect(nodes.get("node1")?.getTerm())
                .toBe(1);
        } finally {
            for (const node of nodes.values()) {
                (node as any).stopHeartbeats();
            }
        }
    });
    it("should step down when a higher-term election occurs", async () => {
        const nodes = new Map<string, RaftNode>();

        for (const nodeId of ["node1", "node2", "node3"]) {
            nodes.set(
                nodeId,
                new RaftNode(
                    {
                        nodeId,
                        port: 0,
                        peers: ["node1", "node2", "node3"].filter(
                            peer => peer !== nodeId
                        )
                    },
                    mockStorage as any,
                    mockStateMachine as any
                )
            );
        }

        vi.stubGlobal(
            "fetch",
            vi.fn(async (url, options) => {
                const nodeId = new URL(String(url)).hostname;
                const node = nodes.get(nodeId);

                if (!node) {
                    return { ok: false };
                }

                const request = JSON.parse(String(options?.body));

                const result = await node.handleRequestVote(request);

                return {
                    ok: true,
                    json: async () => result
                };
            })
        );

        try {
            // Node 1 becomes leader in term 1.
            await (nodes.get("node1") as any).startElection();

            expect(nodes.get("node1")?.getState())
                .toBe(NodeState.LEADER);

            expect(nodes.get("node1")?.getTerm())
                .toBe(1);

            // Node 2 starts an election in term 2.
            await (nodes.get("node2") as any).startElection();

            // Node 1 received a higher-term RequestVote
            // and therefore must step down.
            expect(nodes.get("node1")?.getState())
                .toBe(NodeState.FOLLOWER);

            expect(nodes.get("node1")?.getTerm())
                .toBe(2);

        } finally {
            for (const node of nodes.values()) {
                (node as any).stopHeartbeats();
            }
        }
    });
    it("should replicate a SET entry to followers", async () => {
        const nodes = new Map<string, RaftNode>();

        for (const nodeId of ["node1", "node2", "node3"]) {
            nodes.set(
                nodeId,
                new RaftNode(
                    {
                        nodeId,
                        port: 0,
                        peers: ["node1", "node2", "node3"].filter(
                            peer => peer !== nodeId
                        )
                    },
                    mockStorage as any,
                    {
                        initialize: async () => { },
                        set: vi.fn(async () => { }),
                        get: vi.fn(async () => null)
                    } as any
                )
            );
        }

        vi.stubGlobal(
            "fetch",
            vi.fn(async (url, options) => {
                const nodeId = new URL(String(url)).hostname;
                const node = nodes.get(nodeId);

                if (!node) {
                    return { ok: false };
                }

                const request = JSON.parse(String(options?.body));

                const result =
                    await node.handleAppendEntries(request);

                return {
                    ok: true,
                    json: async () => result
                };
            })
        );

        try {
            // Make node1 the leader directly.
            // Election behavior is already tested separately.
            (nodes.get("node1") as any).state = NodeState.LEADER;
            (nodes.get("node1") as any).currentTerm = 1;

            // Initialize leader replication state.
            for (const peer of ["node2", "node3"]) {
                (nodes.get("node1") as any).nextIndex.set(peer, 1);
                (nodes.get("node1") as any).matchIndex.set(peer, 0);
            }

            expect(nodes.get("node1")?.getState())
                .toBe(NodeState.LEADER);

            // Write through the leader.
            const result = await nodes
                .get("node1")!
                .set("x", "100");

            expect(result.success).toBe(true);
            expect(result.index).toBe(1);

            // Followers should contain the entry.
            for (const nodeId of ["node2", "node3"]) {
                const node = nodes.get(nodeId)!;

                expect((node as any).log).toHaveLength(1);
                expect((node as any).log[0]).toMatchObject({
                    index: 1,
                    term: 1,
                    command: {
                        type: "SET",
                        key: "x",
                        value: "100"
                    }
                });
            }

        } finally {
            for (const node of nodes.values()) {
                (node as any).stopHeartbeats();
            }
        }
    });
    it("should commit a write when one follower is unavailable", async () => {
        const stateMachine = {
            initialize: vi.fn(async () => { }),
            set: vi.fn(async () => { }),
            get: vi.fn(async () => null),
            delete: vi.fn(async () => { })
        };

        const nodes = new Map<string, RaftNode>();

        for (const nodeId of ["node1", "node2", "node3"]) {
            nodes.set(
                nodeId,
                new RaftNode(
                    {
                        nodeId,
                        port: 0,
                        peers: ["node1", "node2", "node3"].filter(
                            peer => peer !== nodeId
                        )
                    },
                    mockStorage as any,
                    stateMachine as any
                )
            );
        }

        // node1 is the leader.
        const leader = nodes.get("node1")!;

        (leader as any).state = NodeState.LEADER;
        (leader as any).currentTerm = 1;

        for (const peer of ["node2", "node3"]) {
            (leader as any).nextIndex.set(peer, 1);
            (leader as any).matchIndex.set(peer, 0);
        }

        vi.stubGlobal(
            "fetch",
            vi.fn(async (url, options) => {
                const nodeId = new URL(String(url)).hostname;

                // Simulate node3 being down.
                if (nodeId === "node3") {
                    throw new Error("node3 unavailable");
                }

                const node = nodes.get(nodeId);

                if (!node) {
                    return { ok: false };
                }

                const request = JSON.parse(
                    String(options?.body)
                );

                const result =
                    await node.handleAppendEntries(request);

                return {
                    ok: true,
                    json: async () => result
                };
            })
        );

        try {
            const result = await leader.set("x", "100");

            expect(result.success).toBe(true);
            expect(result.index).toBe(1);

            expect((leader as any).commitIndex).toBe(1);

            expect((nodes.get("node2") as any).log).toHaveLength(1);

            expect(
                (nodes.get("node3") as any).log
            ).toHaveLength(0);

        } finally {
            (leader as any).stopHeartbeats();
        }
    });
    it("should not commit a write without a majority", async () => {
        const stateMachine = {
            initialize: vi.fn(async () => { }),
            set: vi.fn(async () => { }),
            get: vi.fn(async () => null),
            delete: vi.fn(async () => { })
        };

        const nodes = new Map<string, RaftNode>();

        for (const nodeId of ["node1", "node2", "node3"]) {
            nodes.set(
                nodeId,
                new RaftNode(
                    {
                        nodeId,
                        port: 0,
                        peers: ["node1", "node2", "node3"].filter(
                            peer => peer !== nodeId
                        )
                    },
                    mockStorage as any,
                    stateMachine as any
                )
            );
        }

        const leader = nodes.get("node1")!;

        // Make node1 leader.
        (leader as any).state = NodeState.LEADER;
        (leader as any).currentTerm = 1;

        for (const peer of ["node2", "node3"]) {
            (leader as any).nextIndex.set(peer, 1);
            (leader as any).matchIndex.set(peer, 0);
        }

        // Both followers are unavailable.
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new Error("peer unavailable");
            })
        );

        try {
            const result = await leader.set("x", "100");

            expect(result.success).toBe(false);

            expect((leader as any).commitIndex).toBe(0);

            // The entry may exist in the leader's uncommitted log.
            expect((leader as any).log).toHaveLength(1);

        } finally {
            (leader as any).stopHeartbeats();
        }
    });
    it("should catch up a follower that is behind", async () => {
        const stateMachine = {
            initialize: vi.fn(async () => { }),
            set: vi.fn(async () => { }),
            get: vi.fn(async () => null),
            delete: vi.fn(async () => { })
        };

        const nodes = new Map<string, RaftNode>();

        for (const nodeId of ["node1", "node2", "node3"]) {
            nodes.set(
                nodeId,
                new RaftNode(
                    {
                        nodeId,
                        port: 0,
                        peers: ["node1", "node2", "node3"].filter(
                            peer => peer !== nodeId
                        )
                    },
                    mockStorage as any,
                    stateMachine as any
                )
            );
        }

        const leader = nodes.get("node1")!;
        const follower = nodes.get("node2")!;

        // Make node1 leader.
        (leader as any).state = NodeState.LEADER;
        (leader as any).currentTerm = 1;

        // Leader already has two entries.
        (leader as any).log.push(
            {
                index: 1,
                term: 1,
                command: {
                    type: "SET",
                    key: "x",
                    value: "100"
                }
            },
            {
                index: 2,
                term: 1,
                command: {
                    type: "SET",
                    key: "y",
                    value: "200"
                }
            }
        );

        // Follower only has the first entry.
        (follower as any).log.push({
            index: 1,
            term: 1,
            command: {
                type: "SET",
                key: "x",
                value: "100"
            }
        });

        (leader as any).nextIndex.set("node2", 2);
        (leader as any).matchIndex.set("node2", 1);

        (leader as any).nextIndex.set("node3", 3);
        (leader as any).matchIndex.set("node3", 2);

        vi.stubGlobal(
            "fetch",
            vi.fn(async (url, options) => {
                const nodeId = new URL(String(url)).hostname;
                const node = nodes.get(nodeId);

                if (!node) {
                    return { ok: false };
                }

                const request = JSON.parse(
                    String(options?.body)
                );

                const result =
                    await node.handleAppendEntries(request);

                return {
                    ok: true,
                    json: async () => result
                };
            })
        );

        try {
            await (leader as any).replicateToPeer("node2");

            expect((follower as any).log).toHaveLength(2);

            expect((follower as any).log[1]).toMatchObject({
                index: 2,
                term: 1,
                command: {
                    type: "SET",
                    key: "y",
                    value: "200"
                }
            });

            expect(
                (leader as any).matchIndex.get("node2")
            ).toBe(2);

            expect(
                (leader as any).nextIndex.get("node2")
            ).toBe(3);

        } finally {
            (leader as any).stopHeartbeats();
            (follower as any).stopHeartbeats();
        }
    });
    it("should repair a follower with a conflicting log entry", async () => {
        const stateMachine = {
            initialize: vi.fn(async () => { }),
            set: vi.fn(async () => { }),
            get: vi.fn(async () => null),
            delete: vi.fn(async () => { })
        };

        const nodes = new Map<string, RaftNode>();

        for (const nodeId of ["node1", "node2"]) {
            nodes.set(
                nodeId,
                new RaftNode(
                    {
                        nodeId,
                        port: 0,
                        peers: ["node1", "node2"].filter(
                            peer => peer !== nodeId
                        )
                    },
                    mockStorage as any,
                    stateMachine as any
                )
            );
        }

        const leader = nodes.get("node1")!;
        const follower = nodes.get("node2")!;

        (leader as any).state = NodeState.LEADER;
        (leader as any).currentTerm = 3;

        // Leader's correct log.
        (leader as any).log.push(
            {
                index: 1,
                term: 1,
                command: {
                    type: "SET",
                    key: "x",
                    value: "100"
                }
            },
            {
                index: 2,
                term: 2,
                command: {
                    type: "SET",
                    key: "x",
                    value: "200"
                }
            },
            {
                index: 3,
                term: 3,
                command: {
                    type: "SET",
                    key: "y",
                    value: "300"
                }
            }
        );

        // Follower has a conflicting entry at index 2.
        (follower as any).log.push(
            {
                index: 1,
                term: 1,
                command: {
                    type: "SET",
                    key: "x",
                    value: "100"
                }
            },
            {
                index: 2,
                term: 99,
                command: {
                    type: "SET",
                    key: "x",
                    value: "999"
                }
            }
        );

        // Leader initially thinks follower is at index 3.
        (leader as any).nextIndex.set("node2", 3);
        (leader as any).matchIndex.set("node2", 2);

        vi.stubGlobal(
            "fetch",
            vi.fn(async (url, options) => {
                const nodeId = new URL(String(url)).hostname;
                const node = nodes.get(nodeId);

                if (!node) {
                    return { ok: false };
                }

                const request = JSON.parse(
                    String(options?.body)
                );

                const result =
                    await node.handleAppendEntries(request);

                return {
                    ok: true,
                    json: async () => result
                };
            })
        );

        try {
            // First attempt should fail because:
            //
            // prevLogIndex = 2
            // leader prevLogTerm = 2
            // follower term at index 2 = 99
            await (leader as any).replicateToPeer("node2");

            expect(
                (leader as any).nextIndex.get("node2")
            ).toBe(4);

            // Second attempt sends the correct entry at index 2
            // and the following entry at index 3.
            await (leader as any).replicateToPeer("node2");

            expect((follower as any).log).toHaveLength(3);

            expect((follower as any).log).toEqual(
                (leader as any).log
            );

            expect(
                (leader as any).matchIndex.get("node2")
            ).toBe(3);

            expect(
                (leader as any).nextIndex.get("node2")
            ).toBe(4);

        } finally {
            (leader as any).stopHeartbeats();
            (follower as any).stopHeartbeats();
        }
    });
    it("should restore Raft state after restart", async () => {
        let savedState: any = {
            currentTerm: 7,
            votedFor: "node2",
            log: [
                {
                    index: 1,
                    term: 7,
                    command: {
                        type: "SET",
                        key: "x",
                        value: "100"
                    }
                }
            ],
            commitIndex: 1,
            lastApplied: 1
        };

        const storage = {
            save: vi.fn(async (state) => {
                savedState = state;
            }),

            load: vi.fn(async () => savedState)
        };

        const stateMachine = {
            initialize: vi.fn(async () => { }),
            set: vi.fn(async () => { }),
            get: vi.fn(async () => null),
            delete: vi.fn(async () => { })
        };

        // First process.
        const node1 = new RaftNode(
            {
                nodeId: "node1",
                port: 5001,
                peers: []
            },
            storage as any,
            stateMachine as any
        );

        await node1.initialize();

        expect(node1.getTerm()).toBe(7);

        // Simulate process/container restart.
        const node2 = new RaftNode(
            {
                nodeId: "node1",
                port: 5001,
                peers: []
            },
            storage as any,
            stateMachine as any
        );

        await node2.initialize();

        expect(node2.getTerm()).toBe(7);
        expect((node2 as any).votedFor).toBe("node2");

        expect((node2 as any).log).toHaveLength(1);

        expect((node2 as any).commitIndex).toBe(1);
        expect((node2 as any).lastApplied).toBe(1);

        (node1 as any).stopHeartbeats();
        (node2 as any).stopHeartbeats();
    });
});
