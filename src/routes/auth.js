const router = require("express").Router();
const { z } = require("zod");
const User = require("../models/users");
const { signToken, requireAuth, requireRole } = require("../middleware/auth");
const { HttpError, asyncHandler } = require("../middleware/error");

const credentials = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = credentials.parse(req.body);
    const user = await User.findOne({ email: email.toLowerCase() });
    // Same message for "no user" and "wrong password" — don't leak which emails exist.
    if (!user || !(await user.verifyPassword(password)))
      throw new HttpError(401, "Invalid email or password");
    res.json({ token: signToken(user), user });
  }),
);

// Admins can create ops accounts (e.g. for your business partner).
router.post(
  "/users",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const body = credentials
      .extend({ role: z.enum(["admin", "ops"]).default("ops") })
      .parse(req.body);
    const user = await User.createWithPassword(body);
    res.status(201).json(user);
  }),
);

router.get("/me", requireAuth, (req, res) => res.json(req.user));

module.exports = router;
