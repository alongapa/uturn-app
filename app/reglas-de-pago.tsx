import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { PaymentRulesList } from '@/components/onboarding/payment-rules';
import { Button } from '@/components/ui/Button';
import { Radius, Spacing } from '@/constants/theme';
import { useLayout } from '@/hooks/use-layout';
import { acceptPaymentRules } from '@/services/onboarding';

/**
 * Aceptación obligatoria de las reglas de pago, previa a la PRIMERA reserva.
 *
 * Por qué existe además de la diapositiva del onboarding: el intro se ve una
 * vez, al instalar, y muy probablemente sin haber reservado nada — nadie
 * retiene el plazo de 48 h ni los strikes en ese momento. Esta pantalla aparece
 * cuando el compromiso es real (está a un toque de tomar el cupo de alguien) y
 * exige un toque explícito. La reserva no continúa si vuelve atrás.
 *
 * Se navega con `?next=` para volver exactamente a donde iba, y así la
 * interrupción no le cuesta el viaje que estaba mirando.
 */
export default function PaymentRulesScreen() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { screenPadding, bottomSpacing, contentWidthStyle } = useLayout();
  const [saving, setSaving] = useState(false);

  const handleAccept = async () => {
    setSaving(true);
    await acceptPaymentRules();
    // `replace` y no `push`: esta pantalla no debe quedar en el historial, o
    // el botón atrás de la pantalla de pago devuelve a las reglas ya aceptadas.
    if (next) router.replace(next as never);
    else router.back();
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          contentWidthStyle,
          { paddingHorizontal: screenPadding, paddingBottom: Spacing.xl },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Antes de tu primera reserva</Text>
          <Text style={styles.subtitle}>
            Unities funciona con la plata de estudiantes reales. Estas son las reglas del pago —
            léelas una vez y no te van a sorprender después.
          </Text>
        </View>

        <PaymentRulesList />
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingHorizontal: screenPadding, paddingBottom: bottomSpacing + Spacing.md },
        ]}
      >
        <Button
          label="Entendido, continuar"
          onPress={handleAccept}
          loading={saving}
          style={styles.acceptButton}
        />
        <Text style={styles.footnote}>
          Al continuar aceptas los Términos y la Política de privacidad de Unities.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { paddingTop: Spacing.lg, gap: Spacing.xl },
  header: { gap: Spacing.sm },
  title: { fontSize: 24, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 14.5, lineHeight: 21, color: '#64748b' },
  footer: {
    paddingTop: Spacing.md,
    gap: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  acceptButton: { minHeight: 48, borderRadius: Radius.md },
  footnote: { fontSize: 11.5, color: '#94a3b8', textAlign: 'center' },
});
