const bcrypt = require("bcryptjs");
const db = require("./db");

function seedAdminFromEnv() {
  const user = (process.env.ADMIN_USER || "").trim();
  const password = process.env.ADMIN_PASSWORD || "";
  if (!user || !password) return { seeded: false, reason: "missing" };
  const admins = db.getAdmins();
  if (admins.length > 0) return { seeded: false, reason: "exists" };
  const hash = bcrypt.hashSync(password, 12);
  db.saveAdmins([
    {
      id: "admin-1",
      username: user.toLowerCase(),
      passwordHash: hash,
      createdAt: new Date().toISOString(),
      role: "owner",
    },
  ]);
  return { seeded: true, username: user.toLowerCase() };
}

function findAdmin(username) {
  return db
    .getAdmins()
    .find((a) => a.username.toLowerCase() === String(username).toLowerCase());
}

function verify(username, password) {
  const admin = findAdmin(username);
  if (!admin) return null;
  if (!bcrypt.compareSync(password, admin.passwordHash)) return null;
  return { id: admin.id, username: admin.username, role: admin.role };
}

function requireAuth(req, res, next) {
  if (req.session && req.session.admin) return next();
  return res.status(401).json({ error: "Não autorizado." });
}

function createAdmin(username, password) {
  const name = String(username || "")
    .trim()
    .toLowerCase();
  if (!name || name.length < 3) throw new Error("Usuario deve ter ao menos 3 caracteres.");
  if (!password || password.length < 8) throw new Error("Senha deve ter ao menos 8 caracteres.");
  if (findAdmin(name)) throw new Error("Este usuario ja existe.");
  const admins = db.getAdmins();
  const item = {
    id: "admin-" + Date.now(),
    username: name,
    passwordHash: bcrypt.hashSync(password, 12),
    createdAt: new Date().toISOString(),
    role: "admin",
  };
  admins.push(item);
  db.saveAdmins(admins);
  return { id: item.id, username: item.username, role: item.role };
}

function changePassword(adminId, currentPassword, newPassword) {
  const admins = db.getAdmins();
  const idx = admins.findIndex((a) => a.id === adminId);
  if (idx === -1) throw new Error("Administrador não encontrado.");
  if (!bcrypt.compareSync(currentPassword, admins[idx].passwordHash)) {
    throw new Error("Senha atual incorreta.");
  }
  if (!newPassword || newPassword.length < 8) {
    throw new Error("A nova senha deve ter ao menos 8 caracteres.");
  }
  admins[idx].passwordHash = bcrypt.hashSync(newPassword, 12);
  admins[idx].updatedAt = new Date().toISOString();
  db.saveAdmins(admins);
  return true;
}

function listPublicAdmins() {
  return db.getAdmins().map((a) => ({
    id: a.id,
    username: a.username,
    role: a.role,
    createdAt: a.createdAt,
  }));
}

module.exports = {
  seedAdminFromEnv,
  findAdmin,
  verify,
  requireAuth,
  createAdmin,
  changePassword,
  listPublicAdmins,
};
