const router = require("express").Router();
const Order = require("../models/order");
const { HttpError, asyncHandler } = require("../middleware/error");

router.get(
  "/:orderNumber",
  asyncHandler(async (req, res) => {
    const email = String(req.query.email || "")
      .toLowerCase()
      .trim();
    if (!email) throw new HttpError(400, "email query parameter is required");
    const order = await Order.findOne({
      orderNumber: req.params.orderNumber,
      "customer.email": email,
    }).lean();
    if (!order) throw new HttpError(404, "Order not found");
    res.json(order);
  }),
);

module.exports = router;
