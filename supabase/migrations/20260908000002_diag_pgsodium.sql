-- Diagnostic: is the pgsodium Ed25519 verifier available and working?
-- Read-only check. Returns {schema, verify_fn, rfc8032_vector_ok}.
create or replace function public.diag_pgsodium()
returns jsonb
language plpgsql
security definer
set search_path = public, pgsodium
as $$
declare
  v_schema boolean;
  v_fn boolean;
  v_vector boolean;
begin
  select exists(select 1 from pg_namespace where nspname = 'pgsodium') into v_schema;

  select exists(
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'pgsodium' and p.proname = 'crypto_sign_verify_detached'
  ) into v_fn;

  if v_fn then
    begin
      v_vector := pgsodium.crypto_sign_verify_detached(
        decode('e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b', 'hex'),
        ''::bytea,
        decode('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a', 'hex')
      );
    exception when others then
      v_vector := false;
    end;
  else
    v_vector := false;
  end if;

  return jsonb_build_object('schema', v_schema, 'verify_fn', v_fn, 'rfc8032_vector_ok', v_vector);
end;
$$;

revoke all on function public.diag_pgsodium() from public;
grant execute on function public.diag_pgsodium() to anon, authenticated;
