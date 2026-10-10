-- Cuentas (esquema de Better Auth 1.7, generado con su getMigrations)
create table "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null);
create table "session" ("id" text not null primary key, "expiresAt" date not null, "token" text not null unique, "createdAt" date not null, "updatedAt" date not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade);
create table "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null);
create table "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" date not null, "createdAt" date not null, "updatedAt" date not null);
create index "session_userId_idx" on "session" ("userId");
create index "account_userId_idx" on "account" ("userId");
create index "verification_identifier_idx" on "verification" ("identifier");

-- Biblioteca: asignaturas y exámenes de cada usuario
create table asignatura (
  id text primary key,
  user_id text not null references "user" ("id") on delete cascade,
  nombre text not null,
  creado integer not null
);
create index asignatura_user_idx on asignatura (user_id);

create table examen (
  id text primary key,
  user_id text not null references "user" ("id") on delete cascade,
  asignatura_id text references asignatura (id) on delete set null,
  nombre text not null,
  fecha text,                    -- AAAA-MM-DD (opcional)
  opciones integer not null default 4,
  penalizacion real,             -- null = "no lo sé"
  nivel text not null default 'medio',
  contenido text not null,       -- carpeta del contenido en KV (preguntas, apuntes, páginas)
  creado integer not null
);
create index examen_user_idx on examen (user_id);

-- Progreso de cada usuario en cada examen (el mismo JSON que se guarda en el móvil)
create table progreso (
  user_id text not null references "user" ("id") on delete cascade,
  examen_id text not null references examen (id) on delete cascade,
  estado text not null,
  actualizado integer not null,
  primary key (user_id, examen_id)
);
