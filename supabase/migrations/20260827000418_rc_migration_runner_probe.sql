-- No-op release-candidate migration runner probe.
-- This was applied live to verify that the Supabase migration connector accepted
-- DDL migrations while rejecting data-only repair statements.

comment on schema public is 'Release candidate migration runner probe - no schema behavior change.';
