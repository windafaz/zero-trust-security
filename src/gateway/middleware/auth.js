
const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {
  const authorization = req.get("Authorization");

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Access token wajib disertakan.",
    });
  }

  const token = authorization.slice(7);

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET,
      { algorithms: ["HS256"] }
    );

    req.user = {
      id: Number(payload.sub),
      role: payload.role,
    };

    return next();
  } catch (error) {
    return res.status(401).json({
      error: "Access token tidak valid atau sudah kedaluwarsa.",
    });
  }
}

module.exports = { authenticateToken };
