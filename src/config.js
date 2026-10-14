function required(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") {
    throw new Error(`Missing required env var : ${name}`);
  }
  return v;
}

const env = process.env.NODE_ENV || "development";

module.exports = {
  env,
  port: Number(process.env.PORT || 8001),
  mongoUri: required(
    "MONGO_URI",
    env === "test" ? "mongodb://unused" : undefined,
  ),
  jwtSecret: required("JWT_SECRET", env === "test" ? "test-secret" : undefined),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
  shopifyWebhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET || "",
  uploadDir: process.env.UPLOAD_DIR || "/app/uploads",
  maxPhotoMb: Number(process.env.MAX_PHOTO_MB || 5),
  returnWindowDays: Number(process.env.RETURN_WINDOW_DAYS || 7),
};
