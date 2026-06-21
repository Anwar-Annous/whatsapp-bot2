-- 003_add_users_and_members.sql
-- Multi-user support with workspace membership
-- The users table already exists from schema.sql with: password (not password_hash)

-- 1. Alter existing users table to add new columns
ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) AFTER password;
ALTER TABLE users ADD COLUMN role ENUM('admin','manager','agent') DEFAULT 'agent' AFTER password_hash;
ALTER TABLE users ADD COLUMN is_active TINYINT(1) DEFAULT 1 AFTER role;

-- 2. Migrate existing password to password_hash (bcrypt migration placeholder)
UPDATE users SET password_hash = CONCAT('$2a$10$', password), role = 'admin' WHERE password_hash IS NULL OR password_hash = '';

-- 3. After migration, the old 'password' column can be kept for backward compatibility
--    or dropped later in a separate migration. We keep it for now.

-- 4. Create workspace membership table
CREATE TABLE IF NOT EXISTS workspace_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  workspace_id INT NOT NULL,
  role ENUM('owner','admin','agent') DEFAULT 'agent',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE KEY uk_user_workspace (user_id, workspace_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Auto-assign admin user to default workspace as owner
INSERT INTO workspace_members (user_id, workspace_id, role)
SELECT u.id, 1, 'owner' FROM users u WHERE u.email = 'admin@example.com'
ON DUPLICATE KEY UPDATE role = 'owner';
