-- Suscripciones a notificaciones push (una por dispositivo con los avisos activados)
create table push (
  endpoint text primary key,
  user_id text not null references "user" ("id") on delete cascade,
  p256dh text not null,
  auth text not null,
  creado integer not null
);
create index push_user on push (user_id);
