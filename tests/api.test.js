const os = require("os");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret";
process.env.SHOPIFY_WEBHOOK_SECRET = "shpss_test";
process.env.UPLOAD_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), "suhara-uploads-"),
);

const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { connect, mongoose } = require("../src/db");
const { createApp } = require("../src/app");
const User = require("../src/models/users");
const Order = require("../src/models/order");

let mongod;
let app;
let token;

// A 1x1 PNG so we can test real multipart uploads.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function sign(body) {
  return crypto
    .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(body)
    .digest("base64");
}

// Use a real Mongo when TEST_MONGO_URI is set (CI service container, or
// `docker run -p 27017:27017 mongo:7`); otherwise spin up an in-memory one.
beforeAll(async () => {
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    mongod = await MongoMemoryServer.create();
    uri = mongod.getUri();
  }
  await connect(uri);
  await mongoose.connection.dropDatabase();
  app = createApp();
  await User.createWithPassword({
    email: "admin@suhara.test",
    password: "supersecret1",
    role: "admin",
  });
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "admin@suhara.test", password: "supersecret1" });
  token = res.body.token;
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  if (mongod) await mongod.stop();
});

describe("health", () => {
  test("liveness and readiness", async () => {
    await request(app).get("/healthz").expect(200);
    await request(app).get("/readyz").expect(200);
  });
});

describe("auth", () => {
  test("rejects bad password", async () => {
    await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin@suhara.test", password: "wrongpass1" })
      .expect(401);
  });
  test("ops user cannot create users (RBAC)", async () => {
    await request(app)
      .post("/api/v1/auth/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "ops@suhara.test", password: "opspassword", role: "ops" })
      .expect(201);
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ops@suhara.test", password: "opspassword" });
    await request(app)
      .post("/api/v1/auth/users")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ email: "x@suhara.test", password: "whatever12" })
      .expect(403);
  });
  test("staff routes require a token", async () => {
    await request(app).get("/api/v1/returns").expect(401);
  });
});

describe("shopify webhook", () => {
  const payload = JSON.stringify({
    id: 555001,
    order_number: 1042,
    email: "Riya@Example.com",
    created_at: new Date().toISOString(),
    customer: { first_name: "Riya", last_name: "Patel" },
    line_items: [
      {
        id: 9001,
        sku: "SUH-KURTI-MRN",
        title: "Maroon Kurti",
        variant_title: "M / Maroon",
        quantity: 1,
        price: "1499.00",
      },
    ],
  });

  test("rejects an invalid signature", async () => {
    await request(app)
      .post("/api/v1/webhooks/shopify/orders")
      .set("Content-Type", "application/json")
      .set("X-Shopify-Hmac-Sha256", "nope")
      .send(payload)
      .expect(401);
  });

  test("stores the order and is idempotent on retry", async () => {
    for (let i = 0; i < 2; i++) {
      await request(app)
        .post("/api/v1/webhooks/shopify/orders")
        .set("Content-Type", "application/json")
        .set("X-Shopify-Hmac-Sha256", sign(payload))
        .send(payload)
        .expect(200);
    }
    const orders = await Order.find({ orderNumber: "1042" });
    expect(orders).toHaveLength(1);
    expect(orders[0].lineItems[0].size).toBe("M");
    expect(orders[0].customer.email).toBe("riya@example.com");
  });

  test("customer lookup needs the matching email", async () => {
    await request(app)
      .get("/api/v1/orders/1042?email=someone@else.com")
      .expect(404);
    await request(app)
      .get("/api/v1/orders/1042?email=riya@example.com")
      .expect(200);
  });
});

describe("returns lifecycle", () => {
  let returnId;

  test("customer files an exchange with a photo", async () => {
    const res = await request(app)
      .post("/api/v1/returns")
      .field("orderNumber", "1042")
      .field("email", "riya@example.com")
      .field("lineItemId", "9001")
      .field("type", "exchange")
      .field("reason", "size_too_small")
      .field("exchangeSize", "L")
      .attach("photos", PNG, { filename: "fit.png", contentType: "image/png" })
      .expect(201);
    returnId = res.body._id;
    expect(res.body.status).toBe("requested");
    expect(res.body.photos).toHaveLength(1);
    expect(
      fs.existsSync(path.join(process.env.UPLOAD_DIR, res.body.photos[0])),
    ).toBe(true);
  });

  test("duplicate request for the same item is refused", async () => {
    await request(app)
      .post("/api/v1/returns")
      .field("orderNumber", "1042")
      .field("email", "riya@example.com")
      .field("lineItemId", "9001")
      .field("type", "return")
      .field("reason", "other")
      .expect(409);
  });

  test("exchange without exchangeSize fails validation", async () => {
    await request(app)
      .post("/api/v1/returns")
      .field("orderNumber", "1042")
      .field("email", "riya@example.com")
      .field("lineItemId", "9001")
      .field("type", "exchange")
      .field("reason", "other")
      .expect(400);
  });

  test("illegal transition is rejected", async () => {
    const res = await request(app)
      .patch(`/api/v1/returns/${returnId}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "exchanged" })
      .expect(409);
    expect(res.body.details.allowed).toEqual(["approved", "rejected"]);
  });

  test("walks the happy path to exchanged", async () => {
    for (const status of ["approved", "picked_up", "received", "exchanged"]) {
      await request(app)
        .patch(`/api/v1/returns/${returnId}/status`)
        .set("Authorization", `Bearer ${token}`)
        .send({ status, note: `moved to ${status}` })
        .expect(200);
    }
    const res = await request(app)
      .get(`/api/v1/returns/${returnId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.status).toBe("exchanged");
    expect(res.body.history).toHaveLength(5);
  });

  test("paginated list and analytics", async () => {
    const list = await request(app)
      .get("/api/v1/returns?limit=10&page=1")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(list.body.total).toBe(1);
    const stats = await request(app)
      .get("/api/v1/analytics/returns-by-sku")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(stats.body.rows[0]).toMatchObject({
      sku: "SUH-KURTI-MRN",
      size: "M",
      total: 1,
    });
  });

  test("photos are only served to staff", async () => {
    const ret = await request(app)
      .get(`/api/v1/returns/${returnId}`)
      .set("Authorization", `Bearer ${token}`);
    const photo = ret.body.photos[0];
    await request(app).get(`/api/v1/uploads/${photo}`).expect(401);
    await request(app)
      .get(`/api/v1/uploads/${photo}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
  });
});
