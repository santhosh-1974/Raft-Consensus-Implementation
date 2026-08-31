import { DataStorage } from "./DataStorage.js";
import { Data } from "./types.js";

export class StateMachine {
    private data: Data = {};
    private processedRequests = new Map<
        string,
        {
            success: boolean;
            index: number;
        }
    >();

    constructor(
        private readonly storage: DataStorage
    ) {}

    async initialize(): Promise<void> {
        this.data = await this.storage.load();
    }

    async set(key: string, value: string): Promise<void> {
        this.data[key] = value;

        await this.storage.save(this.data);
    }

    async get(key: string): Promise<string | undefined> {
        return this.data[key] ?? null;
    }

    async delete(key: string): Promise<void> {
        delete this.data[key];

        await this.storage.save(this.data);
    }

    getProcessedRequest(requestId: string) {
        return this.processedRequests.get(requestId);
    }

    recordProcessedRequest(
        requestId: string,
        result: {
            success: boolean;
            index: number;
        }
    ): void {
        this.processedRequests.set(requestId, result);
    }

    getAll(): Data {
        return { ...this.data };
    }
}
