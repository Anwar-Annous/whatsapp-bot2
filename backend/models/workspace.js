const db = require('../database/db');

async function findById(id) {
  const rows = await db.query('SELECT * FROM workspaces WHERE id = ?', [id]);
  return rows[0] || null;
}

async function findAll() {
  return db.query('SELECT * FROM workspaces ORDER BY created_at DESC');
}

async function create(data) {
  const result = await db.query(
    'INSERT INTO workspaces (name, phone_number, status, settings_json) VALUES (?, ?, ?, ?)',
    [data.name || 'Nouveau Workspace', data.phone_number || '', 'disconnected', JSON.stringify(data.settings || {})]
  );
  return findById(result.insertId);
}

async function update(id, data) {
  const fields = [];
  const values = [];
  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
  if (data.phone_number !== undefined) { fields.push('phone_number = ?'); values.push(data.phone_number); }
  if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
  if (data.settings !== undefined) { fields.push('settings_json = ?'); values.push(JSON.stringify(data.settings)); }
  if (fields.length === 0) return findById(id);
  values.push(id);
  await db.query(`UPDATE workspaces SET ${fields.join(', ')} WHERE id = ?`, values);
  return findById(id);
}

async function remove(id) {
  await db.query('DELETE FROM workspaces WHERE id = ?', [id]);
  return true;
}

async function updateStatus(id, status) {
  await db.query('UPDATE workspaces SET status = ? WHERE id = ?', [status, id]);
}

module.exports = {
  findById,
  findAll,
  create,
  update,
  remove,
  updateStatus
};
