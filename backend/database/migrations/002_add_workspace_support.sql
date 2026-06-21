-- 002_add_workspace_support.sql
-- Phase 1: Add multi-tenancy core to existing schema
-- All existing data is assigned to workspace_id = 1

-- 1. Create workspaces table
CREATE TABLE IF NOT EXISTS workspaces (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL DEFAULT 'Workspace Principal',
  phone_number VARCHAR(50),
  status ENUM('active','paused','disconnected','connecting') DEFAULT 'disconnected',
  settings_json TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Seed default workspace (id=1) for all existing data
INSERT INTO workspaces (id, name, phone_number, status) VALUES (1, 'Workspace Principal', '', 'disconnected')
ON DUPLICATE KEY UPDATE name = 'Workspace Principal';

-- 3. Add workspace_id to existing tables
ALTER TABLE contacts ADD COLUMN workspace_id INT DEFAULT 1;
ALTER TABLE conversations ADD COLUMN workspace_id INT DEFAULT 1;
ALTER TABLE messages ADD COLUMN workspace_id INT DEFAULT 1;
ALTER TABLE automations ADD COLUMN workspace_id INT DEFAULT 1;
ALTER TABLE media ADD COLUMN workspace_id INT DEFAULT 1;
ALTER TABLE logs ADD COLUMN workspace_id INT DEFAULT 1;
ALTER TABLE scheduled_messages ADD COLUMN workspace_id INT DEFAULT 1;

-- 4. Update all existing data to belong to workspace 1
UPDATE contacts SET workspace_id = 1 WHERE workspace_id IS NULL OR workspace_id = 0;
UPDATE conversations SET workspace_id = 1 WHERE workspace_id IS NULL OR workspace_id = 0;
UPDATE messages SET workspace_id = 1 WHERE workspace_id IS NULL OR workspace_id = 0;
UPDATE automations SET workspace_id = 1 WHERE workspace_id IS NULL OR workspace_id = 0;
UPDATE media SET workspace_id = 1 WHERE workspace_id IS NULL OR workspace_id = 0;
UPDATE logs SET workspace_id = 1 WHERE workspace_id IS NULL OR workspace_id = 0;
UPDATE scheduled_messages SET workspace_id = 1 WHERE workspace_id IS NULL OR workspace_id = 0;

-- 5. Add foreign key constraints (after data is clean)
ALTER TABLE contacts ADD CONSTRAINT fk_contacts_workspace
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE conversations ADD CONSTRAINT fk_conversations_workspace
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE messages ADD CONSTRAINT fk_messages_workspace
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE automations ADD CONSTRAINT fk_automations_workspace
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE media ADD CONSTRAINT fk_media_workspace
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE logs ADD CONSTRAINT fk_logs_workspace
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE scheduled_messages ADD CONSTRAINT fk_scheduled_workspace
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;

-- 6. Add workspace-scoped indexes for performance
CREATE INDEX idx_contacts_workspace ON contacts(workspace_id);
CREATE INDEX idx_conversations_workspace ON conversations(workspace_id);
CREATE INDEX idx_messages_workspace ON messages(workspace_id);
CREATE INDEX idx_automations_workspace ON automations(workspace_id);
CREATE INDEX idx_media_workspace ON media(workspace_id);
CREATE INDEX idx_logs_workspace ON logs(workspace_id);
CREATE INDEX idx_scheduled_workspace ON scheduled_messages(workspace_id);
