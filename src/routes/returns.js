const fs = require("fs/promises");
const path = require("path");
const router = require("express").Router();
const { z } = require("zod");
const config = require("../config");
const Order = require("../models/order");
const Return = require("../models/return");
const { STATUSES, REASONS, TYPES, TRANSITIONS } = require("../models/return");
const { requireAuth, requireRole } = require("../middleware/auth");
const { uploadPhotos } = require("../middleware/upload");
const { HttpError, asyncHandler } = require("../middleware/error");

const createSchema = z
  .object({
    orderNumber: z.string().min(1),
    email: z.string().email(),
    lineItemId: z.string().min(1),
    type: z.enum(TYPES),
    reason: z.enum(REASONS),
    comment: z.string().max(1000).optional(),
    exchangeSize: z.string().max(20).optional(),
  })
  .refine((d) => d.type !== "exchange" || d.exchangeSize, {
    message: "exchangeSize is required for exchanges",
    path: ["exchangeSize"],
  });

async function discardUploads(files = []) {
  await Promise.all(files.map((f) => fs.unlink(f.path).catch(() => {})));
}

// POST /api/v1/returns  (multipart/form-data, public — the customer files this)
router.post(
  "/",
  uploadPhotos,
  asyncHandler(async (req, res) => {
    try {
      const body = createSchema.parse(req.body);

      const order = await Order.findOne({
        orderNumber: body.orderNumber,
        "customer.email": body.email.toLowerCase(),
      });
      if (!order) throw new HttpError(404, "Order not found for that email");

      const item = order.lineItems.find(
        (li) => li.lineItemId === body.lineItemId,
      );
      if (!item)
        throw new HttpError(400, "That item is not part of this order");

      const ageDays = (Date.now() - order.orderedAt.getTime()) / 86_400_000;
      if (ageDays > config.returnWindowDays) {
        throw new HttpError(
          422,
          `Return window of ${config.returnWindowDays} days has passed`,
        );
      }

      const open = await Return.findOne({
        orderNumber: body.orderNumber,
        lineItemId: body.lineItemId,
        status: { $nin: ["rejected"] },
      });
      if (open)
        throw new HttpError(409, "A return already exists for this item");

      if (
        (body.reason === "damaged" || body.reason === "color_mismatch") &&
        !req.files?.length
      ) {
        throw new HttpError(
          400,
          "Please attach at least one photo for damaged or colour issues",
        );
      }

      const ret = await Return.create({
        order: order._id,
        orderNumber: body.orderNumber,
        lineItemId: item.lineItemId,
        sku: item.sku,
        size: item.size,
        type: body.type,
        reason: body.reason,
        comment: body.comment,
        exchangeSize: body.exchangeSize,
        photos: (req.files || []).map((f) =>
          path.relative(config.uploadDir, f.path),
        ),
        history: [{ to: "requested", by: body.email }],
      });

      res.status(201).location(`/api/v1/returns/${ret._id}`).json(ret);
    } catch (err) {
      await discardUploads(req.files); // don't leave orphan photos on the volume
      throw err;
    }
  }),
);

// GET /api/v1/returns?status=approved&page=1&limit=20  (staff only)
const listSchema = z.object({
  status: z.enum(STATUSES).optional(),
  sku: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

router.get(
  "/",
  requireAuth,
  requireRole("admin", "ops"),
  asyncHandler(async (req, res) => {
    const { status, sku, page, limit } = listSchema.parse(req.query);
    const filter = {};
    if (status) filter.status = status;
    if (sku) filter.sku = sku;

    const [items, total] = await Promise.all([
      Return.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Return.countDocuments(filter),
    ]);

    res.json({
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  }),
);

router.get(
  "/:id",
  requireAuth,
  requireRole("admin", "ops"),
  asyncHandler(async (req, res) => {
    const ret = await Return.findById(req.params.id).populate("order").lean();
    if (!ret) throw new HttpError(404, "Return not found");
    res.json(ret);
  }),
);

// PATCH /api/v1/returns/:id/status  — enforced state machine
const statusSchema = z.object({
  status: z.enum(STATUSES),
  note: z.string().max(500).optional(),
  exchangeSize: z.string().max(20).optional(),
});

router.patch(
  "/:id/status",
  requireAuth,
  requireRole("admin", "ops"),
  asyncHandler(async (req, res) => {
    const { status, note, exchangeSize } = statusSchema.parse(req.body);
    const ret = await Return.findById(req.params.id);
    if (!ret) throw new HttpError(404, "Return not found");

    const allowed = TRANSITIONS[ret.status];
    if (!allowed.includes(status)) {
      throw new HttpError(
        409,
        `Cannot move from '${ret.status}' to '${status}'`,
        { allowed },
      );
    }
    if (status === "refunded" && ret.type !== "return")
      throw new HttpError(409, "Exchanges cannot be refunded");
    if (status === "exchanged" && ret.type !== "exchange")
      throw new HttpError(409, "Returns cannot be exchanged");

    ret.history.push({
      from: ret.status,
      to: status,
      note,
      by: req.user.email,
    });
    ret.status = status;
    if (exchangeSize) ret.exchangeSize = exchangeSize;
    await ret.save();
    res.json(ret);
  }),
);

module.exports = router;
