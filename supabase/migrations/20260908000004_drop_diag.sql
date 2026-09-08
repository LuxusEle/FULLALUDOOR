-- Remove the one-time pgsodium diagnostic function now that verification works.
drop function if exists public.diag_pgsodium();
