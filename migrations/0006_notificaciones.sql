-- Notificaciones de cada cuenta (la campanita): apuntes listos, exámenes cerca, mensajes del administrador…
create table notificacion (
  id text primary key,
  user_id text not null references "user" ("id") on delete cascade,
  tipo text not null,            -- listo · examen · nota · mensaje · admin
  titulo text not null,
  texto text not null,
  url text,                      -- qué abrir al tocarla (/?examen=… · /?admin)
  clave text,                    -- evita duplicados (p. ej. el recordatorio "mañana" de un examen solo una vez)
  creado integer not null,
  leida integer not null default 0
);
create index notificacion_user_idx on notificacion (user_id, creado);
create unique index notificacion_clave_idx on notificacion (user_id, clave) where clave is not null;
