---
name: neko-supabase-nusgntkunatwpkrmhzfp
description: Use when any task involves Supabase, PostgreSQL, database schema, migrations, RLS, Auth, Storage, Realtime, Edge Functions, SQL, tables, indexes, triggers or performance in this project.
---

# Supabase project

This folder is connected to Supabase project `nusgntkunatwpkrmhzfp` through MCP server `neko_supabase_nusgntkunatwpkrmhzfp`.

- Use the Supabase MCP tools automatically for database and platform operations.
- Inspect existing tables and migrations before changing the schema.
- Prefer named migrations for DDL changes so schema history remains auditable.
- Always enable and review Row Level Security (RLS) for application tables.
- Never request or write a secret key, service_role key, database password or access token into the project.
- Ask the user for explicit confirmation before DROP, TRUNCATE, destructive ALTER, mass DELETE/UPDATE, branch reset or any irreversible operation.
- Ask before deleting, resetting, merging or rebasing a database branch.
- After changes, check security and performance advisors when relevant.
