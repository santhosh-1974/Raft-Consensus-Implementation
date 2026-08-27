import http from "k6/http";
import { check } from "k6";

export const options = {
    vus: 10,
    duration: "30s"
};

export default function () {
    const key = `load-${__VU}-${__ITER}`;

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
        "status is 200": (r) => r.status === 200,
        "request succeeded": (r) => {
            try {
                return r.json().success === true;
            } catch {
                return false;
            }
        }
    });
}