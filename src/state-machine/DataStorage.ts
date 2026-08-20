import fs from "node:fs/promises";
import path from "node:path";
import { Data } from "./types.js";

export class DataStorage {
    private readonly filePath: string;

    constructor(dataDir: string) {
        this.filePath = path.join(dataDir, "actual-data.json");
    }

    async load(): Promise<Data> {
        try {
            const data = await fs.readFile(this.filePath, "utf-8");
            return JSON.parse(data) as Data;
        } catch (error: unknown) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return {};
            }
            throw error;
        }
    }

    async save(data: Data): Promise<void> {
        await fs.mkdir(path.dirname(this.filePath), {
            recursive: true
        });

        await fs.writeFile(
            this.filePath,
            JSON.stringify(data, null, 2)
        );
    }
}
