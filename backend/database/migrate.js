const fs = require('fs');
const path = require('path');
const db = require('./db');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function getAppliedMigrations() {
  const rows = await db.query('SELECT filename FROM schema_migrations ORDER BY id');
  return new Set(rows.map(r => r.filename));
}

function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
}

async function runMigration(filename) {
  const filepath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(filepath, 'utf8');
  const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const stmt of statements) {
      try {
        await conn.execute(stmt + ';');
      } catch (err) {
        const lowerStmt = stmt.toLowerCase();
        const ignorableMissingDrop = err.code === 'ER_CANT_DROP_FIELD_OR_KEY' && lowerStmt.includes('drop index');
        const ignorableDuplicateIndex = err.code === 'ER_DUP_KEYNAME' && lowerStmt.includes('add unique key');
        if (ignorableMissingDrop || ignorableDuplicateIndex) {
          console.warn(`  ! ${filename}: ignored idempotent index error: ${err.message}`);
          continue;
        }
        throw err;
      }
    }
    await conn.execute('INSERT INTO schema_migrations (filename) VALUES (?)', [filename]);
    await conn.commit();
    console.log(`  ✓ ${filename}`);
  } catch (err) {
    await conn.rollback();
    console.error(`  ✗ ${filename} FAILED: ${err.message}`);
    throw err;
  } finally {
    conn.release();
  }
}

async function migrate(dryRun = false) {
  console.log('Migration runner starting...');
  await ensureMigrationsTable();

  const applied = await getAppliedMigrations();
  const files = getMigrationFiles();

  let pending = files.filter(f => !applied.has(f));
  if (pending.length === 0) {
    console.log('No pending migrations. Database is up to date.');
    return;
  }

  console.log(`Found ${pending.length} pending migration(s):`);
  for (const filename of pending) {
    if (dryRun) {
      console.log(`  [dry-run] ${filename}`);
      continue;
    }
    await runMigration(filename);
  }
  console.log('Migration complete.');
}

async function rollback() {
  // Simple rollback: remove last migration and re-run
  const rows = await db.query('SELECT filename FROM schema_migrations ORDER BY id DESC LIMIT 1');
  if (!rows.length) {
    console.log('No migrations to rollback.');
    return;
  }
  const filename = rows[0].filename;
  await db.query('DELETE FROM schema_migrations WHERE filename = ?', [filename]);
  console.log(`Rolled back migration: ${filename}`);
  console.log('Note: SQL rollback files must be applied manually if data was changed.');
}

module.exports = { migrate, rollback };

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  migrate(dryRun).catch(err => {
    console.error('Migration failed:', err.message);
    process.exit(1);
  });
}
