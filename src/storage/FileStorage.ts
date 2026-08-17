import fs from "node:fs/promises";
import path from "node:path";
import {RaftPersistentState } from "./types.js";

export class FileStorage {
    private readonly filePath: string;

    constructor(dataDir: string) {
        this.filePath = path.join(dataDir, "raft-state.json");
    }

    async load(): Promise<RaftPersistentState | null> {
        try {
            const data = await fs.readFile(this.filePath, "utf-8");

            return JSON.parse(data) as RaftPersistentState;
        } catch (error: any) {
            if (error.code === "ENOENT") {
                return null;
            }

            throw error;
        }
    }

    async save(state: RaftPersistentState): Promise<void> {
        await fs.mkdir(path.dirname(this.filePath), {
            recursive: true
        });

        await fs.writeFile(
            this.filePath,
            JSON.stringify(state, null, 2)
        );
    }
}