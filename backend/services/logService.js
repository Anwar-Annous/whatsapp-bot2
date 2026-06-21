const db = require('../database/db');

async function create(level, event, details, workspaceId = 1) {
  try {
    await db.query('INSERT INTO logs (level, event, details, workspace_id) VALUES (?, ?, ?, ?)', [level, event, details || '', workspaceId]);
  } catch (error) {
    console.warn('Log write failed:', error.message);
  }
}

async function list(limit = 100, workspaceId = null) {
  try {
    let sql = 'SELECT * FROM logs';
    const params = [];
    if (workspaceId) {
      sql += ' WHERE workspace_id = ?';
      params.push(workspaceId);
    }
    sql += ` ORDER BY created_at DESC LIMIT ${Number(limit || 100)}`;
    return db.query(sql, params);
  } catch (error) {
    console.warn('Log read failed:', error.message);
    return [];
  }
}

module.exports = { create, list };
