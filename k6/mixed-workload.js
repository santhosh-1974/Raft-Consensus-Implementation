import http from "k6/http";
import { check } from "k6";

export const options = {
    scenarios: {
        mixed_workload: {
            executor: "constant-vus",
            vus: 20,
            duration: "30s"
        }
    }
};

export default function () {
    const key = `mixed-${__VU}-${__ITER}`;

    // 80% reads, 20% writes
    if (Math.random() < 0.8) {
        const response = http.get(
            `http://localhost:5002/kv/${key}`
        );

        check(response, {
            "GET status is valid": (r) =>
                r.status === 200 || r.status === 503
        });

    } else {
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
            "PUT status is 200": (r) => r.status === 200,
            "PUT succeeded": (r) => {
                try {
                    return r.json().success === true;
                } catch {
                    return false;
                }
            }
        });
    }
}