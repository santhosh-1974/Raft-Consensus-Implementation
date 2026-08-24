import { describe, expect, it } from "vitest";

const nodes = [
    "http://localhost:5001",
    "http://localhost:5002",
    "http://localhost:5003"
];

async function put(
    node: string,
    key: string,
    value: string
) {
    const response = await fetch(
        `${node}/kv/${key}`,
        {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ value })
        }
    );

    const body = await response.json();

    expect(
        response.ok,
        `PUT ${key} on ${node} failed: HTTP ${response.status} ${JSON.stringify(body)}`
    ).toBe(true);

    return body;
}

async function get(
    node: string,
    key: string
) {
    const response = await fetch(
        `${node}/kv/${key}`
    );

    expect(response.ok).toBe(true);

    return response.json();
}

describe("Raft real cluster consistency", () => {

    it("should replicate concurrent writes across all nodes", async () => {
        const writes = Array.from(
            { length: 10 },
            (_, i) => ({
                key: `consistency-key-${i}`,
                value: `value-${i}`
            })
        );

        /*
         * Send all writes concurrently.
         *
         * We send them to node2 intentionally.
         * node2 may be a follower and should forward
         * requests to the current leader.
         */
        await Promise.all(
            writes.map(({ key, value }) =>
                put(
                    nodes[1],
                    key,
                    value
                )
            )
        );

        /*
         * Verify every key on every node.
         */
        for (const { key, value } of writes) {
            for (const node of nodes) {
                const result = await get(
                    node,
                    key
                );

                expect(result.success).toBe(true);
                expect(result.value).toBe(value);
            }
        }
    });
});