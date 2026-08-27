import http from "k6/http";
import { check } from "k6";

export const options = {
    scenarios: {
        concurrent_writes: {
            executor: "constant-vus",
            vus: 20,
            duration: "30s"
        }
    }
};

export default function () {
    const key = `concurrent-${__VU}-${__ITER}`;

    const response = http.put(
        `http://localhost:5002/kv/${key}`,
        JSON.stringify({
            value: `value-${__VU}-${__ITER}`
        }),
        {
            headers: {
                "Content-Type": "application/json"
            }
        }
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