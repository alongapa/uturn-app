import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { EventsWeekWidget } from '@/components/feed/events-week-widget';
import { useNotifications } from '@/contexts/NotificationsContext';
import { EditPostModal } from '@/components/feed/edit-post-modal';
import { FoldersWidget } from '@/components/feed/folders-widget';
import { PostCard } from '@/components/feed/post-card';
import type { PostMenuAction } from '@/components/feed/post-menu';
import { PostComposer } from '@/components/feed/post-composer';
import { RepliesModal } from '@/components/feed/replies-modal';
import { ReportSheet } from '@/components/safety/report-sheet';
import { StoriesRow } from '@/components/feed/stories-row';
import { StoryViewer } from '@/components/feed/story-viewer';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { PostCardSkeleton, SkeletonList } from '@/components/ui/Skeleton';
import { Layout, Spacing } from '@/constants/theme';
import { useUser } from '@/contexts/UserContext';
import { useLayout } from '@/hooks/use-layout';
import { usePermissions } from '@/hooks/use-permissions';
import { startDm } from '@/services/api/messages';
import type {
  FeedCursor,
  FeedPost,
  FeedStory,
  FeedStoryGroup,
  GalleryFolder,
} from '@/services/api/feed';
import {
  deletePost,
  deleteStory,
  listFeedPage,
  listGalleryFolders,
  listStories,
  listWeekEvents,
  mutePublisher,
  mutedPublisherIds,
  setLiked,
  setReposted,
  subscribeFeed,
  unmutePublisher,
} from '@/services/api/feed';

/**
 * Tab Inicio (Sesión 4): feed social estilo Twitter/Threads sobre Supabase.
 * Historias arriba, widget de eventos de la semana, feed cronológico paginado
 * por cursor, realtime para posts nuevos e interacciones optimistas.
 */
export default function FeedScreen() {
  const permissions = usePermissions();
  const { user } = useUser();
  const canPublish = permissions.isAtLeast('tutor');
  // Solo decide qué opciones muestra el menú. El alcance real (admin ⇒ solo
  // sus publishers, vía publisher_members) lo resuelve el servidor en
  // delete_post; el cliente no conoce las membresías.
  const canDeleteByRole = permissions.isAdmin;
  // Campanita del centro de notificaciones (Sesión 7): badge = no-leídos del
  // historial + chat, el mismo total que refleja el ícono de la app.
  const { unreadCount, chatUnread } = useNotifications();
  const bellBadge = unreadCount + chatUnread;

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [nextCursor, setNextCursor] = useState<FeedCursor | null>(null);
  const [stories, setStories] = useState<FeedStoryGroup[]>([]);
  const [events, setEvents] = useState<FeedPost[]>([]);
  const [folders, setFolders] = useState<GalleryFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasNewPosts, setHasNewPosts] = useState(false);
  const [composerVisible, setComposerVisible] = useState(false);
  const [storyGroupIndex, setStoryGroupIndex] = useState<number | null>(null);
  const [replyPost, setReplyPost] = useState<FeedPost | null>(null);
  const [reportPost, setReportPost] = useState<FeedPost | null>(null);
  const [editPost, setEditPost] = useState<FeedPost | null>(null);
  const [reportStory, setReportStory] = useState<FeedStory | null>(null);
  // Publicación e historia comparten el mismo diálogo de confirmación.
  const [pendingDelete, setPendingDelete] = useState<
    { kind: 'post'; post: FeedPost } | { kind: 'story'; story: FeedStory } | null
  >(null);
  const [deleting, setDeleting] = useState(false);
  const [muted, setMuted] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  const listRef = useRef<FlatList<FeedPost>>(null);
  const { screenPadding, topSpacing, bottomSpacing, contentWidthStyle } = useLayout();

  const loadAll = useCallback(async () => {
    const [page, storyGroups, weekEvents, galleryFolders, mutedIds] = await Promise.all([
      listFeedPage(),
      listStories(),
      listWeekEvents(),
      // Las colecciones degradan en silencio: no bloquean el feed.
      listGalleryFolders().catch(() => [] as GalleryFolder[]),
      mutedPublisherIds(),
    ]);
    setPosts(page.posts);
    setNextCursor(page.nextCursor);
    setStories(storyGroups);
    setEvents(weekEvents);
    setFolders(galleryFolders);
    setMuted(mutedIds);
    setHasNewPosts(false);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadAll()
      .catch(() => active && setLoadError(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [loadAll]);

  // Posts nuevos por realtime: banner arriba en vez de mover el scroll.
  useEffect(() => {
    const channel = subscribeFeed(() => setHasNewPosts(true));
    return () => {
      channel.unsubscribe();
    };
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadAll()
      .then(() => setLoadError(false))
      .catch(() => setLoadError(true))
      .finally(() => setRefreshing(false));
  }, [loadAll]);

  const handleLoadMore = useCallback(() => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    listFeedPage(nextCursor)
      .then((page) => {
        setPosts((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...page.posts.filter((p) => !seen.has(p.id))];
        });
        setNextCursor(page.nextCursor);
      })
      .catch(() => undefined)
      .finally(() => setLoadingMore(false));
  }, [nextCursor, loadingMore]);

  const showNewPosts = useCallback(() => {
    handleRefresh();
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [handleRefresh]);

  const patchPost = useCallback((postId: string, patch: (post: FeedPost) => FeedPost) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? patch(p) : p)));
  }, []);

  // Interacciones con actualización optimista: se refleja al tiro y se
  // revierte si el servidor rechaza (p. ej. sin conexión).
  const handleToggleLike = useCallback(
    (post: FeedPost) => {
      const liked = !post.likedByMe;
      patchPost(post.id, (p) => ({ ...p, likedByMe: liked, likes: Math.max(p.likes + (liked ? 1 : -1), 0) }));
      setLiked(post.id, liked).catch(() => {
        patchPost(post.id, (p) => ({ ...p, likedByMe: !liked, likes: Math.max(p.likes + (liked ? -1 : 1), 0) }));
        Alert.alert('No se pudo actualizar el me gusta');
      });
    },
    [patchPost]
  );

  const handleToggleRepost = useCallback(
    (post: FeedPost) => {
      const reposted = !post.repostedByMe;
      patchPost(post.id, (p) => ({
        ...p,
        repostedByMe: reposted,
        reposts: Math.max(p.reposts + (reposted ? 1 : -1), 0),
      }));
      setReposted(post.id, reposted).catch(() => {
        patchPost(post.id, (p) => ({
          ...p,
          repostedByMe: reposted ? false : true,
          reposts: Math.max(p.reposts + (reposted ? -1 : 1), 0),
        }));
        Alert.alert('No se pudo actualizar el repost');
      });
    },
    [patchPost]
  );

  const handleReplied = useCallback(
    (postId: string) => {
      patchPost(postId, (p) => ({ ...p, respuestas: p.respuestas + 1 }));
      setReplyPost((prev) => (prev && prev.id === postId ? { ...prev, respuestas: prev.respuestas + 1 } : prev));
    },
    [patchPost]
  );

  const handleOpenBot = useCallback((post: FeedPost) => {
    const botProfileId = post.publisher.botProfileId;
    if (!botProfileId) return;
    startDm(botProfileId)
      .then((conversation) => router.push({ pathname: '/chat/[id]', params: { id: conversation.id } }))
      .catch(() => Alert.alert('No se pudo abrir el chat con el bot.'));
  }, []);

  // --- Menú de tres puntos -------------------------------------------------

  /** Silencia o des-silencia una cuenta, con actualización optimista. */
  const toggleMute = useCallback(
    (publisherId: string) => {
      const wasMuted = muted.includes(publisherId);
      setMuted((prev) =>
        wasMuted ? prev.filter((id) => id !== publisherId) : [...prev, publisherId]
      );
      // Al silenciar, sus posts desaparecen al tiro; al des-silenciar hay que
      // recargar para recuperarlos (no están en memoria).
      if (!wasMuted) setPosts((prev) => prev.filter((p) => p.publisher.id !== publisherId));
      const run = wasMuted ? unmutePublisher : mutePublisher;
      run(publisherId)
        .then(() => {
          if (wasMuted) handleRefresh();
        })
        .catch((err: unknown) => {
          setMuted((prev) =>
            wasMuted ? [...prev, publisherId] : prev.filter((id) => id !== publisherId)
          );
          handleRefresh();
          setActionError(
            err instanceof Error ? err.message : 'No se pudo actualizar el silenciado.'
          );
        });
    },
    [muted, handleRefresh]
  );

  const handleMenuAction = useCallback(
    (post: FeedPost, action: PostMenuAction) => {
      switch (action) {
        case 'edit':
          setEditPost(post);
          break;
        case 'delete':
          // Confirmación con modal propio, nunca Alert: Alert.alert no existe
          // en react-native-web y el callback no se dispararía en la web.
          setPendingDelete({ kind: 'post', post });
          break;
        case 'report':
          setReportPost(post);
          break;
        case 'mute':
          toggleMute(post.publisher.id);
          break;
      }
    },
    [toggleMute]
  );

  const handleConfirmDelete = useCallback(() => {
    if (!pendingDelete) return;
    setDeleting(true);
    const target = pendingDelete;
    const run =
      target.kind === 'post' ? deletePost(target.post.id) : deleteStory(target.story.id);
    run
      .then(() => {
        // Borrado lógico en la BD; en pantalla simplemente desaparece.
        if (target.kind === 'post') {
          setPosts((prev) => prev.filter((p) => p.id !== target.post.id));
          setEvents((prev) => prev.filter((p) => p.id !== target.post.id));
        } else {
          setStoryGroupIndex(null);
          listStories().then(setStories).catch(() => undefined);
        }
        setPendingDelete(null);
      })
      .catch((err: unknown) => {
        setPendingDelete(null);
        setActionError(
          err instanceof Error
            ? err.message
            : `No se pudo eliminar la ${target.kind === 'post' ? 'publicación' : 'historia'}.`
        );
      })
      .finally(() => setDeleting(false));
  }, [pendingDelete]);

  const handleStoryMenuAction = useCallback(
    (story: FeedStory, group: FeedStoryGroup, action: PostMenuAction) => {
      switch (action) {
        case 'delete':
          setPendingDelete({ kind: 'story', story });
          break;
        case 'report':
          setStoryGroupIndex(null);  // el visor es fullscreen: cede el paso a la hoja
          setReportStory(story);
          break;
        case 'mute':
          setStoryGroupIndex(null);
          toggleMute(group.publisher.id);
          break;
        case 'edit':
          break;  // las historias no se editan
      }
    },
    [toggleMute]
  );

  const handleEdited = useCallback((updated: FeedPost) => {
    setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setEvents((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }, []);

  const handlePublished = useCallback(
    (kind: 'post' | 'story') => {
      if (kind === 'story') {
        listStories().then(setStories).catch(() => undefined);
      } else {
        handleRefresh();
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
      }
    },
    [handleRefresh]
  );

  const header = (
    <View>
      <StoriesRow groups={stories} onOpen={setStoryGroupIndex} />
      <EventsWeekWidget events={events} />
      <FoldersWidget folders={folders} />
      <Text style={styles.feedTitle}>Novedades</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: topSpacing + Spacing.mdPlus }]}>
        <TouchableOpacity
          style={styles.logoWrapper}
          onPress={() => router.push('/profile')}
          hitSlop={Layout.hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Mi perfil"
        >
          <Image source={require('../assets/icons/unities-icon-512.png')} style={styles.logo} />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Inicio</Text>
        <TouchableOpacity
          style={styles.logoWrapper}
          onPress={() => router.push('/notifications')}
          hitSlop={Layout.hitSlop}
          accessibilityRole="button"
          accessibilityLabel={
            bellBadge > 0 ? `Notificaciones, ${bellBadge} sin leer` : 'Notificaciones'
          }
        >
          <Ionicons name="notifications-outline" size={24} color="#0A1525" />
          {bellBadge > 0 && (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>{bellBadge > 99 ? '99+' : bellBadge}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={[styles.skeletonWrapper, contentWidthStyle, { paddingHorizontal: screenPadding }]}>
          <SkeletonList count={3}>
            <PostCardSkeleton />
          </SkeletonList>
        </View>
      ) : loadError && posts.length === 0 ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>No se pudo cargar el feed. Revisa tu conexión.</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={handleRefresh}
            accessibilityRole="button"
            accessibilityLabel="Reintentar cargar el feed"
          >
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              onToggleLike={handleToggleLike}
              onToggleRepost={handleToggleRepost}
              onReply={setReplyPost}
              onOpenBot={handleOpenBot}
              onMenuAction={handleMenuAction}
              isOwnPost={!!user?.id && item.authorId === user.id}
              canDeleteByRole={canDeleteByRole}
              muted={muted.includes(item.publisher.id)}
            />
          )}
          ListHeaderComponent={header}
          ListEmptyComponent={
            // Con permiso de publicar, el vacío ofrece la acción; sin permiso
            // solo explica qué va a aparecer acá (un botón que no puede usar
            // sería peor que no tener botón).
            canPublish ? (
              <EmptyState
                icon="newspaper-outline"
                title="Aún no hay publicaciones"
                message="Tu federación, centro de alumnos y departamentos publican acá sus novedades, eventos y beneficios. Parte tú."
                actionLabel="Publica algo"
                onAction={() => setComposerVisible(true)}
              />
            ) : (
              <EmptyState
                icon="newspaper-outline"
                title="Aún no hay publicaciones"
                message="Tu federación, centro de alumnos y departamentos publican acá sus novedades, eventos y beneficios. Pronto habrá movimiento."
              />
            )
          }
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={styles.footerLoader} color="#246BFD" /> : null
          }
          contentContainerStyle={[
            styles.listContent,
            contentWidthStyle,
            { paddingHorizontal: screenPadding, paddingBottom: bottomSpacing + Spacing.lg },
          ]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
        />
      )}

      {hasNewPosts && (
        <TouchableOpacity
          style={[styles.newPostsBanner, { top: topSpacing + 64 }]}
          onPress={showNewPosts}
          accessibilityRole="button"
          accessibilityLabel="Ver nuevas publicaciones"
        >
          <Ionicons name="arrow-up" size={14} color="#ffffff" />
          <Text style={styles.newPostsText}>Nuevas publicaciones</Text>
        </TouchableOpacity>
      )}

      {canPublish && (
        <TouchableOpacity
          // El FAB flotaba a 24 del borde y quedaba encima del tab bar.
          style={[styles.fab, { bottom: bottomSpacing + Spacing.lg }]}
          onPress={() => setComposerVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Crear publicación"
        >
          <Ionicons name="add" size={28} color="#ffffff" />
        </TouchableOpacity>
      )}

      <StoryViewer
        groups={stories}
        initialGroupIndex={storyGroupIndex}
        onClose={() => setStoryGroupIndex(null)}
        currentUserId={user?.id}
        canDeleteByRole={canDeleteByRole}
        mutedPublisherIds={muted}
        onMenuAction={handleStoryMenuAction}
      />
      <RepliesModal post={replyPost} onClose={() => setReplyPost(null)} onReplied={handleReplied} />
      {reportPost && (
        <ReportSheet
          visible={!!reportPost}
          onClose={() => setReportPost(null)}
          targetType="post"
          targetId={reportPost.id}
          targetUserId={reportPost.authorId}
          allowBlock={false}
        />
      )}
      {reportStory && (
        <ReportSheet
          visible={!!reportStory}
          onClose={() => setReportStory(null)}
          targetType="historia"
          targetId={reportStory.id}
          targetUserId={reportStory.authorId}
          allowBlock={false}
        />
      )}
      <EditPostModal post={editPost} onClose={() => setEditPost(null)} onSaved={handleEdited} />

      <ConfirmModal
        visible={!!pendingDelete}
        title={pendingDelete?.kind === 'story' ? '¿Eliminar historia?' : '¿Eliminar publicación?'}
        message={
          pendingDelete?.kind === 'story'
            ? 'Dejará de verse de inmediato. El equipo de moderación conserva una copia.'
            : 'Dejará de verse en el feed junto con sus respuestas. El equipo de moderación conserva una copia.'
        }
        confirmLabel="Eliminar"
        destructive
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmModal
        visible={!!actionError}
        title="No se pudo completar la acción"
        message={actionError ?? undefined}
        confirmLabel="Entendido"
        cancelLabel="Cerrar"
        onConfirm={() => setActionError(null)}
        onCancel={() => setActionError(null)}
      />

      <PostComposer
        visible={composerVisible}
        onClose={() => setComposerVisible(false)}
        onPublished={handlePublished}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    // paddingTop lo aporta useLayout(): antes el logo quedaba bajo el notch.
    paddingBottom: Spacing.xsPlus,
  },
  logoWrapper: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { width: 34, height: 34, resizeMode: 'contain' },
  bellBadge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadgeText: { color: '#ffffff', fontSize: 10, fontWeight: '800' },
  screenTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  skeletonWrapper: { paddingTop: Spacing.md },
  errorBox: { alignItems: 'center', marginTop: 48, gap: Spacing.md, paddingHorizontal: Spacing.xl },
  errorText: { color: '#475569', textAlign: 'center' },
  retryButton: {
    backgroundColor: '#0A1525',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 9,
    justifyContent: 'center',
    minHeight: Layout.touchTarget,
  },
  retryText: { color: '#ffffff', fontWeight: '700' },
  feedTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xsPlus,
    paddingBottom: 2,
  },
  // paddingHorizontal y paddingBottom los aporta useLayout().
  listContent: { gap: Spacing.smPlus },
  footerLoader: { marginVertical: Spacing.mdPlus },
  newPostsBanner: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xsPlus,
    backgroundColor: '#246BFD',
    borderRadius: 20,
    paddingHorizontal: Spacing.mdPlus,
    paddingVertical: Spacing.sm,
    minHeight: Layout.touchTarget,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  newPostsText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  fab: {
    position: 'absolute',
    right: 18,
    // bottom lo aporta useLayout(): antes quedaba bajo el tab bar.
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0A1525',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
});
