import { afterEach, describe, expect, it } from "vitest";
import { FileStorage } from "../src/storage/FileStorage.js";
import type { RaftPersistentState } from "../src/storage/types.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let testDataDir: string;

describe("FileStorage", () => {

    afterEach(async () => {
        await rm(testDataDir, {
            force: true,
            recursive: true
        });
    });

    it("should save and load Raft state", async () => {
        testDataDir = await mkdtemp(
            path.join(tmpdir(), "raft-storage-")
        );
        const storage = new FileStorage(testDataDir);

        const state: RaftPersistentState = {
            currentTerm: 5,
            votedFor: "node1",
            log: [
                {
                    index: 1,
                    term: 5,
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

        await storage.save(state);

        const loaded = await storage.load();

        expect(loaded).toEqual(state);
    });
    it("should return null when no state exists", async () => {
        testDataDir = await mkdtemp(
            path.join(tmpdir(), "raft-storage-")
        );
        const storage = new FileStorage(testDataDir);
        const loaded = await storage.load();
        expect(loaded).toBeNull();
    });
    it("should overwrite previously saved state", async () => {
        testDataDir = await mkdtemp(
            path.join(tmpdir(), "raft-storage-")
        );

        const storage = new FileStorage(testDataDir);

        const firstState: RaftPersistentState = {
            currentTerm: 1,
            votedFor: "node1",
            log: [],
            commitIndex: 0,
            lastApplied: 0
        };

        const secondState: RaftPersistentState = {
            currentTerm: 2,
            votedFor: "node2",
            log: [
                {
                    index: 1,
                    term: 2,
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

        await storage.save(firstState);
        await storage.save(secondState);

        const loaded = await storage.load();

        expect(loaded).toEqual(secondState);
    });
    it("should reject corrupted persisted state", async () => {
        testDataDir = await mkdtemp(
            path.join(tmpdir(), "raft-storage-")
        );

        const storage = new FileStorage(testDataDir);

        await storage.save({
            currentTerm: 1,
            votedFor: "node1",
            log: [],
            commitIndex: 0,
            lastApplied: 0
        });

        // Corrupt the persisted file.
        const fs = await import("node:fs/promises");

        await fs.writeFile(
            path.join(testDataDir, "raft-state.json"),
            "{ invalid json"
        );

        await expect(
            storage.load()
        ).rejects.toThrow();
    });
});
