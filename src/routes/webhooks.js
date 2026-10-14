const crypto = require("crypto");
const express = require("express");
const config = require("../config");
const Order = require("../models/order");
const { HttpError, asyncHandler } = require("../middleware/error");

const router = express.Router();

function verifyShopifyHmac(req) {
  if (!config.shopifyWebhookSecret)
    throw new HttpError(500, "Webhook secret not configured");

  const received = req.get("X-Shopify-Hmac-Sha256") || "";
  const expected = crypto
    .createHmac("sha256", config.shopifyWebhookSecret)
    .update(req.body)
    .digest("base64");

  const a = Buffer.from(received);
  const b = Buffer.from(expected);

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new HttpError(401, "Invalid Webhook Signature");
  }
}

function extractSize(li) {
  if (li.variant_title) return li.variant_title.split("/")[0].trim();
  return undefined;
}

router.post(
  "/shopify/orders",
  express.raw({ type: "application/json", limit: "1mb" }),
  asyncHandler(async (req, res) => {
    verifyShopifyHmac(req);
    const o = JSON.parse(req.body.toString("utf8"));

    const doc = {
      shopifyId: String(o.id),
      orderNumber: String(o.order_number ?? o.name?.replace("#", "")),
      customer: {
        name: [o.customer?.first_name, o.customer?.last_name]
          .filter(Boolean)
          .join(" "),
        email: o.email || o.customer?.email,
        phone: o.phone || o.customer?.phone,
      },
      lineItems: (o.line_items || []).map((li) => ({
        lineItemId: String(li.id),
        sku: li.sku || `variant-${li.variant_id}`,
        title: li.title,
        size: extractSize(li),
        quantity: li.quantity,
        price: Number(li.price),
      })),
      orderedAt: new Date(o.created_at || Date.now()),
    };

    await Order.findOneAndUpdate({ shopifyId: doc.shopifyId }, doc, {
      upsert: true,
      returnDocument: "after",
      runValidators: true,
      // new: true,
    });
    res.status(200).json({ ok: true });
  }),
);

module.exports = router;
