import http from "k6/http";
import { check } from "k6";

export const options = {
    scenarios: {
        concurrent_reads: {
            executor: "constant-vus",
            vus: 20,
            duration: "30s"
        }
    }
};

export default function () {
    const key = `load-${(__VU % 10) + 1}`;

    const response = http.get(
        `http://localhost:5002/kv/${key}`
    );

    check(response, {
        "HTTP 200": (r) => r.status === 200,
        "success true": (r) => {
            try {
                return r.json().success === true;
            } catch {
                return false;
            }
        }
    });
}