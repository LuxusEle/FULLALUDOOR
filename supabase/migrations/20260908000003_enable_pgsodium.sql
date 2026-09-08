-- Try to enable the pgsodium extension (required for Ed25519 verification).
create extension if not exists pgsodium;
