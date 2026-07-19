-- =====================================================================
-- Oron Union — Real backend schema (member accounts, elections, Hall of Fame)
--
-- Run this ONCE in the Supabase SQL editor for this project
-- (https://supabase.com/dashboard/project/tmidqbxwgkeqtkuppauh/sql/new).
-- It is safe to re-run: every statement uses IF NOT EXISTS / OR REPLACE /
-- ON CONFLICT DO NOTHING where it matters.
--
-- After running this, open the "app_config" section at the bottom and
-- change the admin/endorser codes if you want something other than the
-- site's existing demo codes.
-- =====================================================================

create extension if not exists pgcrypto;

-- =====================================================================
-- 1. MEMBER ACCOUNTS
-- =====================================================================

create table if not exists public.member_profiles (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  ref            text unique not null default ('APP-' || lpad((floor(random()*900000)+100000)::text, 6, '0')),
  member_id      text unique,
  title          text,
  firstname      text,
  middlename     text,
  lastname       text,
  dob            date,
  gender         text,
  marital        text,
  placeofbirth   text,
  nationality    text,
  lga            text,
  clan           text,
  compound       text,
  state_origin   text,
  by_birth       text,
  connection     text,
  phone          text,
  whatsapp       text,
  email          text,
  country        text,
  state_res      text,
  address        text,
  qualification  text,
  field          text,
  occupation     text,
  employer       text,
  bio            text,
  photo          text,               -- base64 data URL (kept simple; move to Supabase Storage later if this gets large)
  endorser_type  text,
  endorser_lga   text,
  status         text not null default 'pending' check (status in ('pending','approved','rejected')),
  reject_reason  text,
  approved_at    timestamptz,
  submitted_at   timestamptz not null default now()
);

alter table public.member_profiles enable row level security;

drop policy if exists "member reads own profile" on public.member_profiles;
create policy "member reads own profile" on public.member_profiles
  for select using (auth.uid() = user_id);

-- No public INSERT/UPDATE policy: submission goes through
-- submit_member_application() below (it takes an explicit user_id rather
-- than relying on auth.uid(), since Supabase Auth may require email
-- confirmation before a session exists right after signUp()). Status/
-- member_id changes only happen via admin_review_member/endorser_review_member.

create or replace function public.submit_member_application(p_user_id uuid, profile jsonb)
returns public.member_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.member_profiles;
begin
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Invalid account';
  end if;
  if exists (select 1 from public.member_profiles where user_id = p_user_id) then
    raise exception 'An application already exists for this account';
  end if;

  insert into public.member_profiles (
    user_id, title, firstname, middlename, lastname, dob, gender, marital,
    placeofbirth, nationality, lga, clan, compound, state_origin, by_birth, connection,
    phone, whatsapp, email, country, state_res, address, qualification, field, occupation,
    employer, bio, photo, endorser_type, endorser_lga
  ) values (
    p_user_id,
    profile->>'title', profile->>'firstname', profile->>'middlename', profile->>'lastname',
    nullif(profile->>'dob','')::date, profile->>'gender', profile->>'marital',
    profile->>'placeofbirth', profile->>'nationality', profile->>'lga', profile->>'clan', profile->>'compound',
    profile->>'stateOrigin', profile->>'byBirth', profile->>'connection',
    profile->>'phone', profile->>'whatsapp', profile->>'email', profile->>'country',
    profile->>'stateRes', profile->>'address', profile->>'qualification', profile->>'field',
    profile->>'occupation', profile->>'employer', profile->>'bio', profile->>'photo',
    profile->>'endorserType', profile->>'endorserLga'
  )
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.submit_member_application(uuid, jsonb) to anon, authenticated;

-- Public, PII-free count of approved members, used for participation
-- stats on the Elections page (a plain SELECT on member_profiles is
-- blocked for other users' rows, so this aggregate view is how the
-- public UI can still show "X of Y members voted").
create or replace view public.member_stats as
  select count(*) filter (where status = 'approved')::int as approved_count
  from public.member_profiles;

grant select on public.member_stats to anon, authenticated;

-- Lookup used by the Elections login form so members can sign in with
-- either their email or their Member ID (Supabase Auth itself only signs
-- in by email).
create or replace function public.lookup_email_by_member_id(p_member_id text)
returns text
language sql
security definer
set search_path = public
as $$
  select email from public.member_profiles where member_id = p_member_id limit 1;
$$;

grant execute on function public.lookup_email_by_member_id(text) to anon, authenticated;

-- =====================================================================
-- 2. APP CONFIG (admin / endorser access codes)
-- =====================================================================

create table if not exists public.app_config (
  key   text primary key,
  value text not null
);

alter table public.app_config enable row level security;
-- Intentionally NO policies: this table is unreadable/unwritable by anon
-- or authenticated roles. Only SECURITY DEFINER functions below can see it.

insert into public.app_config (key, value) values
  ('admin_code_hash',    crypt('oron1925', gen_salt('bf'))),
  ('endorser_code_hash', crypt('oron1925', gen_salt('bf')))
on conflict (key) do nothing;

create or replace function public._check_admin_code(p_code text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select value from public.app_config where key = 'admin_code_hash') = crypt(p_code, (select value from public.app_config where key = 'admin_code_hash')),
    false
  );
$$;

create or replace function public._check_endorser_code(p_code text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select value from public.app_config where key = 'endorser_code_hash') = crypt(p_code, (select value from public.app_config where key = 'endorser_code_hash')),
    false
  );
$$;

-- =====================================================================
-- 3. MEMBER REVIEW (admin + endorser)
-- =====================================================================

create or replace function public._generate_member_id(p_lga text)
returns text
language plpgsql
as $$
declare
  v_code text;
  v_id   text;
  v_tries int := 0;
begin
  v_code := case p_lga
    when 'Oron' then 'ORN'
    when 'Urueoffong/Oruko' then 'URO'
    when 'Okobo' then 'OKB'
    when 'Mbo' then 'MBO'
    when 'Udunguko' then 'UDG'
    else 'GEN'
  end;
  loop
    v_id := 'OU-' || extract(year from now())::text || '-' || v_code || '-' || lpad((floor(random()*9000)+1000)::text, 4, '0');
    exit when not exists (select 1 from public.member_profiles where member_id = v_id) or v_tries > 5;
    v_tries := v_tries + 1;
  end loop;
  return v_id;
end;
$$;

create or replace function public.admin_list_members(p_admin_code text)
returns setof public.member_profiles
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._check_admin_code(p_admin_code) then
    raise exception 'Invalid admin code';
  end if;
  return query select * from public.member_profiles order by submitted_at desc;
end;
$$;

create or replace function public.admin_review_member(p_ref text, p_decision text, p_reason text, p_admin_code text)
returns public.member_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.member_profiles;
begin
  if not public._check_admin_code(p_admin_code) then
    raise exception 'Invalid admin code';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'Invalid decision';
  end if;

  if p_decision = 'approved' then
    update public.member_profiles
      set status = 'approved', member_id = public._generate_member_id(lga), approved_at = now(), reject_reason = null
      where ref = p_ref
      returning * into v_row;
  else
    update public.member_profiles
      set status = 'rejected', reject_reason = p_reason
      where ref = p_ref
      returning * into v_row;
  end if;

  if v_row.user_id is null then
    raise exception 'Application not found';
  end if;
  return v_row;
end;
$$;

create or replace function public.endorser_list_members(p_endorser_code text)
returns setof public.member_profiles
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._check_endorser_code(p_endorser_code) then
    raise exception 'Invalid access code';
  end if;
  return query select * from public.member_profiles order by submitted_at desc;
end;
$$;

create or replace function public.endorser_review_member(p_ref text, p_decision text, p_reason text, p_endorser_code text)
returns public.member_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.member_profiles;
begin
  if not public._check_endorser_code(p_endorser_code) then
    raise exception 'Invalid access code';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'Invalid decision';
  end if;

  if p_decision = 'approved' then
    update public.member_profiles
      set status = 'approved', member_id = public._generate_member_id(lga), approved_at = now(), reject_reason = null
      where ref = p_ref
      returning * into v_row;
  else
    update public.member_profiles
      set status = 'rejected', reject_reason = p_reason
      where ref = p_ref
      returning * into v_row;
  end if;

  if v_row.user_id is null then
    raise exception 'Application not found';
  end if;
  return v_row;
end;
$$;

grant execute on function public.admin_list_members(text) to anon, authenticated;
grant execute on function public.admin_review_member(text,text,text,text) to anon, authenticated;
grant execute on function public.endorser_list_members(text) to anon, authenticated;
grant execute on function public.endorser_review_member(text,text,text,text) to anon, authenticated;

-- =====================================================================
-- 4. ELECTIONS
-- =====================================================================

create table if not exists public.elections (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  title       text not null,
  description text,
  deadline    timestamptz,
  status      text not null default 'active' check (status in ('active','closed')),
  created_at  timestamptz not null default now()
);

create table if not exists public.election_candidates (
  id          uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  name        text not null,
  role        text,
  initials    text,
  color       text default '#800020',
  sort_order  int default 0
);

create table if not exists public.election_votes (
  id           uuid primary key default gen_random_uuid(),
  election_id  uuid not null references public.elections(id) on delete cascade,
  candidate_id uuid not null references public.election_candidates(id) on delete cascade,
  member_id    uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (election_id, member_id)
);

alter table public.elections enable row level security;
alter table public.election_candidates enable row level security;
alter table public.election_votes enable row level security;

drop policy if exists "public reads elections" on public.elections;
create policy "public reads elections" on public.elections for select using (true);

drop policy if exists "public reads candidates" on public.election_candidates;
create policy "public reads candidates" on public.election_candidates for select using (true);

drop policy if exists "member reads own votes" on public.election_votes;
create policy "member reads own votes" on public.election_votes
  for select using (auth.uid() = member_id);

drop policy if exists "approved member casts vote" on public.election_votes;
create policy "approved member casts vote" on public.election_votes
  for insert with check (
    auth.uid() = member_id
    and exists (select 1 from public.member_profiles mp where mp.user_id = auth.uid() and mp.status = 'approved')
    and exists (select 1 from public.elections e where e.id = election_id and e.status = 'active')
  );

create or replace view public.election_results as
  select election_id, candidate_id, count(*)::int as vote_count
  from public.election_votes
  group by election_id, candidate_id;

grant select on public.election_results to anon, authenticated;

-- Admin management of elections/candidates (no public write policy exists
-- on purpose — these go through the code-gated functions below).
create or replace function public.admin_upsert_election(
  p_id uuid, p_slug text, p_title text, p_description text,
  p_deadline timestamptz, p_status text, p_admin_code text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not public._check_admin_code(p_admin_code) then raise exception 'Invalid admin code'; end if;
  if p_id is null then
    insert into public.elections (slug, title, description, deadline, status)
      values (p_slug, p_title, p_description, p_deadline, coalesce(p_status,'active'))
      returning id into v_id;
  else
    update public.elections set slug=p_slug, title=p_title, description=p_description,
      deadline=p_deadline, status=coalesce(p_status,status) where id=p_id
      returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.admin_upsert_candidate(
  p_id uuid, p_election_id uuid, p_name text, p_role text,
  p_initials text, p_color text, p_sort_order int, p_admin_code text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not public._check_admin_code(p_admin_code) then raise exception 'Invalid admin code'; end if;
  if p_id is null then
    insert into public.election_candidates (election_id, name, role, initials, color, sort_order)
      values (p_election_id, p_name, p_role, p_initials, coalesce(p_color,'#800020'), coalesce(p_sort_order,0))
      returning id into v_id;
  else
    update public.election_candidates set name=p_name, role=p_role, initials=p_initials,
      color=coalesce(p_color,color), sort_order=coalesce(p_sort_order,sort_order) where id=p_id
      returning id into v_id;
  end if;
  return v_id;
end;
$$;

grant execute on function public.admin_upsert_election(uuid,text,text,text,timestamptz,text,text) to anon, authenticated;
grant execute on function public.admin_upsert_candidate(uuid,uuid,text,text,text,text,int,text) to anon, authenticated;

-- =====================================================================
-- 5. HALL OF FAME
-- =====================================================================

create table if not exists public.hof_categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  description text,
  sort_order  int default 0,
  active      boolean not null default true
);

create table if not exists public.hof_nominees (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.hof_categories(id) on delete cascade,
  name        text not null,
  photo_url   text,
  bio         text,
  sort_order  int default 0,
  active      boolean not null default true
);

create table if not exists public.hof_votes (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references public.hof_categories(id) on delete cascade,
  nominee_id   uuid not null references public.hof_nominees(id) on delete cascade,
  voter_name   text not null,
  voter_email  text not null,
  voter_phone  text,
  created_at   timestamptz not null default now(),
  unique (category_id, voter_email)
);

alter table public.hof_categories enable row level security;
alter table public.hof_nominees enable row level security;
alter table public.hof_votes enable row level security;

drop policy if exists "public reads categories" on public.hof_categories;
create policy "public reads categories" on public.hof_categories for select using (true);

drop policy if exists "public reads nominees" on public.hof_nominees;
create policy "public reads nominees" on public.hof_nominees for select using (true);

drop policy if exists "public casts hof vote" on public.hof_votes;
create policy "public casts hof vote" on public.hof_votes for insert with check (true);
-- No select policy on hof_votes: voter PII (name/email/phone) is never
-- publicly readable. Aggregated counts only, via the view below.

create or replace view public.hof_results as
  select category_id, nominee_id, count(*)::int as vote_count
  from public.hof_votes
  group by category_id, nominee_id;

grant select on public.hof_results to anon, authenticated;

create or replace function public.admin_upsert_category(
  p_id uuid, p_slug text, p_name text, p_description text,
  p_sort_order int, p_active boolean, p_admin_code text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not public._check_admin_code(p_admin_code) then raise exception 'Invalid admin code'; end if;
  if p_id is null then
    insert into public.hof_categories (slug, name, description, sort_order, active)
      values (p_slug, p_name, p_description, coalesce(p_sort_order,0), coalesce(p_active,true))
      returning id into v_id;
  else
    update public.hof_categories set slug=p_slug, name=p_name, description=p_description,
      sort_order=coalesce(p_sort_order,sort_order), active=coalesce(p_active,active) where id=p_id
      returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.admin_upsert_nominee(
  p_id uuid, p_category_id uuid, p_name text, p_photo_url text,
  p_bio text, p_sort_order int, p_active boolean, p_admin_code text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not public._check_admin_code(p_admin_code) then raise exception 'Invalid admin code'; end if;
  if p_id is null then
    insert into public.hof_nominees (category_id, name, photo_url, bio, sort_order, active)
      values (p_category_id, p_name, p_photo_url, p_bio, coalesce(p_sort_order,0), coalesce(p_active,true))
      returning id into v_id;
  else
    update public.hof_nominees set name=p_name, photo_url=p_photo_url, bio=p_bio,
      sort_order=coalesce(p_sort_order,sort_order), active=coalesce(p_active,active) where id=p_id
      returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.admin_delete_nominee(p_id uuid, p_admin_code text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public._check_admin_code(p_admin_code) then raise exception 'Invalid admin code'; end if;
  delete from public.hof_nominees where id = p_id;
end;
$$;

grant execute on function public.admin_upsert_category(uuid,text,text,text,int,boolean,text) to anon, authenticated;
grant execute on function public.admin_upsert_nominee(uuid,uuid,text,text,text,int,boolean,text) to anon, authenticated;
grant execute on function public.admin_delete_nominee(uuid,text) to anon, authenticated;

-- Seed the 7 categories the union chose (idempotent — safe to re-run).
insert into public.hof_categories (slug, name, description, sort_order) values
  ('lga-chairman',        'Best Performing LGA Chairman',            'Recognising the local government chairman who delivered the most for Oro communities this year.', 1),
  ('influential-politician','Most Influential Politician',           'Honouring the Oro politician whose influence and advocacy moved the needle for the Oro Nation.', 2),
  ('philanthropist',       'Outstanding Community Philanthropist',   'Celebrating generosity that has changed lives across Oro communities.', 3),
  ('youth-icon',           'Youth Icon of the Year',                 'Celebrating a young Oro achiever making a mark nationally or in the diaspora.', 4),
  ('diaspora-achiever',    'Diaspora Achiever of the Year',          'Honouring an Oro son or daughter abroad excelling in their field.', 5),
  ('woman-of-the-year',    'Woman of the Year',                      'Recognising outstanding leadership and achievement by an Oro woman.', 6),
  ('performing-appointee', 'Most Performing Appointee (PA/SA/Activist)', 'Honouring aides, special assistants and grassroots activists who delivered real impact.', 7)
on conflict (slug) do nothing;

-- =====================================================================
-- Done. Verify in the Supabase Table Editor:
--   - member_profiles, app_config, elections, election_candidates,
--     election_votes, hof_categories (7 rows), hof_nominees, hof_votes
--   - Database > Functions should list the functions created above.
-- =====================================================================
