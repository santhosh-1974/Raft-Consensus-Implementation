import express from "express";
import dotenv   from "dotenv"
const app = express();
dotenv.config()

const nodeId = process.env.NODE_ID;
const port = Number(process.env.PORT);

if (!nodeId) {
    throw new Error("NODE_ID is required");
}

if (!port) {
    throw new Error("PORT is required");
}

app.get("/health", (_req, res) => {
    res.json({
        nodeId,
        status: "healthy"
    });
});

app.listen(port, "0.0.0.0", () => {
    console.log(`${nodeId} listening on port ${port}`);
});