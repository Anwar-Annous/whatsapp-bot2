CREATE DATABASE IF NOT EXISTS whatsappcrm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE whatsappcrm;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(100) DEFAULT 'المشرف',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS contacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) DEFAULT '',
  phone VARCHAR(50) NOT NULL UNIQUE,
  tags VARCHAR(255) DEFAULT '',
  notes TEXT,
  last_interaction DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS conversations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  chat_id VARCHAR(128) NOT NULL UNIQUE,
  contact_id INT,
  status ENUM('New','Seen','Closed') DEFAULT 'New',
  unread_count INT DEFAULT 0,
  last_message TEXT,
  label VARCHAR(50) DEFAULT 'Client',
  last_at DATETIME,
  automation_last_run_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  sender ENUM('client','admin','system') DEFAULT 'client',
  body TEXT,
  type ENUM('text','image','audio','file') DEFAULT 'text',
  media_path VARCHAR(255),
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  direction ENUM('in','out') DEFAULT 'in',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS automations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  enabled TINYINT(1) DEFAULT 1,
  steps_json TEXT,
  cooldown_hours INT DEFAULT 24,
  trigger_mode ENUM('first_message','every_message','cooldown') DEFAULT 'first_message',
  last_run_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS scheduled_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  chat_id VARCHAR(128) NOT NULL,
  type ENUM('text','image','audio') NOT NULL,
  text TEXT,
  media_id INT,
  scheduled_at DATETIME NOT NULL,
  status ENUM('pending','sent','failed') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS media (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type ENUM('image','audio','video','file') NOT NULL,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  path VARCHAR(255) NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  level ENUM('info','warning','error') DEFAULT 'info',
  event VARCHAR(255) NOT NULL,
  details TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  `key` VARCHAR(128) NOT NULL UNIQUE,
  `value` TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO users (email, password, name) VALUES ('admin@example.com', 'admin123', 'المشرف');
INSERT IGNORE INTO automations (enabled, steps_json, cooldown_hours) VALUES (1, JSON_ARRAY(JSON_OBJECT('type','image','media_id',NULL), JSON_OBJECT('type','audio','media_id',NULL), JSON_OBJECT('type','text','text','مرحبا بك، شكرا لتواصلك معنا!')), 24);
