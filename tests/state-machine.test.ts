import { describe, expect, it } from "vitest";
import { StateMachine } from "../src/state-machine/StateMachine.js";

const createMockStorage = () => ({
    load: async () => ({}),
    save: async () => { }
});

describe("StateMachine", () => {
    it("should store and retrieve a value", async () => {
        const storage = createMockStorage();
        const stateMachine = new StateMachine(
            storage as any
        );
        await stateMachine.initialize();
        await stateMachine.set("x", "100");
        const value = await stateMachine.get("x");
        expect(value).toBe("100");
    });

    it("should delete an existing key", async () => {
        const storage = createMockStorage();

        const stateMachine = new StateMachine(
            storage as any
        );
        await stateMachine.initialize();
        await stateMachine.set("x", "100");
        expect(await stateMachine.get("x")).toBe("100");
        await stateMachine.delete("x");
        expect(await stateMachine.get("x")).toBeNull();
    });

    it("should store multiple keys independently", async () => {
        const storage = createMockStorage();

        const stateMachine = new StateMachine(
            storage as any
        );

        await stateMachine.initialize();

        await stateMachine.set("x", "100");
        await stateMachine.set("y", "200");
        await stateMachine.set("z", "300");

        expect(await stateMachine.get("x")).toBe("100");
        expect(await stateMachine.get("y")).toBe("200");
        expect(await stateMachine.get("z")).toBe("300");
    });

    it("should update an existing key", async () => {
        const storage = createMockStorage();

        const stateMachine = new StateMachine(
            storage as any
        );

        await stateMachine.initialize();

        await stateMachine.set("x", "100");

        expect(await stateMachine.get("x"))
            .toBe("100");

        await stateMachine.set("x", "500");

        expect(await stateMachine.get("x"))
            .toBe("500");
    });

    it("should return all stored key-value pairs", async () => {
        const storage = createMockStorage();

        const stateMachine = new StateMachine(
            storage as any
        );

        await stateMachine.initialize();

        await stateMachine.set("x", "100");
        await stateMachine.set("y", "200");
        await stateMachine.set("z", "300");

        const all = await stateMachine.getAll();

        expect(all).toEqual({
            x: "100",
            y: "200",
            z: "300"
        });
    });
});