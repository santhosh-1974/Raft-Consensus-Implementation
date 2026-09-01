import http from "k6/http";
import { check } from "k6";

export const options = {
    scenarios: {
        follower_forward: {
            executor: "constant-vus",
            vus: 10,
            duration: "10s"
        }
    }
};

export default function () {
    const key = `forward-${__VU}-${__ITER}`;

    const response = http.put(
        `http://localhost:5001/kv/${key}`,
        JSON.stringify({
            value: `value-${__VU}-${__ITER}`,
            requestId: `forward-${__VU}-${__ITER}`
        }),
        {
            headers: {
                "Content-Type": "application/json"
            }
        }
    );
    if (response.status !== 200) {
        console.log(
            `FAILED status=${response.status} body=${response.body}`
        );
    }
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