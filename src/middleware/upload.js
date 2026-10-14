const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const config = require("../config");
const { HttpError } = require("./error");

// Photos land in UPLOAD_DIR — a Docker named volume locally, a PVC in Kubernetes.
// That's what keeps them alive when the container is replaced.
const ALLOWED = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(config.uploadDir, "returns");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    cb(
      null,
      `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ALLOWED[file.mimetype]}`,
    );
  },
});

const uploadPhotos = multer({
  storage,
  limits: { fileSize: config.maxPhotoMb * 1024 * 1024, files: 4 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED[file.mimetype])
      return cb(
        new HttpError(400, "Only JPEG, PNG or WEBP photos are allowed"),
      );
    cb(null, true);
  },
}).array("photos", 4);

module.exports = { uploadPhotos };
