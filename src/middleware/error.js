const { ZodError, z } = require("zod");
const multer = require("multer");

class HttpError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve()
    .then(() => fn(req, res, next))
    .catch(next);
};

function notFound(_req, _res, next) {
  next(new HttpError(404, "Route Not Found"));
}

function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      message: "Validation failed",
      details: z.treeifyError(err),
    });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      message: "File upload error",
      details: err.message,
    });
  }
  if (err.name === "CastError") {
    return res.status(400).json({
      message: "Invalid ID format",
      details: err.message,
    });
  }
  if (err.code === 11000) {
    return res.status(400).json({
      message: "Duplicate key error",
      details: err.message,
    });
  }
  const statusCode = err.statusCode || 500;
  if (statusCode >= 500) console.error(err);
  res.status(statusCode).json({
    message: statusCode >= 500 ? "Internal Server Error" : err.message,
    details: err.details,
  });
}

module.exports = { HttpError, asyncHandler, notFound, errorHandler };
