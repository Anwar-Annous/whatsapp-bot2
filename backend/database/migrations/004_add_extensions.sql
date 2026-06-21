-- 004_add_extensions.sql
-- API keys, message retries, webhooks, campaign jobs

CREATE TABLE IF NOT EXISTS api_keys (
  id INT AUTO_INCREMENT PRIMARY KEY,
  workspace_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  key_hash VARCHAR(255) NOT NULL,
  permissions JSON,
  last_used_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS message_retries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  message_id INT NOT NULL,
  attempt_number INT DEFAULT 1,
  error TEXT,
  status ENUM('pending','retrying','failed','success') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS webhooks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  workspace_id INT NOT NULL,
  url VARCHAR(512) NOT NULL,
  events JSON,
  secret VARCHAR(255),
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS campaign_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  workspace_id INT NOT NULL,
  name VARCHAR(255) DEFAULT 'Campaign',
  contact_ids JSON,
  text TEXT,
  status ENUM('pending','running','completed','failed','cancelled') DEFAULT 'pending',
  progress INT DEFAULT 0,
  total INT DEFAULT 0,
  error TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS campaign_job_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  contact_id INT NOT NULL,
  phone VARCHAR(50) NOT NULL,
  status ENUM('pending','sent','failed') DEFAULT 'pending',
  error TEXT,
  sent_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES campaign_jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
