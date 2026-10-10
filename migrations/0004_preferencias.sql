-- Preferencias de cada cuenta (p. ej. si ya vio la presentación de KAI). JSON libre.
create table preferencia (
  user_id text primary key references "user" ("id") on delete cascade,
  datos text not null
);
