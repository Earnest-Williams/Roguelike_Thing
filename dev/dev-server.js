import express from "express";
import { exec } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(here), "..");

const app = express();
app.use(express.static(ROOT));

app.post("/__run-tests", (_req, res) => {
  exec("npm run test:all", { cwd: ROOT, maxBuffer: 10 * 1024 * 1024 }, (err) => {
    if (err) {
      console.error("Test run error:", err);
    }
    res.sendFile(path.join(ROOT, "tests", "latest.html"));
  });
});

const port = process.env.PORT || 5173;
app.listen(port, () => {
  console.log(`Dev server on http://localhost:${port}`);
});
