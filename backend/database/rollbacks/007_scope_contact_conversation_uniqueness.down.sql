-- Rollback for migration 007.
-- Warning: this rollback will fail if duplicate phone/chat_id values exist across workspaces.
ALTER TABLE contacts DROP INDEX uk_contacts_phone_workspace;
ALTER TABLE conversations DROP INDEX uk_conversations_chat_workspace;
ALTER TABLE contacts ADD UNIQUE KEY phone (phone);
ALTER TABLE conversations ADD UNIQUE KEY chat_id (chat_id);
