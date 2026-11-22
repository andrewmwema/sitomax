begin;

-- Per-user signature for lead replies. Null means the default built from
-- the sender's name and the website's business details.
alter table public.profiles
  add column email_signature text
    check (email_signature is null or char_length(email_signature) <= 1000);

-- "users update own profile" already limits rows to auth.uid(); 0002
-- restricts which columns may be written.
grant update (email_signature) on public.profiles to authenticated;

commit;
