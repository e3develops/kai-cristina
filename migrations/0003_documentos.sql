-- Fase 3: apuntes subidos (los ficheros van a R2; aquí el índice, para cuotas y para procesarlos)
create table documento (
  id text primary key,
  examen_id text not null references examen (id) on delete cascade,
  user_id text not null references "user" ("id") on delete cascade,
  nombre text not null,          -- nombre original (solo para mostrarlo)
  tipo text not null,            -- image/jpeg · application/pdf
  bytes integer not null,
  clave text not null,           -- clave del objeto en R2
  creado integer not null
);
create index documento_examen_idx on documento (examen_id);
create index documento_user_idx on documento (user_id, creado);

-- Cuándo se pidió preparar el examen y cuándo quedó listo (para el aviso "¡ya está!")
alter table examen add column enviado integer;
alter table examen add column listo_aviso integer; -- 1 = hay que avisar al usuario de que ya está listo
