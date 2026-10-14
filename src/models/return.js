const { Schema, model } = require("mongoose");

const STATUSES = [
  "requested",
  "approved",
  "rejected",
  "picked_up",
  "received",
  "refunded",
  "exchanged",
];
const REASONS = [
  "size_too_small",
  "size_too_large",
  "color_mismatch",
  "damaged",
  "not_as_described",
  "other",
];
const TYPES = ["return", "exchange"];

const TRANSITIONS = {
  requested: ["approved", "rejected"],
  approved: ["picked_up", "rejected"],
  picked_up: ["received"],
  received: ["refunded", "exchanged"],
  rejected: [],
  refunded: [],
  exchanged: [],
};

const historySchema = new Schema(
  {
    from: String,
    to: { type: String, required: true },
    note: String,
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const returnSchema = new Schema(
  {
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    orderNumber: { type: String, required: true },
    lineItemId: { type: String, required: true },
    sku: { type: String, required: true },
    size: String,
    type: { type: String, enum: TYPES, required: true },
    reason: { type: String, enum: REASONS, required: true },
    comment: { type: String, maxlength: 1000 },
    exchangeSize: String,
    photos: [{ type: String }], // relative paths under UPLOAD_DIR
    status: { type: String, enum: STATUSES, default: "requested" },
    history: [historySchema],
  },
  { timestamps: true },
);

returnSchema.index({ status: 1, createdAt: -1 });
returnSchema.index({ orderNumber: 1, lineItemId: 1 });

module.exports = model("Return", returnSchema);
module.exports.STATUSES = STATUSES;
module.exports.REASONS = REASONS;
module.exports.TYPES = TYPES;
module.exports.TRANSITIONS = TRANSITIONS;
