const router = require("express").Router();
const { z } = require("zod");
const Return = require("../models/return");
const { requireAuth, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/error");

router.get(
  "/returns-by-sku",
  requireAuth,
  requireRole("admin", "ops"),
  asyncHandler(async (req, res) => {
    const { days, limit } = z
      .object({
        days: z.coerce.number().int().min(1).max(365).default(90),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(req.query);
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await Return.aggregate([
      { $match: { createdAt: { $gte: since }, status: { $ne: "rejected" } } },
      {
        $group: {
          _id: { sku: "$sku", size: "$size", reason: "$reason" },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: { sku: "$_id.sku", size: "$_id.size" },
          total: { $sum: "$count" },
          reasons: { $push: { reason: "$_id.reason", count: "$count" } },
        },
      },
      { $sort: { total: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          sku: "$_id.sku",
          size: "$_id.size",
          total: 1,
          reasons: 1,
        },
      },
    ]);
    res.json({ windowDays: days, rows });
  }),
);

module.exports = router;
