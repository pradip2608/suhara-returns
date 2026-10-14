const jwt = require("jsonwebtoken");
const config = require("../config");
const { HttpError } = require("./error");

function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), email: user.email, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn },
  );
}

function requireAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token)
    return next(new HttpError(401, "Missing bearer token"));
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    next(new HttpError(401, "Invalid or expired token"));
  }
}

function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new HttpError(401, "Not authenticated"));
    if (!roles.includes(req.user.role))
      return next(new HttpError(403, "Insufficient roles"));
    next();
  };
}

module.exports = {
  signToken,
  requireAuth,
  requireRole,
};
