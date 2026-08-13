import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  DimensionValue,
  Easing,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import { Radius, Spacing } from '@/constants/theme';

const BASE_COLOR = '#E2E8F0';

type SkeletonProps = {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Bloque gris con pulso, del tamaño del contenido que va a reemplazar.
 *
 * Un skeleton comunica *qué* está por llegar (y cuánto), un spinner solo que
 * algo pasa. Respeta "reducir movimiento": si está activo se queda estático.
 */
export function Skeleton({ width = '100%', height = 12, radius = Radius.sm, style }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.5)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(0.6);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduceMotion]);

  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: BASE_COLOR, opacity }, style]}
    />
  );
}

type SkeletonListProps = {
  count?: number;
  children: React.ReactNode;
};

/**
 * Envuelve N copias de un skeleton y las oculta de los lectores de pantalla
 * tras una sola etiqueta "Cargando" (si no, VoiceOver lee cada bloque vacío).
 */
export function SkeletonList({ count = 3, children }: SkeletonListProps) {
  return (
    <View
      accessible
      accessibilityLabel="Cargando contenido"
      accessibilityRole="progressbar"
      importantForAccessibility="yes"
      style={styles.list}
    >
      {Array.from({ length: count }, (_, index) => (
        <View key={index} importantForAccessibility="no-hide-descendants">
          {children}
        </View>
      ))}
    </View>
  );
}

/** Tarjeta de publicación del feed: avatar + autor, dos líneas, imagen, acciones. */
export function PostCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Skeleton width={36} height={36} radius={Radius.pill} />
        <View style={styles.rowText}>
          <Skeleton width="55%" height={13} />
          <Skeleton width="30%" height={11} />
        </View>
      </View>
      <Skeleton width="100%" height={12} />
      <Skeleton width="85%" height={12} />
      <Skeleton width="100%" height={140} radius={Radius.md} />
      <View style={styles.row}>
        <Skeleton width={64} height={14} />
        <Skeleton width={64} height={14} />
      </View>
    </View>
  );
}

/** Fila de viaje: ruta + monto, horario, badges de estado. */
export function TripRowSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Skeleton width="55%" height={15} />
        <Skeleton width={72} height={15} />
      </View>
      <Skeleton width="40%" height={12} />
      <View style={styles.rowBetween}>
        <Skeleton width="35%" height={12} />
        <Skeleton width={110} height={24} radius={Radius.sm} />
      </View>
    </View>
  );
}

/** Fila de conversación: avatar, nombre, vista previa del último mensaje. */
export function ConversationRowSkeleton() {
  return (
    <View style={styles.conversationRow}>
      <Skeleton width={44} height={44} radius={Radius.pill} />
      <View style={styles.rowText}>
        <Skeleton width="45%" height={14} />
        <Skeleton width="75%" height={12} />
      </View>
      <Skeleton width={36} height={11} />
    </View>
  );
}

type ChatBubbleSkeletonProps = {
  /** Alterna el lado para que el bloque se lea como una conversación. */
  mine?: boolean;
};

/** Burbuja de chat, alineada a un lado u otro. */
export function ChatBubbleSkeleton({ mine = false }: ChatBubbleSkeletonProps) {
  return (
    <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
      <Skeleton
        width={mine ? '55%' : '68%'}
        height={mine ? 40 : 56}
        radius={Radius.lg}
        style={mine ? styles.bubbleMine : styles.bubbleTheirs}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.md,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  rowText: {
    flex: 1,
    gap: Spacing.xs,
  },
  conversationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: '#ffffff',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: Spacing.md,
  },
  bubbleRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
  },
  bubbleRowMine: {
    justifyContent: 'flex-end',
  },
  bubbleTheirs: {
    borderBottomLeftRadius: Radius.sm,
  },
  bubbleMine: {
    borderBottomRightRadius: Radius.sm,
  },
});
