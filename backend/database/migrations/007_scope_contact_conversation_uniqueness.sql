-- Migration 007: make contacts/conversations unique per workspace instead of globally.
-- This is intentionally plain SQL for mysql2 migration execution: no PREPARE, EXECUTE, or dynamic SQL.
-- Production logs show the old single-column unique keys are named contacts.phone and conversations.chat_id.

ALTER TABLE contacts DROP INDEX phone;
ALTER TABLE conversations DROP INDEX chat_id;

ALTER TABLE contacts
  ADD UNIQUE KEY uk_contacts_phone_workspace (phone, workspace_id);

ALTER TABLE conversations
  ADD UNIQUE KEY uk_conversations_chat_workspace (chat_id, workspace_id);
