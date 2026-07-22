
-- Table: search_logs
create table public.search_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  origin_icao text not null,
  destination_icao text not null,
  origin_label text,
  destination_label text,
  date_start date not null,
  date_end date not null,
  include_nearby boolean not null default true,
  result_count integer,
  ip_address text,
  session_id text,
  user_agent text,
  referrer text
);

alter table public.search_logs enable row level security;

create policy "Admins can select search logs"
  on public.search_logs for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can delete search logs"
  on public.search_logs for delete
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- Table: excluded_ips
create table public.excluded_ips (
  id uuid primary key default gen_random_uuid(),
  ip_address text not null unique,
  label text,
  created_at timestamptz not null default now()
);

alter table public.excluded_ips enable row level security;

create policy "Admins can select excluded ips"
  on public.excluded_ips for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can insert excluded ips"
  on public.excluded_ips for insert
  to authenticated
  with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins can delete excluded ips"
  on public.excluded_ips for delete
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));
