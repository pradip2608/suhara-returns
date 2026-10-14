const path = require("path");
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const config = require("./config");
const { notFound, errorHandler } = require("./middleware/error");
const { requireAuth } = require("./middleware/auth");

function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(helmet({ contentSecurityPolicy: false }));

  if (config.env !== "test")
    app.use(morgan(config.env === "production" ? "combined" : "dev"));

  app.use(require("./routes/health"));
  app.use("/api/v1/webhooks", require("./routes/webhooks"));

  app.use(express.json({ limit: "100kb" }));

  app.use("/api/v1/auth", require("./routes/auth"));
  app.use("/api/v1/orders", require("./routes/orders"));
  app.use("/api/v1/returns", require("./routes/returns"));
  app.use("/api/v1/analytics", require("./routes/analytics"));

  app.use(
    "/api/v1/uploads",
    requireAuth,
    express.static(config.uploadDir, { fallthrough: false }),
  );

  const spec = YAML.load(path.join(__dirname, "docs", "openapi.yaml"));

  app.use("/docs", swaggerUi.serve, swaggerUi.setup(spec));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
