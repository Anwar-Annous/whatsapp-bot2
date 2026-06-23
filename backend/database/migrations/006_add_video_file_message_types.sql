-- Migration 006: allow video/file records in message history and scheduled automation
ALTER TABLE messages MODIFY COLUMN type ENUM('text','image','audio','video','file') DEFAULT 'text';
ALTER TABLE scheduled_messages MODIFY COLUMN type ENUM('text','image','audio','video','file') NOT NULL;
