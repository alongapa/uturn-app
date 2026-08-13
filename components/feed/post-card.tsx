import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { FeedPost } from '@/services/api/feed';
import {
  POST_TYPE_COLORS,
  POST_TYPE_LABEL,
  PUBLISHER_KIND_COLORS,
  PUBLISHER_KIND_LABEL,
  formatEventDate,
  timeAgo,
} from './feed-utils';
import { PostMenu, type PostMenuAction } from './post-menu';
import { PublisherAvatar } from './publisher-avatar';

type Props = {
  post: FeedPost;
  onToggleLike: (post: FeedPost) => void;
  onToggleRepost: (post: FeedPost) => void;
  onReply: (post: FeedPost) => void;
  /** Abre el DM con el bot de IA del publisher (si tiene uno habilitado). */
  onOpenBot?: (post: FeedPost) => void;
  /** Acción elegida en el menú de tres puntos (editar/eliminar/reportar/silenciar). */
  onMenuAction?: (post: FeedPost, action: PostMenuAction) => void;
  /** true si el post es del usuario actual (el menú ofrece editar/eliminar). */
  isOwnPost?: boolean;
  /** true si además puede eliminar por rol (owner/admin); lo valida el servidor. */
  canDeleteByRole?: boolean;
  /** true si el usuario ya silenció a esta cuenta. */
  muted?: boolean;
};

const MEDIA_HEIGHT = 220;

/**
 * Tarjeta del feed diferenciada por tipo: galería paginada para carretes
 * (varias imágenes), chip de fecha para eventos, badge para activaciones y
 * caja de código (+ enlace al catálogo de canjes) para descuentos.
 */
export function PostCard({
  post,
  onToggleLike,
  onToggleRepost,
  onReply,
  onOpenBot,
  onMenuAction,
  isOwnPost = false,
  canDeleteByRole = false,
  muted = false,
}: Props) {
  const [mediaWidth, setMediaWidth] = useState(0);
  const [mediaIndex, setMediaIndex] = useState(0);

  const kindColors = PUBLISHER_KIND_COLORS[post.publisher.kind];
  const typeColors = POST_TYPE_COLORS[post.tipo];
  const isCarrete = post.media.length > 1;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <PublisherAvatar publisher={post.publisher} size={42} />
        <View style={styles.headerText}>
          <Text style={styles.publisherName} numberOfLines={1}>
            {post.publisher.name}
          </Text>
          <View style={styles.headerMetaRow}>
            <Text style={[styles.kindBadge, { color: kindColors.fg, backgroundColor: kindColors.bg }]}>
              {PUBLISHER_KIND_LABEL[post.publisher.kind]}
            </Text>
            <Text style={styles.timestamp}>{timeAgo(post.createdAt)}</Text>
            {post.editedAt ? <Text style={styles.editedTag}>· editado</Text> : null}
          </View>
        </View>
        {post.publisher.botProfileId && (
          <TouchableOpacity
            style={styles.botButton}
            onPress={() => onOpenBot?.(post)}
            accessibilityLabel={`Chatear con el bot de ${post.publisher.name}`}
          >
            <Ionicons name="sparkles" size={14} color="#7c3aed" />
          </TouchableOpacity>
        )}
        {post.tipo !== 'noticia' && (
          <Text style={[styles.typeBadge, { color: typeColors.fg, backgroundColor: typeColors.bg }]}>
            {POST_TYPE_LABEL[post.tipo]}
          </Text>
        )}
        {onMenuAction && (
          <PostMenu
            canEdit={isOwnPost}
            canDelete={isOwnPost || canDeleteByRole}
            isOwnContent={isOwnPost}
            publisherName={post.publisher.name}
            muted={muted}
            onAction={(action) => onMenuAction(post, action)}
          />
        )}
      </View>

      {post.brand ? (
        <View style={styles.brandRow}>
          {post.brand.logoUrl ? (
            <Image source={{ uri: post.brand.logoUrl }} style={styles.brandLogo} contentFit="cover" />
          ) : (
            <Ionicons name="ribbon-outline" size={14} color="#64748b" />
          )}
          <Text style={styles.brandText}>Junto a {post.brand.name}</Text>
        </View>
      ) : null}

      {post.texto ? <Text style={styles.body}>{post.texto}</Text> : null}

      {post.tipo === 'evento' && post.eventoFecha ? (
        <View style={styles.eventRow}>
          <View style={styles.eventChip}>
            <Ionicons name="calendar-outline" size={14} color="#7c3aed" />
            <Text style={styles.eventChipText}>{formatEventDate(post.eventoFecha)}</Text>
          </View>
          {post.eventoLugar ? (
            <View style={styles.eventChip}>
              <Ionicons name="location-outline" size={14} color="#7c3aed" />
              <Text style={styles.eventChipText} numberOfLines={1}>
                {post.eventoLugar}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {post.tipo === 'activacion' && post.eventoFecha ? (
        <View style={styles.eventRow}>
          <View style={[styles.eventChip, styles.activationChip]}>
            <Ionicons name="megaphone-outline" size={14} color="#b45309" />
            <Text style={[styles.eventChipText, styles.activationChipText]}>
              {formatEventDate(post.eventoFecha)}
              {post.eventoLugar ? ` · ${post.eventoLugar}` : ''}
            </Text>
          </View>
        </View>
      ) : null}

      {post.media.length > 0 && (
        <View
          style={styles.mediaWrapper}
          onLayout={(e) => setMediaWidth(e.nativeEvent.layout.width)}
        >
          {mediaWidth > 0 && (
            <>
              <FlatList
                data={post.media}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyExtractor={(url, index) => `${post.id}-media-${index}`}
                renderItem={({ item }) => (
                  <Image
                    source={{ uri: item }}
                    style={{ width: mediaWidth, height: MEDIA_HEIGHT }}
                    contentFit="cover"
                  />
                )}
                onMomentumScrollEnd={(e) =>
                  setMediaIndex(Math.round(e.nativeEvent.contentOffset.x / Math.max(mediaWidth, 1)))
                }
              />
              {isCarrete && (
                <View style={styles.dotsRow}>
                  {post.media.map((_, index) => (
                    <View
                      key={`${post.id}-dot-${index}`}
                      style={[styles.dot, index === mediaIndex && styles.dotActive]}
                    />
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      )}

      {post.tipo === 'descuento' && post.codigo ? (
        <View style={styles.discountBox}>
          <View style={styles.discountCodeRow}>
            <Ionicons name="pricetag-outline" size={16} color="#15803d" />
            <Text style={styles.discountCode}>{post.codigo}</Text>
          </View>
          {post.condiciones ? <Text style={styles.discountTerms}>{post.condiciones}</Text> : null}
          {post.redeemableId ? (
            <TouchableOpacity style={styles.discountLink} onPress={() => router.push('/redeem')}>
              <Text style={styles.discountLinkText}>Ver en canjes Unities</Text>
              <Ionicons name="chevron-forward" size={14} color="#15803d" />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.action}
          onPress={() => onReply(post)}
          accessibilityLabel="Responder"
        >
          <Ionicons name="chatbubble-outline" size={19} color="#64748b" />
          <Text style={styles.actionCount}>{post.respuestas > 0 ? post.respuestas : ''}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.action}
          onPress={() => onToggleRepost(post)}
          accessibilityLabel="Repostear"
        >
          <Ionicons name="repeat" size={21} color={post.repostedByMe ? '#15803d' : '#64748b'} />
          <Text style={[styles.actionCount, post.repostedByMe && styles.repostedCount]}>
            {post.reposts > 0 ? post.reposts : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.action}
          onPress={() => onToggleLike(post)}
          accessibilityLabel="Me gusta"
        >
          <Ionicons
            name={post.likedByMe ? 'heart' : 'heart-outline'}
            size={20}
            color={post.likedByMe ? '#dc2626' : '#64748b'}
          />
          <Text style={[styles.actionCount, post.likedByMe && styles.likedCount]}>
            {post.likes > 0 ? post.likes : ''}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    gap: 10,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerText: { flex: 1, gap: 3 },
  publisherName: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  headerMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kindBadge: {
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  timestamp: { color: '#94a3b8', fontSize: 12 },
  editedTag: { color: '#94a3b8', fontSize: 12, fontStyle: 'italic' },
  botButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#faf5ff',
    borderWidth: 1,
    borderColor: '#e9d5ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeBadge: {
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandLogo: { width: 16, height: 16, borderRadius: 4 },
  brandText: { color: '#64748b', fontSize: 12, fontWeight: '600', fontStyle: 'italic' },
  body: { color: '#0f172a', fontSize: 14.5, lineHeight: 21 },
  eventRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  eventChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ede9fe',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  eventChipText: { color: '#7c3aed', fontSize: 12, fontWeight: '700', flexShrink: 1 },
  activationChip: { backgroundColor: '#fef3c7' },
  activationChipText: { color: '#b45309' },
  mediaWrapper: { borderRadius: 12, overflow: 'hidden', backgroundColor: '#f1f5f9' },
  dotsRow: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  dotActive: { backgroundColor: '#ffffff' },
  discountBox: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#16a34a',
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  discountCodeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  discountCode: { color: '#15803d', fontWeight: '900', fontSize: 17, letterSpacing: 1.5 },
  discountTerms: { color: '#166534', fontSize: 12, lineHeight: 17 },
  discountLink: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  discountLinkText: { color: '#15803d', fontWeight: '700', fontSize: 13 },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 8,
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 48, justifyContent: 'center' },
  actionCount: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  likedCount: { color: '#dc2626' },
  repostedCount: { color: '#15803d' },
});
