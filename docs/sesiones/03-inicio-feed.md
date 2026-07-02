# Sesión 3 — Inicio / Feed: publicaciones, historias y widgets

## Objetivo
Construir el nuevo tab **Inicio** como red social universitaria estilo Twitter/Threads con historias: publicaciones de federaciones, departamentos, centros de alumnos y de la propia universidad; **historias** arriba del feed; **widgets de eventos de la semana**; carretes, activaciones y descuentos.

## Ya integrado en el repo
- **Nada del feed existe (0%)**. El tab "Inicio" actual (`app/(tabs)/index.tsx` → `screens/HomeScreen.tsx`) es un selector "Entrar como Conductor / Entrar como Pasajero" con una grilla estática de beneficios.
- Reutilizable: navegación por tabs (`app/(tabs)/_layout.tsx`), tema (`constants/theme.ts`), primitivas UI en `components/`, `expo-image` para media, roles y permisos de la Sesión 0.

## Mejoras sobre lo existente
- **Reubicar el selector conductor/pasajero**: el contenido actual de `HomeScreen` se muda al tab "Mis viajes" (o a un tab "Viajes" propio), liberando Inicio para el feed.

## Falta por construir
1. **Entidades publicadoras**: modelo `Publisher` (federación, departamento, centro de alumnos, universidad, marca asociada) con nombre, avatar, tipo y universidad. Seed mock con entidades reales (p. ej. FEUAI, centros de alumnos por carrera).
2. **Publicaciones**: modelo `Post` (autor = Publisher o alumno tutor, texto, imágenes/carrete, tipo: `noticia | evento | activacion | descuento`, fecha, likes/reposts/respuestas estilo Threads). Feed cronológico con scroll infinito, tarjetas por tipo (un descuento se ve distinto a una noticia).
3. **Historias**: fila horizontal arriba del feed (círculos con avatar del publisher), visor a pantalla completa con avance por toque, expiración a 24 h. Modelo `Story`.
4. **Widget de eventos de la semana**: carrusel/tarjeta fija en el feed con los eventos de los próximos 7 días ("Qué te espera esta semana en la UAI"), extraídos de los posts tipo `evento`. Este widget es el que administran los admins en la Sesión 4.
5. **Carretes, activaciones y descuentos**: tratamiento visual propio dentro del feed (galería para carretes, badge y fecha para activaciones, código/condición para descuentos). Los descuentos enlazan con los canjeables de la Sesión 2 cuando aplica.
6. **Interacciones**: like, repost, responder (hilo simple) — solo para usuarios logueados; publicar queda restringido a roles `admin`/`owner`/`tutor` (los flujos de publicación llegan en la Sesión 4; aquí basta con la restricción y datos mock).

## Entregables / criterios de aceptación
- [ ] El tab Inicio muestra historias + widget de eventos de la semana + feed de publicaciones mock tipadas.
- [ ] El visor de historias funciona (avance por toque, cierre, expiración).
- [ ] Cada tipo de post (noticia/evento/activación/descuento/carrete) tiene su tarjeta diferenciada.
- [ ] Like/repost/respuesta funcionan y persisten.
- [ ] El selector conductor/pasajero sigue accesible desde el tab de viajes.
- [ ] `npm test` pasa.

## Dependencias
Sesión 0 (roles, persistencia). No depende de las Sesiones 1-2.

## Prompt para iniciar la sesión

```text
Estoy trabajando en Uturn (repo uturn-app), app universitaria en Expo + expo-router + TypeScript con tabs en app/(tabs)/. Esta es la Sesión 3 del roadmap (ROADMAP.md, docs/sesiones/03-inicio-feed.md). La Sesión 0 (roles user/tutor/admin/owner, persistencia) ya está hecha. Trabaja en una rama nueva sesion/03-feed creada desde main actualizado.

Contexto: no existe nada de feed. El tab Inicio actual (app/(tabs)/index.tsx → screens/HomeScreen.tsx) es solo un selector conductor/pasajero que hay que mudar al tab de viajes.

Tareas de esta sesión — construir el nuevo Inicio estilo Twitter/Threads con historias:
1. Modelos: Publisher (federación, departamento, centro de alumnos, universidad, marca), Post (texto, imágenes/carrete, tipo noticia|evento|activacion|descuento, likes/reposts/respuestas), Story (expira a 24h). Seed mock realista (FEUAI, centros de alumnos, etc.).
2. Feed cronológico con tarjetas diferenciadas por tipo de post (galería para carretes, badge para activaciones, código para descuentos).
3. Fila de historias arriba del feed con visor a pantalla completa (avance por toque).
4. Widget "Eventos de la semana": carrusel fijo en el feed con los eventos de los próximos 7 días.
5. Interacciones like/repost/responder para usuarios; publicar restringido a admin/owner/tutor (las pantallas de publicación llegan en la Sesión 4).
6. Mover el selector conductor/pasajero de HomeScreen al tab de viajes.

Usa el tema de constants/theme.ts y las primitivas de components/. No toques pagos, mensajes ni panel admin. Al terminar, verifica que npm test pasa, haz commit y push de la rama y abre un Pull Request hacia main (no lo fusiones: lo reviso y fusiono yo antes de la siguiente sesión).
```
