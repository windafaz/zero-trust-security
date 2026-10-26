
function allowRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Akses ditolak oleh kebijakan keamanan.",
        reason: "Role pengguna tidak memiliki izin untuk endpoint ini.",
      });
    }

    next();
  };
}

module.exports = { allowRoles };
