import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { FeedPublisher } from '@/services/api/feed';
import { PUBLISHER_KIND_COLORS, publisherInitials } from './feed-utils';

type Props = {
  publisher: FeedPublisher;
  size?: number;
};

/** Avatar circular del publisher: imagen si tiene, iniciales coloreadas si no. */
export function PublisherAvatar({ publisher, size = 44 }: Props) {
  const colors = PUBLISHER_KIND_COLORS[publisher.kind];
  const radius = size / 2;

  if (publisher.avatarUrl) {
    return (
      <Image
        source={{ uri: publisher.avatarUrl }}
        style={{ width: size, height: size, borderRadius: radius }}
        contentFit="cover"
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        { width: size, height: size, borderRadius: radius, backgroundColor: colors.bg },
      ]}
    >
      <Text style={[styles.initials, { color: colors.fg, fontSize: size * 0.36 }]}>
        {publisherInitials(publisher.name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontWeight: '800' },
});
