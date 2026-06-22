-- Migration 005: add video and file types to media.type enum
ALTER TABLE media MODIFY COLUMN type ENUM('image','audio','video','file') NOT NULL;
