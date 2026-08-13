import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useLayout } from '@/hooks/use-layout';

export type LegalSection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type LegalDocumentContent = {
  title: string;
  intro: string;
  sections: LegalSection[];
};

/**
 * Renderiza un documento legal desde `constants/legal.json`.
 *
 * El contenido vive en JSON y no en JSX porque el mismo texto tiene que salir
 * publicado como página web para las fichas de App Store y Play Store (ambas
 * exigen una URL pública). Un solo origen y `scripts/generate-legal-docs.mjs`
 * emite el Markdown: así la versión que lee el revisor de la tienda y la que
 * lee el usuario dentro de la app no pueden decir cosas distintas.
 */
export function LegalDocument({
  content,
  updatedAt,
}: {
  content: LegalDocumentContent;
  updatedAt: string;
}) {
  const { screenPadding, bottomSpacing, contentWidthStyle } = useLayout();

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        contentWidthStyle,
        { paddingHorizontal: screenPadding, paddingBottom: bottomSpacing + Spacing.xl },
      ]}
    >
      <Text style={styles.title}>{content.title}</Text>
      <Text style={styles.updated}>Última actualización: {updatedAt}</Text>
      <Text style={styles.intro}>{content.intro}</Text>

      {content.sections.map((section) => (
        <View key={section.heading} style={styles.section}>
          <Text style={styles.heading} accessibilityRole="header">
            {section.heading}
          </Text>
          {section.paragraphs?.map((paragraph) => (
            <Text key={paragraph} style={styles.paragraph}>
              {paragraph}
            </Text>
          ))}
          {section.bullets?.map((bullet) => (
            <View key={bullet} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>{bullet}</Text>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: Spacing.lg, gap: Spacing.lg },
  title: { fontSize: 24, fontWeight: '800', color: '#0f172a' },
  updated: { fontSize: 12.5, color: '#94a3b8', marginTop: -Spacing.md },
  intro: { fontSize: 14.5, lineHeight: 22, color: '#334155' },
  section: { gap: Spacing.sm },
  heading: { fontSize: 16.5, fontWeight: '800', color: '#0f172a', marginTop: Spacing.sm },
  paragraph: { fontSize: 14, lineHeight: 21, color: '#475569' },
  bulletRow: { flexDirection: 'row', gap: Spacing.sm, paddingRight: Spacing.sm },
  bulletDot: { fontSize: 14, lineHeight: 21, color: '#246BFD' },
  bulletText: { flex: 1, fontSize: 14, lineHeight: 21, color: '#475569' },
});
