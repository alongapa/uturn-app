import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import QAScreen from '@/screens/QAScreen';

/**
 * Tab Tutorías: Q&A por temas (preguntas, tutores y guías). Antes vivía como
 * atajo dentro del tab Mensajes; ahora es un tab propio. Las rutas internas
 * (/qa/[id], /qa/ask, /tutor/[id], /guides/upload) siguen en el stack raíz.
 */
export default function TutoriasTab() {
  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.screenTitle}>Tutorías</Text>
      </View>
      <QAScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  topBar: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  screenTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
});
