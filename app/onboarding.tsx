import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { PaymentRulesList } from '@/components/onboarding/payment-rules';
import { Button } from '@/components/ui/Button';
import { useNotifications } from '@/contexts/NotificationsContext';
import { Layout, Radius, Spacing } from '@/constants/theme';
import { useLayout } from '@/hooks/use-layout';
import { markIntroSeen } from '@/services/onboarding';

/**
 * Bienvenida de primer uso.
 *
 * Tres pasos: qué es Unities, cómo funcionan los turnos, y las reglas de pago.
 * El permiso de notificaciones se pide al final y con motivo — el aviso del
 * plazo de 48 h es justamente lo que las push sirven para entregar. La
 * ubicación NO se pide aquí: se pide al buscar un viaje, que es cuando se
 * entiende para qué (ver hooks/use-location-permission.ts).
 *
 * Las reglas de pago se muestran acá *y* vuelven a exigirse antes de la primera
 * reserva (app/reglas-de-pago.tsx). No es redundancia: acá es contexto, allá es
 * compromiso.
 */

type Slide = {
  key: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  body: string;
};

const SLIDES: Slide[] = [
  {
    key: 'bienvenida',
    icon: 'school-outline',
    title: 'Tu campus, en una app',
    body:
      'Viajes compartidos con gente de tu universidad, lo que pasa en tu federación y centro de alumnos, tutorías y canjes. Todo con tu correo institucional, así sabes con quién estás viajando.',
  },
  {
    key: 'turnos',
    icon: 'car-outline',
    title: 'Turnos: alguien que ya iba para allá',
    body:
      'Un conductor publica su viaje con hora, punto de encuentro y precio por cupo. Tú reservas el turno que te calce, se ponen de acuerdo en el punto de encuentro y le transfieres directo a él. Unities cobra una comisión fija por cupo, nada más.',
  },
];

export default function OnboardingScreen() {
  const { width } = useWindowDimensions();
  const { screenPadding, bottomSpacing, topSpacing } = useLayout();
  const { maybeAskPushPermission } = useNotifications();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  // La última "diapositiva" es la de reglas de pago, que no es un Slide simple.
  const totalSteps = SLIDES.length + 1;
  const isLast = index === totalSteps - 1;

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(event.nativeEvent.contentOffset.x / width);
      setIndex(next);
    },
    [width]
  );

  const goTo = useCallback(
    (target: number) => {
      scrollRef.current?.scrollTo({ x: target * width, animated: true });
      setIndex(target);
    },
    [width]
  );

  const finish = useCallback(async () => {
    await markIntroSeen();
    // Permiso EN CONTEXTO: recién terminó de leer que el plazo son 48 h y que
    // vencerlo cuesta un strike, así que el motivo del aviso ya se entiende.
    maybeAskPushPermission(
      'Te avisamos 24 h y 4 h antes de que venza el plazo de pago, y cuando el conductor confirme tu cupo.'
    );
    router.replace('/(tabs)');
  }, [maybeAskPushPermission]);

  const skip = useCallback(async () => {
    await markIntroSeen();
    router.replace('/(tabs)');
  }, []);

  return (
    <View style={[styles.container, { paddingTop: topSpacing }]}>
      <View style={[styles.topBar, { paddingHorizontal: screenPadding }]}>
        <TouchableOpacity
          onPress={skip}
          hitSlop={Layout.hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Saltar la introducción"
        >
          <Text style={styles.skip}>Saltar</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        style={styles.pager}
      >
        {SLIDES.map((slide) => (
          <View key={slide.key} style={[styles.slide, { width, paddingHorizontal: screenPadding }]}>
            <View style={styles.iconBadge}>
              <Ionicons name={slide.icon} size={44} color="#246BFD" />
            </View>
            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.body}>{slide.body}</Text>
          </View>
        ))}

        <ScrollView
          key="reglas"
          style={{ width }}
          contentContainerStyle={[styles.rulesSlide, { paddingHorizontal: screenPadding }]}
        >
          <Text style={styles.title}>Pagos, plazos y strikes</Text>
          <Text style={styles.rulesIntro}>
            Es la parte que conviene tener clara antes de reservar:
          </Text>
          <PaymentRulesList compact />
        </ScrollView>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingHorizontal: screenPadding, paddingBottom: bottomSpacing + Spacing.md },
        ]}
      >
        <View style={styles.dots} accessibilityRole="progressbar" accessibilityLabel={`Paso ${index + 1} de ${totalSteps}`}>
          {Array.from({ length: totalSteps }, (_, dot) => (
            <View key={dot} style={[styles.dot, dot === index && styles.dotActive]} />
          ))}
        </View>

        <Button
          label={isLast ? 'Empezar' : 'Siguiente'}
          onPress={() => (isLast ? void finish() : goTo(index + 1))}
          style={styles.cta}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  topBar: { alignItems: 'flex-end', paddingVertical: Spacing.sm, minHeight: Layout.touchTarget },
  skip: { fontSize: 14, fontWeight: '700', color: '#64748b' },
  pager: { flex: 1 },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.lg },
  iconBadge: {
    width: 96,
    height: 96,
    borderRadius: Radius.pill,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 25, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 23, color: '#475569', textAlign: 'center', maxWidth: 360 },
  rulesSlide: { paddingTop: Spacing.xl, paddingBottom: Spacing.xl, gap: Spacing.md },
  rulesIntro: { fontSize: 14, color: '#64748b', marginBottom: Spacing.xs },
  footer: { paddingTop: Spacing.md, gap: Spacing.lg },
  dots: { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: Radius.pill, backgroundColor: '#cbd5e1' },
  dotActive: { backgroundColor: '#246BFD', width: 22 },
  cta: { minHeight: 48, borderRadius: Radius.md },
});
