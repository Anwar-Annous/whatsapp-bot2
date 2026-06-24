-- Migration 007: make contacts/conversations unique per workspace instead of globally
SET @idx := (
  SELECT s.INDEX_NAME
  FROM information_schema.statistics s
  WHERE s.TABLE_SCHEMA = DATABASE()
    AND s.TABLE_NAME = 'contacts'
    AND s.NON_UNIQUE = 0
    AND s.INDEX_NAME <> 'PRIMARY'
  GROUP BY s.INDEX_NAME
  HAVING SUM(s.COLUMN_NAME = 'phone') = 1
     AND SUM(s.COLUMN_NAME = 'workspace_id') = 0
     AND COUNT(*) = 1
  LIMIT 1
);
SET @sql := IF(@idx IS NULL, 'SELECT 1', CONCAT('ALTER TABLE contacts DROP INDEX `', @idx, '`'));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT s.INDEX_NAME
  FROM information_schema.statistics s
  WHERE s.TABLE_SCHEMA = DATABASE()
    AND s.TABLE_NAME = 'conversations'
    AND s.NON_UNIQUE = 0
    AND s.INDEX_NAME <> 'PRIMARY'
  GROUP BY s.INDEX_NAME
  HAVING SUM(s.COLUMN_NAME = 'chat_id') = 1
     AND SUM(s.COLUMN_NAME = 'workspace_id') = 0
     AND COUNT(*) = 1
  LIMIT 1
);
SET @sql := IF(@idx IS NULL, 'SELECT 1', CONCAT('ALTER TABLE conversations DROP INDEX `', @idx, '`'));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT s.INDEX_NAME
  FROM information_schema.statistics s
  WHERE s.TABLE_SCHEMA = DATABASE()
    AND s.TABLE_NAME = 'contacts'
    AND s.NON_UNIQUE = 0
  GROUP BY s.INDEX_NAME
  HAVING SUM(s.COLUMN_NAME = 'phone') = 1
     AND SUM(s.COLUMN_NAME = 'workspace_id') = 1
     AND COUNT(*) = 2
  LIMIT 1
);
SET @sql := IF(@idx IS NULL, 'ALTER TABLE contacts ADD UNIQUE KEY uk_contacts_phone_workspace (phone, workspace_id)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT s.INDEX_NAME
  FROM information_schema.statistics s
  WHERE s.TABLE_SCHEMA = DATABASE()
    AND s.TABLE_NAME = 'conversations'
    AND s.NON_UNIQUE = 0
  GROUP BY s.INDEX_NAME
  HAVING SUM(s.COLUMN_NAME = 'chat_id') = 1
     AND SUM(s.COLUMN_NAME = 'workspace_id') = 1
     AND COUNT(*) = 2
  LIMIT 1
);
SET @sql := IF(@idx IS NULL, 'ALTER TABLE conversations ADD UNIQUE KEY uk_conversations_chat_workspace (chat_id, workspace_id)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
