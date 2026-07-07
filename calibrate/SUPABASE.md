# Cross-Device Sync Setup (Supabase) — ~2 minutes, free

Calibrate syncs your entire state (water, workouts, meals, golf, Jarvis memory,
chat, settings) through a single row in **your own** free Supabase project.
localStorage keeps working offline; Supabase is the source of truth across devices.

## 1. Create the project
1. Go to [supabase.com](https://supabase.com) → **Start your project** (free tier is plenty).
2. Create a new project (any name, any region near you). Wait ~1 min for it to provision.

## 2. Create the table
Open **SQL Editor** in the Supabase dashboard, paste this, and click **Run**:

```sql
create table if not exists calibrate_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create or replace function calibrate_touch() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end $$ language plpgsql;

drop trigger if exists calibrate_touch_trigger on calibrate_state;
create trigger calibrate_touch_trigger
  before insert or update on calibrate_state
  for each row execute function calibrate_touch();

alter table calibrate_state enable row level security;

drop policy if exists "calibrate sync" on calibrate_state;
create policy "calibrate sync" on calibrate_state
  for all using (true) with check (true);
```

## 3. Get your keys
In the dashboard: **Settings → API**
- **Project URL** — looks like `https://abcdefgh.supabase.co`
- **anon public** key — the long `eyJ...` string

## 4. Configure the app (on EVERY device)
Calibrate → **Settings → Cross-Device Sync**:
1. Paste the Project URL
2. Paste the anon key
3. Set a **sync code** — any long random string, but it must be **identical on every device**
   (it names your row and acts as its password; use the Generate button on the first
   device, then copy it to the others)

That's it. Changes push automatically a couple of seconds after you make them and
pull on app launch, tab focus, and every ~45 seconds. Last write wins.

## Notes
- Your data lives only in your project; the anon key stays on your devices.
- Anyone with your URL + anon key could read the table, so don't share them.
- The row is small (~100 KB); the free tier will never notice.
