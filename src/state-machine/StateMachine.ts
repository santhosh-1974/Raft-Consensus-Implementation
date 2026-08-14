import { DataStorage } from "./DataStorage.js";
import { Data } from "./types.js";

export class StateMachine {
    private data: Data = {};

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
        return this.data[key];
    }

    async delete(key: string): Promise<void> {
        delete this.data[key];

        await this.storage.save(this.data);
    }

    getAll(): Data {
        return { ...this.data };
    }
}