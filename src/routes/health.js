const router = require("express").Router();
const { isHealthy } = require("../db");

router.get("/healthz", (_req, res) => res.json({ status: "ok" }));

router.get("/readyz", async (_req, res) => {
  const ok = await isHealthy();
  res.status(ok ? 200 : 503).json({
    status: ok ? "ready" : "mongo-unavailable",
  });
});

module.exports = router;
