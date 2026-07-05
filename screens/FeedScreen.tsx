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
import { PostCard } from '@/components/feed/post-card';
import { PostComposer } from '@/components/feed/post-composer';
import { RepliesModal } from '@/components/feed/replies-modal';
import { StoriesRow } from '@/components/feed/stories-row';
import { StoryViewer } from '@/components/feed/story-viewer';
import { usePermissions } from '@/hooks/use-permissions';
import type { FeedCursor, FeedPost, FeedStoryGroup } from '@/services/api/feed';
import {
  listFeedPage,
  listStories,
  listWeekEvents,
  setLiked,
  setReposted,
  subscribeFeed,
} from '@/services/api/feed';

/**
 * Tab Inicio (Sesión 4): feed social estilo Twitter/Threads sobre Supabase.
 * Historias arriba, widget de eventos de la semana, feed cronológico paginado
 * por cursor, realtime para posts nuevos e interacciones optimistas.
 */
export default function FeedScreen() {
  const permissions = usePermissions();
  const canPublish = permissions.isAtLeast('tutor');

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [nextCursor, setNextCursor] = useState<FeedCursor | null>(null);
  const [stories, setStories] = useState<FeedStoryGroup[]>([]);
  const [events, setEvents] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasNewPosts, setHasNewPosts] = useState(false);
  const [composerVisible, setComposerVisible] = useState(false);
  const [storyGroupIndex, setStoryGroupIndex] = useState<number | null>(null);
  const [replyPost, setReplyPost] = useState<FeedPost | null>(null);

  const listRef = useRef<FlatList<FeedPost>>(null);

  const loadAll = useCallback(async () => {
    const [page, storyGroups, weekEvents] = await Promise.all([
      listFeedPage(),
      listStories(),
      listWeekEvents(),
    ]);
    setPosts(page.posts);
    setNextCursor(page.nextCursor);
    setStories(storyGroups);
    setEvents(weekEvents);
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
      <Text style={styles.feedTitle}>Novedades</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.logoWrapper} onPress={() => router.push('/profile')}>
          <Image source={require('../assets/images/logomini.png')} style={styles.logo} />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Inicio</Text>
        <View style={styles.logoWrapper} />
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" color="#246BFD" />
      ) : loadError && posts.length === 0 ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>No se pudo cargar el feed. Revisa tu conexión.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
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
            />
          )}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <Text style={styles.empty}>Aún no hay publicaciones. ¡Pronto habrá novedades del campus!</Text>
          }
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={styles.footerLoader} color="#246BFD" /> : null
          }
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
        />
      )}

      {hasNewPosts && (
        <TouchableOpacity style={styles.newPostsBanner} onPress={showNewPosts}>
          <Ionicons name="arrow-up" size={14} color="#ffffff" />
          <Text style={styles.newPostsText}>Nuevas publicaciones</Text>
        </TouchableOpacity>
      )}

      {canPublish && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setComposerVisible(true)}
          accessibilityLabel="Crear publicación"
        >
          <Ionicons name="add" size={28} color="#ffffff" />
        </TouchableOpacity>
      )}

      <StoryViewer
        groups={stories}
        initialGroupIndex={storyGroupIndex}
        onClose={() => setStoryGroupIndex(null)}
      />
      <RepliesModal post={replyPost} onClose={() => setReplyPost(null)} onReplied={handleReplied} />
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
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  logoWrapper: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { width: 34, height: 34, resizeMode: 'contain' },
  screenTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  loader: { marginTop: 48 },
  errorBox: { alignItems: 'center', marginTop: 48, gap: 12, paddingHorizontal: 24 },
  errorText: { color: '#475569', textAlign: 'center' },
  retryButton: {
    backgroundColor: '#0A1525',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  retryText: { color: '#ffffff', fontWeight: '700' },
  feedTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 2,
  },
  listContent: { paddingBottom: 90, gap: 10, paddingHorizontal: 12 },
  empty: { color: '#94a3b8', textAlign: 'center', marginTop: 24, paddingHorizontal: 24 },
  footerLoader: { marginVertical: 14 },
  newPostsBanner: {
    position: 'absolute',
    top: 64,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#246BFD',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
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
    bottom: 24,
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
