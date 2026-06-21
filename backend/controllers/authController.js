const config = require('../config');

async function login(req, res) {
  const { email, password } = req.body;
  if (email === config.authUser.email && password === config.authUser.password) {
    req.session.user = { email };
    return res.json({ success: true, message: 'تم تسجيل الدخول بنجاح' });
  }
  return res.status(401).json({ success: false, message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
}

async function logout(req, res) {
  if (req.session) {
    req.session.destroy(() => {});
  }
  res.json({ success: true, message: 'تم تسجيل الخروج' });
}

async function status(req, res) {
  res.json({ authenticated: !!(req.session && req.session.user) });
}

module.exports = { login, logout, status };
