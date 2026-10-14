const config = require("./config");
const { connect, mongoose } = require("./db");
const { createApp } = require("./app");

async function main() {
  await connect(config.mongoUri);
  console.log("Connected to MongoDB");

  const server = createApp().listen(config.port, () => {
    console.log(
      `SUHARA Return Desk API listening on port : ${config.port} (${config.env})`,
    );
  });

  const shutdown = (signal) => {
    console.log(`Received ${signal}. Shutting down...`);
    server.close(async () => {
      await mongoose.connection.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("Error starting server:", err);
  process.exit(1);
});
