import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

const RULES: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  {
    icon: 'people-outline',
    title: 'Respeto ante todo',
    body: 'Trata a conductores, pasajeros y a toda la comunidad con respeto. No se permite acoso, discriminación ni lenguaje de odio.',
  },
  {
    icon: 'car-outline',
    title: 'Seguridad en los viajes',
    body: 'Comparte tu viaje en vivo con un contacto de confianza y usa el botón SOS ante cualquier emergencia. Los datos del conductor y del auto siempre están visibles antes de subir.',
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Identidad real',
    body: 'Usa tu identidad verdadera y tu credencial universitaria vigente. Está prohibido suplantar a otra persona o crear cuentas duplicadas.',
  },
  {
    icon: 'chatbubbles-outline',
    title: 'Contenido apropiado',
    body: 'No publiques spam, estafas ni contenido inapropiado. Las publicaciones con lenguaje ofensivo se filtran automáticamente.',
  },
  {
    icon: 'card-outline',
    title: 'Pagos honestos',
    body: 'Paga tus viajes a tiempo y no intentes evadir la comisión. El fraude en pagos o canjes puede terminar en la suspensión de tu cuenta.',
  },
  {
    icon: 'flag-outline',
    title: 'Reporta lo que veas',
    body: 'Si algo no está bien, repórtalo desde el perfil, el viaje, el chat o la publicación. También puedes bloquear a cualquier usuario.',
  },
];

/**
 * Reglas de la comunidad (Sesión 9): documento público en la app. Se enlaza
 * desde las notificaciones de sanción (apply_moderation_action) y desde el
 * perfil/configuración.
 */
export default function CommunityRulesScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Reglas de la comunidad Unities</Text>
      <Text style={styles.intro}>
        Unities funciona porque confiamos unos en otros. Estas son las reglas que mantienen la comunidad segura;
        incumplirlas puede llevar a advertencias, suspensiones o el baneo de la cuenta.
      </Text>

      {RULES.map((rule) => (
        <View key={rule.title} style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name={rule.icon} size={20} color="#2563eb" />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>{rule.title}</Text>
            <Text style={styles.cardBody}>{rule.body}</Text>
          </View>
        </View>
      ))}

      <Text style={styles.footer}>
        El equipo de moderación de Unities revisa los reportes y aplica estas reglas de forma justa. Gracias por
        cuidar la comunidad.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  intro: { color: '#475569', lineHeight: 21 },
  card: { flexDirection: 'row', gap: 12, backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 14 },
  iconWrap: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1, gap: 3 },
  cardTitle: { color: '#0f172a', fontWeight: '800', fontSize: 15 },
  cardBody: { color: '#475569', fontSize: 13.5, lineHeight: 19 },
  footer: { color: '#64748b', fontSize: 13, lineHeight: 19, marginTop: 6, fontStyle: 'italic' },
});
