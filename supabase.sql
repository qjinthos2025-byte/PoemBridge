-- Ejecutar en Supabase > SQL Editor (solo si la tabla no existe todavía)
create table poemas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  titulo text not null,
  versos text[] not null,
  traduccion text[],
  nota text,
  creado timestamptz default now()
);
alter table poemas enable row level security;
create policy "solo los mios" on poemas for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
