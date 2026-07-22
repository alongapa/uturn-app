# Sub-sesión Tutorías — navegación por Facultad → Carrera → Ramo (UAI)

> Sub-sesión **posterior a la de Navegación (5 tabs)**. Convierte el tab **Tutorías** en un catálogo académico navegable de la UAI: facultad → carrera → ramo, y dentro del ramo se accede a **contenido (guías)**, **Q&A** y **chat con tutores**.

## Objetivo
Que un alumno UAI entre a Tutorías y navegue cómodamente **su facultad → su carrera → sus ramos**, y en cada ramo encuentre las guías, las preguntas y respuestas (Q&A) y un botón para chatear con el tutor asignado. Alcance: **solo UAI** por ahora (el modelo queda listo para sumar UDD/UAndes después).

## Ya integrado en el repo (Sesión 6)
- `topics (id, name, emoji, description, sort_order)` — hoy lista **plana** de temas (mallas, becas, deportes…).
- `questions`, `question_replies`, `guides`, `topic_assignees` **ya key-ean por `topic_id`**. `topic_assignees` liga un tutor (`user_id`) o federación (`publisher_id`) a un tema; la RLS exige estar ahí para responder oficialmente.
- Chat 1-a-1 vía `start_dm` (Sesión 6); los tutores serán siempre DM-ables (encaja con la sesión DM híbrido).
- `profiles.university_id` (Sesión 3) para mostrar por defecto la facultad de la universidad del alumno.

## Diseño (recomendado — reutiliza `topics`, NO duplica el Q&A)
- **Nuevas tablas de jerarquía**:
  - `faculties (id text, university_id text, name text, sort_order int)`
  - `careers (id text, faculty_id text→faculties, name text, sort_order int)`
- **Extender `topics`** con: `career_id text` (nullable → tema general), `kind text check in ('ramo','general')` default `'general'`, `code text` (sigla del ramo, opcional), `semester int` (opcional).
- Los **ramos = filas de `topics`** con `kind='ramo'` + `career_id`. Así **`questions`/`question_replies`/`guides`/`topic_assignees` no cambian** (siguen apuntando a `topic_id`) y todo el Q&A/guías/tutores existente funciona tal cual sobre los ramos.
- Los temas **generales** (becas, deportes, vida universitaria) quedan con `career_id = null` y `kind='general'`, en una sección "General" del tab.

## Navegación (cliente)
Tab **Tutorías** → lista de **facultades** (por defecto la de `university_id` del alumno) → **carreras** → **ramos** → **detalle del ramo**:
- **Contenido**: `guides` del ramo (PDF/imagen del bucket `guides`, ya existe).
- **Q&A**: `questions` del ramo + respuestas, con la oficial destacada (ya existe).
- **Chatear con tutor**: botón que hace `start_dm` con el tutor asignado (`topic_assignees` del ramo). Si hay varios, elegir; si no hay, ocultar/deshabilitar con aviso.
- Sección **General** aparte para los temas no académicos.

## Seed inicial (UAI) — estructura real, ramos a completar con la malla oficial
Fuente: sitio de admisión y mallas UAI (ver enlaces abajo). La UAI tiene 3 facultades + 5 escuelas; ~12 carreras de pregrado.

**Facultades / escuelas (seed):**
- Facultad de Ingeniería y Ciencias
- Escuela de Negocios
- Facultad de Derecho
- Facultad de Artes Liberales
- Escuela de Psicología
- Escuela de Gobierno
- Escuela de Comunicaciones

**Carreras (ejemplos por facultad, a confirmar con la oferta vigente):**
- Ingeniería y Ciencias → Ingeniería Civil, Ingeniería en Ciencias de la Computación, Ingeniería en Negocios y Tecnología
- Negocios → Ingeniería Comercial
- Derecho → Derecho (y Doble Grado Derecho–Ingeniería Comercial)
- Artes Liberales → Licenciatura en Historia
- Psicología → Psicología
- Comunicaciones → Periodismo / Licenciatura en Comunicación

**Ramos (seed de ejemplo, del ciclo inicial/bachillerato común):** Cálculo I, Álgebra Lineal, Introducción a la Economía, Introducción a la Programación, Comprensión del Mundo Contemporáneo. La sesión completa los ramos reales por carrera desde la **malla oficial** de `uai.cl/admision/mallas-curriculares-y-folletos`.

> El seed va en la migración (`insert ... on conflict do nothing`) y en `apply_all.sql`. Estructura pensada para que sumar UDD/UAndes sea solo agregar filas.

## RLS
- `faculties` / `careers`: **lectura para autenticados**; escritura solo `owner`/`admin` (el catálogo lo mantiene el owner). Habilitar RLS.
- `topics`: ya tiene su RLS; solo se agregan columnas (sin cambiar políticas de escritura existentes).
- Nada de PII nueva; el chat con tutor reusa la RLS de `conversations`/`messages`.

## Entregables / criterios de aceptación
- [ ] Migración con `faculties`, `careers`, columnas nuevas en `topics`, RLS y seed UAI (versionada + en `apply_all.sql`).
- [ ] Tab Tutorías navega facultad → carrera → ramo y muestra, en el ramo, guías + Q&A + "Chatear con tutor".
- [ ] Por defecto se abre la facultad de la universidad del alumno; los temas generales quedan en su sección.
- [ ] "Chatear con tutor" abre un DM con el tutor asignado al ramo (`topic_assignees`).
- [ ] Un `user` no puede editar el catálogo (RLS probada por SQL); `docs/backend.md` actualizado; `npm test` pasa.

## Dependencias
**Sesión Navegación** (el tab Tutorías debe existir) + Sesión 6 (Q&A/guías/tutores). Sinergia con **DM híbrido** (los tutores son siempre DM-ables).

## Prompt para iniciar la sesión

```text
Trabajo en Unities (Uturn), app RN/Expo + Supabase. Roles en profiles.account_role: owner/admin/tutor/user; modelo en docs/backend.md. Esta sub-sesión es Tutorías por Facultad→Carrera→Ramo (docs/sesiones/tutorias-facultades.md), SOLO UAI. Rama nueva sesion/tutorias-facultades desde main actualizado. Usa las skills de Supabase (.agents/skills/*) para migraciones y RLS. Va DESPUÉS de la sesión Navegación (el tab Tutorías ya debe existir).

Diseño decidido (reutiliza topics, no dupliques el Q&A):
1. Nuevas tablas faculties (id, university_id, name, sort_order) y careers (id, faculty_id, name, sort_order). RLS: lectura autenticados, escritura solo owner/admin.
2. Extiende topics: career_id (nullable), kind ('ramo'|'general') default 'general', code (sigla), semester. Los ramos = topics con kind='ramo' + career_id. NO cambies questions/question_replies/guides/topic_assignees (siguen keyeando por topic_id).
3. Seed UAI real (facultades: Ingeniería y Ciencias, Negocios, Derecho, Artes Liberales, Psicología, Gobierno, Comunicaciones; carreras y ramos de ejemplo del ciclo inicial), completando los ramos desde la malla oficial de uai.cl/admision/mallas-curriculares-y-folletos. Seed en la migración + apply_all.sql con on conflict do nothing. Temas generales (becas/deportes) quedan con career_id null / kind='general'.
4. Cliente: tab Tutorías navega facultad → carrera → ramo (por defecto la facultad de la university_id del alumno). En el detalle del ramo: guías (bucket guides) + Q&A (questions) + botón "Chatear con tutor" que hace start_dm con el tutor asignado en topic_assignees. Sección "General" aparte.

Verifica por SQL: un user no puede editar faculties/careers; navegación llega a un ramo con sus guías/preguntas; "Chatear con tutor" abre DM con el asignado. Actualiza docs/backend.md. Corre npm test. Al terminar: commit y push de la rama; fusiona a main y pushea; si npm test falla o algo queda a medias, no fusiones: pushea solo la rama y repórtame. Dame la lista de decisiones tomadas.
```

## Fuentes del catálogo UAI
- https://www.uai.cl/admision/mallas-curriculares-y-folletos
- https://admision.uai.cl/
- https://es.wikipedia.org/wiki/Universidad_Adolfo_Ib%C3%A1%C3%B1ez
