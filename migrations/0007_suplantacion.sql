-- "Ver como": el administrador usa una COPIA de los datos de otro usuario (usuario sombra, id 'sombra-…').
-- Lo que haga ahí no toca nada del usuario original. Una fila por administrador (como mucho una copia activa).
create table suplantacion (
  admin_id text primary key references "user" ("id") on delete cascade,
  sombra_id text not null,
  original_id text not null,
  original_nombre text not null,
  creado integer not null
);
