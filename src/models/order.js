const { Schema, model } = require("mongoose");

const lineItemSchema = new Schema(
  {
    lineItemId: { type: String, required: true },
    sku: { type: String, required: true },
    title: String,
    size: String,
    quantity: { type: Number, default: 1 },
    price: Number,
  },
  {
    _id: false,
  },
);

const orderSchema = new Schema(
  {
    shopifyId: { type: String, required: true, unique: true },
    orderNumber: { type: String, required: true, unique: true },
    customer: {
      name: String,
      email: { type: String, lowercase: true, trim: true },
      phone: String,
    },
    lineItems: [lineItemSchema],
    orderedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

module.exports = model("Order", orderSchema);
