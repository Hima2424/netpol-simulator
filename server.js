const express = require("express");
const path = require("path");
const fs = require("fs");
const app = express();

app.use(express.json());

// Serve from "public" if it exists (local setup), otherwise from the repo root (GitHub layout)
const publicDir = fs.existsSync(path.join(__dirname, "public"))
  ? path.join(__dirname, "public")
  : __dirname;
app.use(express.static(publicDir));

function isAllowed(policies, src, dst) {
  const { denyAll, fb, bd } = policies;
  const selected =
    denyAll ||
    (dst === "backend" && fb) ||
    (dst === "database" && bd);
  if (!selected) return true;
  if (dst === "backend" && fb && src === "frontend") return true;
  if (dst === "database" && bd && src === "backend") return true;
  return false;
}

app.post("/api/test", (req, res) => {
  const { policies, src, dst } = req.body;
  if (!policies || !src || !dst) {
    return res.status(400).json({ error: "policies, src and dst are required" });
  }
  res.json({ src, dst, allowed: isAllowed(policies, src, dst) });
});

app.post("/api/test-all", (req, res) => {
  const { policies } = req.body;
  if (!policies) return res.status(400).json({ error: "policies required" });
  const pairs = [
    ["frontend", "backend"],
    ["frontend", "database"],
    ["backend", "database"],
    ["test-client", "backend"],
    ["test-client", "database"],
  ];
  res.json(pairs.map(([src, dst]) => ({ src, dst, allowed: isAllowed(policies, src, dst) })));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running at http://localhost:${PORT}`));
