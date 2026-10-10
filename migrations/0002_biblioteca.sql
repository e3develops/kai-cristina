-- Fase 2: biblioteca (asignaturas con su aspecto), estado de cada examen, nota real y resumen del progreso
alter table asignatura add column emoji text not null default '📘';
alter table asignatura add column color text not null default 'verde';

-- pendiente = creado, sin apuntes procesados · procesando · listo = se puede estudiar
alter table examen add column estado text not null default 'listo';
alter table examen add column nota_real real;        -- la que sacó de verdad (para calibrar)
alter table examen add column prevision text;        -- JSON: lo que KAI preveía cuando se apuntó la nota

-- Resumen del progreso (nota prevista, minutos que faltan…) para la pantalla de inicio sin cargar cada examen
alter table progreso add column resumen text;
