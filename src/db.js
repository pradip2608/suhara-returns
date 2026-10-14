const mongoose = require("mongoose");

async function connect(uri) {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  return mongoose.connection;
}

// Used by /readyz: the pod is only "ready" when Mongo answers a ping.
async function isHealthy() {
  if (mongoose.connection.readyState !== 1) return false;
  try {
    await mongoose.connection.db.admin().ping();
    return true;
  } catch {
    return false;
  }
}

module.exports = { connect, isHealthy, mongoose };
