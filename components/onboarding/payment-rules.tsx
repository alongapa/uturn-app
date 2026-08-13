import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing, StatusColors } from '@/constants/theme';
import { PAYMENT_DEADLINE_HOURS } from '@/services/payments';
import { PAYMENT_STRIKES_FOR_BAN } from '@/services/penalties';

/**
 * Las reglas de pago, contadas una sola vez y en un solo lugar.
 *
 * Este componente es la fuente de la explicación: lo usan tanto la diapositiva
 * del onboarding como la pantalla de aceptación obligatoria previa a la primera
 * reserva. Si el texto viviera duplicado en ambas, una de las dos se iba a
 * quedar vieja justo cuando cambien las reglas.
 *
 * Los números salen de las constantes reales (`PAYMENT_DEADLINE_HOURS`,
 * `PAYMENT_STRIKES_FOR_BAN`), no escritos a mano: si alguien cambia el plazo en
 * services/payments.ts, esta pantalla no puede seguir prometiendo 48 h.
 */

type Rule = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tone: keyof typeof StatusColors;
  title: string;
  body: string;
};

export const PAYMENT_RULES: Rule[] = [
  {
    icon: 'people-outline',
    tone: 'info',
    title: 'Reservas un cupo, no un asiento cualquiera',
    body:
      'Cuando reservas, el conductor deja ese lugar libre para ti y deja de ofrecerlo. Por eso reservar es un compromiso: alguien más se quedó sin ese cupo.',
  },
  {
    icon: 'time-outline',
    tone: 'warning',
    title: `Tienes ${PAYMENT_DEADLINE_HOURS} horas para transferir`,
    body:
      `Desde que reservas corren ${PAYMENT_DEADLINE_HOURS} horas para transferirle al conductor. Te avisamos 24 h y 4 h antes de que se acabe el plazo.`,
  },
  {
    icon: 'shield-checkmark-outline',
    tone: 'success',
    title: 'Verificamos el pago con el banco',
    body:
      'No basta con marcar "ya pagué": eso es solo tu palabra y no te protege. Lo que cuenta es que la transferencia quede verificada, y eso pasa solo cuando el banco la confirma o cuando el conductor la confirma.',
  },
  {
    icon: 'alert-circle-outline',
    tone: 'danger',
    title: 'Si el plazo vence sin pago verificado, el strike es tuyo',
    body:
      `El strike lo recibe el pasajero que no pagó, nunca el conductor. Con ${PAYMENT_STRIKES_FOR_BAN} strikes quedas 2 días sin poder reservar.`,
  },
  {
    icon: 'chatbubble-ellipses-outline',
    tone: 'info',
    title: 'Si pagaste y no se verificó, reclama',
    body:
      'Abre "Yo sí pagué" desde la reserva. Mientras revisamos tu caso el strike queda congelado, y si tenías razón se anula.',
  },
  {
    icon: 'calendar-outline',
    tone: 'warning',
    title: 'Cancelar a última hora también penaliza',
    body:
      'Puedes cancelar gratis hasta 2 horas antes de la salida (12 horas si el viaje sale entre las 8 y las 10 de la mañana). Después de eso cuenta como cancelación tardía: a la 3.ª quedas 1 día sin reservar, a la 6.ª son 3 días y a la 9.ª, 7 días.',
  },
];

/** Lista de reglas. `compact` reduce el aire para la diapositiva del intro. */
export function PaymentRulesList({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.list, compact && styles.listCompact]}>
      {PAYMENT_RULES.map((rule) => {
        const colors = StatusColors[rule.tone];
        return (
          // El item completo es un solo nodo accesible: leer "ícono, título,
          // cuerpo" por separado convierte la lista en ruido con VoiceOver.
          <View
            key={rule.title}
            style={styles.item}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`${rule.title}. ${rule.body}`}
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.bg }]}>
              <Ionicons name={rule.icon} size={20} color={colors.fg} />
            </View>
            <View style={styles.itemText}>
              <Text style={styles.itemTitle}>{rule.title}</Text>
              <Text style={styles.itemBody}>{rule.body}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.lg },
  listCompact: { gap: Spacing.md },
  item: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'flex-start',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: { flex: 1, gap: 2 },
  itemTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  itemBody: { fontSize: 13.5, lineHeight: 19, color: '#475569' },
});
