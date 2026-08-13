# Política de privacidad

_Última actualización: 2026-08-12_

<!-- Generado por scripts/generate-legal-docs.mjs desde constants/legal.json.
     No editar a mano: los cambios se pierden en la próxima generación. -->

Unities es una aplicación para comunidades universitarias chilenas: viajes compartidos entre estudiantes, contenido de federaciones y centros de alumnos, mensajería y canjes. Esta política explica qué datos tratamos, por qué, con quién los compartimos y qué puedes exigirnos. Está escrita para que se entienda, no para cubrirnos.

## Quién es responsable de tus datos

El responsable del tratamiento es Unities. Puedes escribirnos a privacidad@unities.cl por cualquier solicitud de esta política; respondemos dentro de 30 días corridos.

Tratamos tus datos conforme a la Ley 19.628 sobre protección de la vida privada y a la Ley 21.719, que crea la Agencia de Protección de Datos Personales.

## Qué datos recolectamos

Solo pedimos lo que el servicio necesita para funcionar. En concreto:

- Cuenta: tu correo institucional (es la forma de saber que perteneces a la universidad), nombre, fecha de nacimiento, universidad y campus. La foto de perfil es opcional.
- Verificación: si publicas viajes como conductor, los datos de tu licencia de conducir y del vehículo (patente, modelo). Si tu universidad lo exige, también el documento con el que acreditas ser estudiante.
- Viajes: origen, destino, punto de encuentro, hora y precio por cupo de los viajes que publicas o reservas.
- Ubicación: mientras buscas un viaje o compartes un trayecto en vivo. Se usa en ese momento y no construimos un historial de dónde estuviste.
- Pagos: monto, fecha, estado y el identificador de la transacción. Los datos bancarios que registras para recibir pagos (banco, tipo y número de cuenta, titular) se guardan para mostrárselos a quien te debe transferir.
- Mensajes: el contenido de tus conversaciones y de las publicaciones que haces en el feed.
- Uso de la app: fallas, errores y datos técnicos del dispositivo (modelo, versión del sistema operativo).

## Qué NO recolectamos

- No pedimos ni almacenamos el número de tu tarjeta de crédito o débito, ni tus claves bancarias. Unities nunca ve esas credenciales.
- No vendemos tus datos a terceros. No los cedemos a empresas de publicidad.
- No rastreamos tu ubicación en segundo plano ni cuando la app está cerrada.
- No leemos tus mensajes para perfilarte ni para entrenar modelos.

## Pagos: cómo funciona y qué ve cada parte

Los pagos de los cupos son transferencias reales entre estudiantes: tú le transfieres al conductor, y Unities cobra una comisión fija por cupo reservado.

Para verificar que la transferencia ocurrió usamos Fintoc, un proveedor chileno de servicios de pago. Fintoc actúa como responsable independiente de los datos que trata en ese proceso, bajo su propia política de privacidad.

A Fintoc viaja lo mínimo para poder verificar el pago: el monto, la moneda, un identificador de la reserva y los datos de la cuenta de destino. Unities no recibe de vuelta tus credenciales bancarias: solo el resultado (pagado / no pagado) y el identificador de la transacción.

Guardamos el historial de pagos, comisiones y disputas mientras exista tu cuenta y por el plazo que la ley tributaria y comercial nos obligue a conservarlo, aunque cierres la cuenta. Es la única categoría de datos que sobrevive al borrado, y sobrevive anonimizada de tu identidad cuando eso es posible.

## Diagnóstico de fallas

Usamos Sentry para saber cuándo la app se cae y por qué. Es diagnóstico técnico, no seguimiento de comportamiento.

A Sentry enviamos el error, la pantalla donde ocurrió, datos técnicos del dispositivo y un identificador interno de usuario (un UUID que por sí solo no dice quién eres). Filtramos activamente correos, nombres, teléfonos, patentes, números de cuenta, tokens de sesión y el contenido de los mensajes antes de enviar cualquier reporte.

No activamos la recolección automática de datos personales ni de dirección IP que la herramienta ofrece por defecto.

## Métricas de uso

Medimos el uso del producto de forma agregada: cuántas reservas se completan, cuántos pagos llegan a tiempo, qué secciones se usan. Sirve para decidir qué mejorar.

Estas métricas se publican solo agregadas y con un mínimo de personas por grupo. Si un corte quedara con menos de cinco personas no lo mostramos, porque en un campus chico un grupo de dos personas equivale a decir sus nombres.

Nadie en Unities usa estas métricas para tomar decisiones sobre una persona en particular.

## Quién más ve tus datos

- Otros usuarios: tu nombre, foto, universidad y evaluación promedio son visibles para quienes comparten un viaje contigo. Puedes restringir la visibilidad de tu perfil desde Privacidad y seguridad.
- El conductor o pasajero de un viaje que reservaste ve lo necesario para coordinarlo: nombre, punto de encuentro y, para el pago, los datos bancarios que el conductor haya registrado.
- Administradores de tu federación o centro de alumnos: solo el contenido que publicas en sus espacios y los reportes de moderación que te involucren. No ven tus mensajes privados ni tus pagos.
- Proveedores que nos prestan servicio: Supabase (base de datos y autenticación), Fintoc (verificación de pagos), Sentry (diagnóstico de fallas), Expo (notificaciones push) y Anthropic (respuestas de los bots de tutoría, solo el texto que le escribes al bot).
- Autoridades, cuando una orden judicial o una obligación legal nos lo exija.

## Tus derechos

Puedes ejercer estos derechos desde la app, en Perfil → Privacidad y seguridad, o escribiéndonos:

- Acceso: descargar una copia de todos tus datos, en formato legible por máquina.
- Rectificación: corregir lo que esté equivocado. La mayoría de los campos los editas tú mismo.
- Cancelación: eliminar tu cuenta. El borrado es definitivo y anonimiza tu rastro en viajes y mensajes; ver la sección de pagos para lo que la ley nos obliga a conservar.
- Oposición: negarte a un tratamiento concreto, como las notificaciones push, sin perder el resto del servicio.

## Cuánto tiempo guardamos tus datos

- Datos de cuenta y perfil: mientras la cuenta exista.
- Viajes y mensajes: mientras la cuenta exista; al eliminarla se anonimizan para no romper el historial de la otra persona.
- Reportes de moderación y sanciones: hasta 2 años, porque son la memoria que permite detectar reincidencia.
- Pagos y comisiones: el plazo que exige la normativa tributaria y comercial chilena.
- Reportes de fallas: 90 días.

## Menores de edad

Unities está pensada para estudiantes universitarios. Si tienes menos de 18 años necesitas autorización de quien tenga tu cuidado personal para usar el servicio y para participar en viajes compartidos.

## Seguridad

Los datos viajan cifrados y el acceso a cada fila de la base de datos está restringido por políticas del servidor, no por comprobaciones de la app: aunque alguien modificara la aplicación, el servidor sigue negando lo que no corresponde.

Ningún sistema es infalible. Si ocurre una vulneración que afecte tus datos, te avisaremos y notificaremos a la autoridad en los plazos que la ley establece.

## Cambios a esta política

Si cambiamos algo relevante te avisaremos dentro de la app antes de que entre en vigencia. La fecha de última actualización está al comienzo de este documento.

---

Consultas sobre este documento: privacidad@unities.cl
