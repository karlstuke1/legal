-- Enable pg_cron and pg_net extensions for scheduled cleanup
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Index on usage_ledger for quota queries
CREATE INDEX IF NOT EXISTS idx_usage_ledger_workspace_created ON public.usage_ledger (workspace_id, created_at DESC);

-- Index on rate_limit_log for cleanup and lookups
CREATE INDEX IF NOT EXISTS idx_rate_limit_log_created ON public.rate_limit_log (created_at);

-- Index on messages for chat_id + created_at ordering
CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON public.messages (chat_id, created_at DESC);

-- Index on chats for sidebar listing
CREATE INDEX IF NOT EXISTS idx_chats_workspace_updated ON public.chats (workspace_id, updated_at DESC);