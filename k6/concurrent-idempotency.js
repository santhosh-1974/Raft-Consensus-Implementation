import http from "k6/http";
import { check } from "k6";

export const options = {
    scenarios: {
        concurrent_idempotency: {
            executor: "constant-vus",
            vus: 20,
            duration: "10s"
        }
    }
};

export default function () {
    const requestId = `same-request-${__VU}`;

    const response = http.put(
        `http://localhost:5002/kv/idempotency-concurrent`,
        JSON.stringify({
            value: "same-value",
            requestId: requestId
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