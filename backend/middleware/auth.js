function ensureLoggedIn(req, res, next) {
  if (req.session && req.session.user) return next();
  res.status(401).json({ success: false, message: 'غير مسموح، سجل الدخول أولاً' });
}

module.exports = { ensureLoggedIn };
