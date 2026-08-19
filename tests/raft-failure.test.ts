import { afterEach, describe, expect, it, vi } from "vitest";
import { RaftNode } from "../src/raft/RaftNode.js";
import { NodeState } from "../src/raft/types.js";

const mockStorage = {
    save: async () => { },
    load: async () => null
};

const stateMachine = {
    initialize: vi.fn(async () => { }),
    set: vi.fn(async () => { }),
    get: vi.fn(async () => null),
    delete: vi.fn(async () => { }),
    getAll: vi.fn(async () => ({})),
    data: new Map(),
    storage: mockStorage
};

describe("Raft failure recovery", () => {

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("should elect a new leader after the current leader crashes", async () => {
        const nodes = new Map<string, RaftNode>();
        const availableNodes = new Set(["node1", "node2", "node3"]);

        for (const nodeId of availableNodes) {
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

        vi.stubGlobal("fetch", vi.fn(async (url, options) => {
            const nodeId = new URL(String(url)).hostname;
            const node = nodes.get(nodeId);

            if (!node || !availableNodes.has(nodeId)) {
                throw new Error(`${nodeId} is unavailable`);
            }

            const request = JSON.parse(String(options?.body));
            const result = await node.handleRequestVote(request);

            return {
                ok: true,
                json: async () => result
            };
        }));

        try {
            const firstLeader = nodes.get("node1")!;
            await (firstLeader as any).startElection();

            expect(firstLeader.getState()).toBe(NodeState.LEADER);
            expect(firstLeader.getTerm()).toBe(1);

            availableNodes.delete(firstLeader.getNodeId());

            const replacementLeader = nodes.get("node2")!;
            await (replacementLeader as any).startElection();

            expect(replacementLeader.getState()).toBe(NodeState.LEADER);
            expect(replacementLeader.getNodeId())
                .not.toBe(firstLeader.getNodeId());
            expect(replacementLeader.getTerm())
                .toBeGreaterThan(firstLeader.getTerm());
        } finally {
            for (const node of nodes.values()) {
                (node as any).stopHeartbeats();
            }
        }
    });
    it("should continue committing writes when one follower crashes", async () => {
        const nodes = new Map<string, RaftNode>();
        const availableNodes = new Set([
            "node1",
            "node2",
            "node3"
        ]);

        const stateMachines = new Map<string, any>();

        for (const nodeId of availableNodes) {
            stateMachines.set(nodeId, {
                initialize: async () => { },
                set: vi.fn(async () => { }),
                get: vi.fn(async () => null),
                delete: vi.fn(async () => { })
            });

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
                    stateMachines.get(nodeId)
                )
            );
        }

        vi.stubGlobal(
            "fetch",
            vi.fn(async (url, options) => {
                const nodeId =
                    new URL(String(url)).hostname;

                if (!availableNodes.has(nodeId)) {
                    throw new Error(
                        `${nodeId} is unavailable`
                    );
                }

                const node = nodes.get(nodeId);

                if (!node) {
                    throw new Error("Unknown node");
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
            const leader = nodes.get("node1")!;

            // Establish node1 as leader.
            (leader as any).state = NodeState.LEADER;
            (leader as any).currentTerm = 1;

            (leader as any).nextIndex.set("node2", 1);
            (leader as any).nextIndex.set("node3", 1);

            (leader as any).matchIndex.set("node2", 0);
            (leader as any).matchIndex.set("node3", 0);

            // Crash node3.
            availableNodes.delete("node3");

            const result = await leader.set(
                "x",
                "100"
            );

            expect(result.success).toBe(true);

            expect((leader as any).commitIndex)
                .toBe(1);

            expect(
                (nodes.get("node2") as any).log
            ).toHaveLength(1);

            expect(
                (nodes.get("node3") as any).log
            ).toHaveLength(0);

        } finally {
            for (const node of nodes.values()) {
                (node as any).stopHeartbeats();
            }
        }
    });

    it("should not commit a write when the leader loses the majority", async () => {
        const nodes = new Map<string, RaftNode>();
        const availableNodes = new Set(["node1"]);

        const stateMachine = {
            initialize: async () => { },
            set: vi.fn(async () => { }),
            get: vi.fn(async () => null),
            delete: vi.fn(async () => { })
        };

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

        vi.stubGlobal(
            "fetch",
            vi.fn(async (url) => {
                const nodeId = new URL(String(url)).hostname;

                if (!availableNodes.has(nodeId)) {
                    throw new Error(`${nodeId} is unavailable`);
                }

                return {
                    ok: true,
                    json: async () => ({
                        term: 1,
                        success: true
                    })
                };
            })
        );

        try {
            const leader = nodes.get("node1")!;

            // Node1 is the leader.
            (leader as any).state = NodeState.LEADER;
            (leader as any).currentTerm = 1;

            (leader as any).nextIndex.set("node2", 1);
            (leader as any).nextIndex.set("node3", 1);

            (leader as any).matchIndex.set("node2", 0);
            (leader as any).matchIndex.set("node3", 0);

            // Node2 and Node3 are both down.
            const result = await leader.set("x", "100");

            expect(result.success).toBe(false);

            // Entry exists in leader's log,
            // but it must NOT be committed.
            expect((leader as any).log).toHaveLength(1);

            expect((leader as any).commitIndex).toBe(0);

        } finally {
            for (const node of nodes.values()) {
                (node as any).stopHeartbeats();
            }
        }
    });
    it("should catch up a follower after it rejoins", async () => {
        const nodes = new Map<string, RaftNode>();
        const availableNodes = new Set([
            "node1",
            "node2",
            "node3"
        ]);

        const stateMachines = new Map<string, any>();

        for (const nodeId of ["node1", "node2", "node3"]) {
            const stateMachine = {
                initialize: async () => { },
                set: vi.fn(async () => { }),
                get: vi.fn(async () => null),
                delete: vi.fn(async () => { })
            };

            stateMachines.set(nodeId, stateMachine);

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

        vi.stubGlobal(
            "fetch",
            vi.fn(async (url, options) => {
                const nodeId = new URL(String(url)).hostname;

                if (!availableNodes.has(nodeId)) {
                    throw new Error(`${nodeId} is unavailable`);
                }

                const node = nodes.get(nodeId)!;

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
            const leader = nodes.get("node1")!;
            const follower = nodes.get("node3")!;

            // Node1 is leader.
            (leader as any).state = NodeState.LEADER;
            (leader as any).currentTerm = 1;

            for (const peer of ["node2", "node3"]) {
                (leader as any).nextIndex.set(peer, 1);
                (leader as any).matchIndex.set(peer, 0);
            }

            // Node3 crashes.
            availableNodes.delete("node3");

            // Write while Node3 is down.
            const result = await leader.set("x", "100");

            expect(result.success).toBe(true);

            expect((leader as any).log).toHaveLength(1);
            expect((nodes.get("node2") as any).log)
                .toHaveLength(1);

            expect((follower as any).log)
                .toHaveLength(0);

            // Node3 rejoins.
            availableNodes.add("node3");

            // Leader tries to replicate to Node3.
            await (leader as any).replicateToPeer("node3");

            expect((follower as any).log)
                .toHaveLength(1);

            expect((follower as any).log[0])
                .toEqual((leader as any).log[0]);

            expect(
                (leader as any).matchIndex.get("node3")
            ).toBe(1);

            expect(
                (leader as any).nextIndex.get("node3")
            ).toBe(2);

        } finally {
            for (const node of nodes.values()) {
                (node as any).stopHeartbeats();
            }
        }
    });
    it("should step down when an old leader rejoins a newer-term cluster", async () => {
        const nodes = new Map<string, RaftNode>();

        const stateMachine = {
            initialize: vi.fn(async () => { }),
            set: vi.fn(async () => { }),
            get: vi.fn(async () => null),
            delete: vi.fn(async () => { }),
            getAll: vi.fn(async () => ({})),
            data: new Map(),
            storage: mockStorage
        };

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

        const oldLeader = nodes.get("node1")!;
        const newLeader = nodes.get("node2")!;

        // Old leader is in term 1.
        (oldLeader as any).state = NodeState.LEADER;
        (oldLeader as any).currentTerm = 1;

        // Node2 has been elected in a newer term.
        (newLeader as any).state = NodeState.LEADER;
        (newLeader as any).currentTerm = 2;

        vi.stubGlobal(
            "fetch",
            vi.fn(async (url, options) => {
                const nodeId =
                    new URL(String(url)).hostname;

                const node = nodes.get(nodeId);

                if (!node) {
                    throw new Error("Unknown node");
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
            // New leader sends a heartbeat using term 2.
            const response =
                await oldLeader.handleAppendEntries({
                    term: 2,
                    leaderId: "node2",
                    prevLogIndex: 0,
                    prevLogTerm: 0,
                    entries: [],
                    leaderCommit: 0
                });

            expect(response.success).toBe(true);

            // Old leader must step down.
            expect(oldLeader.getState())
                .toBe(NodeState.FOLLOWER);

            // It must adopt the newer term.
            expect(oldLeader.getTerm())
                .toBe(2);

        } finally {
            for (const node of nodes.values()) {
                (node as any).stopHeartbeats();
            }
        }
    });

    it("should not commit writes on the minority side of a network partition", async () => {
        const nodes = new Map<string, RaftNode>();

        const stateMachine = {
            initialize: vi.fn(async () => { }),
            set: vi.fn(async () => { }),
            get: vi.fn(async () => null),
            delete: vi.fn(async () => { }),
            getAll: vi.fn(async () => ({})),
            data: new Map(),
            storage: mockStorage
        };

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

        const minorityLeader = nodes.get("node1")!;

        // Node1 is the old leader.
        (minorityLeader as any).state =
            NodeState.LEADER;

        (minorityLeader as any).currentTerm = 5;

        (minorityLeader as any).nextIndex.set(
            "node2",
            1
        );

        (minorityLeader as any).nextIndex.set(
            "node3",
            1
        );

        (minorityLeader as any).matchIndex.set(
            "node2",
            0
        );

        (minorityLeader as any).matchIndex.set(
            "node3",
            0
        );

        /*
         * Network partition:
         *
         * node1 cannot communicate with
         * node2 or node3.
         */
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new Error(
                    "Network partition"
                );
            })
        );

        try {
            const result =
                await minorityLeader.set(
                    "x",
                    "100"
                );

            /*
             * Node1 has only itself.
             *
             * 1 / 3 != majority
             */
            expect(result.success)
                .toBe(false);

            /*
             * The entry can exist in the
             * leader's local log.
             */
            expect(
                (minorityLeader as any).log
            ).toHaveLength(1);

            /*
             * But it MUST NOT be committed.
             */
            expect(
                (minorityLeader as any).commitIndex
            ).toBe(0);

        } finally {
            (
                minorityLeader as any
            ).stopHeartbeats();
        }
    });
});
