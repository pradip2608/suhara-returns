// Idempotent bootstrap: syncs indexes and creates the first admin.
// Runs as `npm run seed` locally, or as a Kubernetes Job on first deploy.
const config = require("../config");
const { connect, mongoose } = require("../db");
const User = require("../models/users");
const Order = require("../models/order");
const Return = require("../models/return");

async function main() {
  await connect(config.mongoUri);

  await Promise.all([
    User.syncIndexes(),
    Order.syncIndexes(),
    Return.syncIndexes(),
  ]);
  console.log("Indexes synced");

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password)
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required");

  if (await User.exists({ email: email.toLowerCase() })) {
    console.log(`Admin ${email} already exists — skipping`);
  } else {
    await User.createWithPassword({ email, password, role: "admin" });
    console.log(`Created admin ${email}`);
  }

  if (process.env.SEED_DEMO_ORDER === "true") {
    await Order.findOneAndUpdate(
      { shopifyId: "demo-1001" },
      {
        shopifyId: "demo-1001",
        orderNumber: "1001",
        customer: { name: "Demo Customer", email: "demo@example.com" },
        lineItems: [
          {
            lineItemId: "li-1",
            sku: "SUH-KURTI-MRN",
            title: "Maroon Bandhani Kurti",
            size: "M",
            quantity: 1,
            price: 1499,
          },
          {
            lineItemId: "li-2",
            sku: "SUH-DUP-YLW",
            title: "Yellow Leheriya Dupatta",
            size: "Free",
            quantity: 1,
            price: 799,
          },
        ],
        orderedAt: new Date(),
      },
      { upsert: true, returnDocument: "after", runValidators: true },
    );
    console.log("Demo order #1001 (demo@example.com) seeded");
  }

  await mongoose.connection.close();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
