import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { api } from "./routes.js";

const app = express();
app.use(express.json());
app.use("/api", api);

// Serve the built React client in production.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, "../../client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`pred server listening on http://localhost:${port}`);
});
