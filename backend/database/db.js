const mysql = require('mysql2/promise');
const config = require('../config');

const pool = mysql.createPool(Object.assign({
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000,
  timezone: 'Z'
}, config.db));

async function retryQuery(sql, params = []) {
  const maxAttempts = 3;
  let attempt = 0;
  const transientCodes = new Set(['PROTOCOL_CONNECTION_LOST', 'ECONNRESET', 'EPIPE', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']);
  while (true) {
    try {
      const [rows] = await pool.execute(sql, params);
      return rows;
    } catch (err) {
      attempt += 1;
      if (attempt >= maxAttempts || !transientCodes.has(err.code)) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
}

async function query(sql, params = []) {
  return retryQuery(sql, params);
}

async function getConnection() {
  return pool.getConnection();
}

module.exports = {
  query,
  getConnection
};
