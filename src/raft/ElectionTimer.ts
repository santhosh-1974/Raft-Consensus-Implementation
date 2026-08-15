export class ElectionTimer {
    private timer: NodeJS.Timeout | null = null;

    constructor(
        private readonly minTimeout = 1500,
        private readonly maxTimeout = 3000,
        private readonly onTimeout: () => void
    ){}

    start(): void {
        this.reset();
    }

    reset(): void {
        this.stop();

        const timeout =
            Math.floor(
                Math.random() *
                (this.maxTimeout - this.minTimeout + 1)
            ) + this.minTimeout;

        this.timer = setTimeout(() => {
            this.onTimeout();
        }, timeout);
    }

    stop(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
}