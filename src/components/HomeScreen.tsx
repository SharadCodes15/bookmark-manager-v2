import { useEffect, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  BookOpen,
  Network,
  MessageSquare,
  Sparkles,
  Clock,
  Tag,
  Folder,
  Layers,
  TrendingUp,
  Pin,
} from 'lucide-react';
import { useLinkMindStore } from '../store';
import { db } from '../db';
import { cn } from '../utils';
import type { Bookmark } from '../types';
import BookmarkCard from './BookmarkCard';
import ContextMenu from './ContextMenu';
import PinnedShortcutsSection from './PinnedShortcutsSection';


/* ------------------------------------------------------------------ */
/*  Seeded PRNG – Linear Congruential Generator                       */
/* ------------------------------------------------------------------ */

function hashDateString(dateStr: string): number {
  let h = 0;
  for (let i = 0; i < dateStr.length; i++) {
    h = h * 31 + dateStr.charCodeAt(i);
    h = h | 0; // keep 32-bit
  }
  return Math.abs(h);
}

function createSeededRng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function seededShuffle<T>(arr: T[], rng: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Daily picks computation                                           */
/* ------------------------------------------------------------------ */

async function computeDailyPicks(
  bookmarks: Bookmark[],
  todayStr: string,
): Promise<Bookmark[]> {
  if (bookmarks.length === 0) return [];
  if (bookmarks.length <= 5) return bookmarks;

  const seed = hashDateString(todayStr);
  const rng = createSeededRng(seed);

  // --- rediscovery bias: penalise recently-shown IDs ---
  let recentIds = new Set<string>();
  if (bookmarks.length > 15) {
    try {
      const history = await db.dailyPicksHistory.toArray();
      const sevenDaysAgo = Date.now() - 7 * 86_400_000;
      for (const entry of history) {
        const entryTs = new Date(entry.date).getTime();
        if (entryTs >= sevenDaysAgo && entry.date !== todayStr) {
          entry.bookmarkIds.forEach((id: string) => recentIds.add(id));
        }
      }
    } catch {
      /* table may not exist yet – ignore */
    }
  }

  // --- group by category then round-robin ---
  const buckets: Record<string, Bookmark[]> = {
    Project: [],
    Area: [],
    Resource: [],
  };
  for (const b of bookmarks) {
    (buckets[b.category] ?? (buckets[b.category] = [])).push(b);
  }

  // Within each bucket push recent IDs to the back, then shuffle
  for (const cat of Object.keys(buckets)) {
    const fresh = buckets[cat].filter((b) => !recentIds.has(b.id));
    const stale = buckets[cat].filter((b) => recentIds.has(b.id));
    buckets[cat] = [...seededShuffle(fresh, rng), ...seededShuffle(stale, rng)];
  }

  // Round-robin across categories
  const pickCount = Math.min(8, bookmarks.length);
  const picked: Bookmark[] = [];
  const cats = Object.keys(buckets).filter((c) => buckets[c].length > 0);
  const indices: Record<string, number> = {};
  cats.forEach((c) => (indices[c] = 0));

  let catIdx = 0;
  while (picked.length < pickCount) {
    const cat = cats[catIdx % cats.length];
    if (indices[cat] < buckets[cat].length) {
      picked.push(buckets[cat][indices[cat]++]);
    }
    catIdx++;
    // safety valve – if we've gone around and nothing was added, break
    if (catIdx > pickCount * cats.length + 10) break;
  }

  // --- persist & cleanup ---
  try {
    await db.dailyPicksHistory.put({
      date: todayStr,
      bookmarkIds: picked.map((b) => b.id),
    });

    // delete entries older than 14 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const allEntries = await db.dailyPicksHistory.toArray();
    const oldKeys = allEntries
      .filter((e) => e.date < cutoffStr)
      .map((e) => e.date);
    if (oldKeys.length) await db.dailyPicksHistory.bulkDelete(oldKeys);
  } catch {
    /* non-critical */
  }

  return picked;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function getGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pct(n: number, total: number): string {
  if (total === 0) return '0';
  return Math.round((n / total) * 100).toString();
}

/* ------------------------------------------------------------------ */
/*  Skeleton card                                                     */
/* ------------------------------------------------------------------ */

function SkeletonCard({ index }: { index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.06 }}
      className="glass-neumorphic-raised rounded-2xl p-4 space-y-3 animate-pulse"
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-surface-200/30" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-3/4 rounded bg-surface-200/30" />
          <div className="h-3 w-1/2 rounded bg-surface-200/20" />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="h-5 w-14 rounded-full bg-surface-200/20" />
        <div className="h-5 w-12 rounded-full bg-surface-200/20" />
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat card micro-component                                         */
/* ------------------------------------------------------------------ */

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  index,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  color: string;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 + index * 0.06 }}
      className="glass-neumorphic-raised rounded-2xl p-4 flex items-center gap-3.5 min-w-0"
    >
      <div
        className={cn(
          'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-inner',
          color,
        )}
      >
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-black text-surface-950 leading-none">
          {value}
        </p>
        <p className="text-xs text-surface-500 font-medium mt-1 truncate">{label}</p>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  HomeScreen                                                        */
/* ------------------------------------------------------------------ */

export default function HomeScreen() {
  const bookmarks = useLinkMindStore((s) => s.bookmarks);
  const collections = useLinkMindStore((s) => s.collections);
  const openAddModal = useLinkMindStore((s) => s.openAddModal);
  const setViewMode = useLinkMindStore((s) => s.setViewMode);
  const selectedBookmarkIds = useLinkMindStore((s) => s.selectedBookmarkIds);

  const [contextMenu, setContextMenu] = useState<{
    bookmark: Bookmark;
    position: { x: number; y: number };
  } | null>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, bookmark: Bookmark) => {
      e.preventDefault();
      setContextMenu({
        bookmark,
        position: { x: e.clientX, y: e.clientY },
      });
    },
    []
  );

  const [dailyPicks, setDailyPicks] = useState<Bookmark[]>([]);
  const [picksLoading, setPicksLoading] = useState(true);

  // ---- daily picks ----
  useEffect(() => {
    let cancelled = false;
    const todayStr = getTodayStr();

    setPicksLoading(true);
    computeDailyPicks(bookmarks, todayStr).then((picks) => {
      if (!cancelled) {
        setDailyPicks(picks);
        setPicksLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [bookmarks]);

  // ---- derived stats ----
  const stats = useMemo(() => {
    const total = bookmarks.length;
    const active = bookmarks.filter((b) => b.status === 'Active').length;
    const toRead = bookmarks.filter((b) => b.status === 'To Read').length;
    const idle = bookmarks.filter((b) => b.status === 'Idle').length;

    const project = bookmarks.filter((b) => b.category === 'Project').length;
    const area = bookmarks.filter((b) => b.category === 'Area').length;
    const resource = bookmarks.filter((b) => b.category === 'Resource').length;

    const tagMap = new Map<string, number>();
    for (const b of bookmarks) {
      for (const t of b.tags) {
        tagMap.set(t, (tagMap.get(t) ?? 0) + 1);
      }
    }
    const topTags = [...tagMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const collMap = new Map<string, number>();
    for (const b of bookmarks) {
      if (b.collectionId) {
        collMap.set(b.collectionId, (collMap.get(b.collectionId) ?? 0) + 1);
      }
    }
    const topCollections = [...collMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => ({
        name: collections.find((c) => c.id === id)?.name ?? 'Unknown',
        color: collections.find((c) => c.id === id)?.color ?? '#6366f1',
        count,
      }));

    return {
      total,
      active,
      toRead,
      idle,
      project,
      area,
      resource,
      uniqueTags: tagMap.size,
      topTags,
      topCollections,
    };
  }, [bookmarks, collections]);

  // ---- recently added ----
  const recentlyAdded = useMemo(
    () =>
      [...bookmarks].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5),
    [bookmarks],
  );

  // ---- pinned bookmarks ----
  const pinnedBookmarks = useMemo(
    () => bookmarks.filter((b) => b.pinned),
    [bookmarks]
  );

  // ---- quick actions ----
  const quickActions = [
    {
      label: 'Add Link',
      icon: Plus,
      onClick: openAddModal,
      gradient: 'from-indigo-500/10 to-violet-500/10 hover:from-indigo-500/20 hover:to-violet-500/20 text-indigo-400 border border-indigo-500/20',
    },
    {
      label: 'Library',
      icon: BookOpen,
      onClick: () => setViewMode('grid'),
      gradient: 'from-emerald-500/10 to-teal-500/10 hover:from-emerald-500/20 hover:to-teal-500/20 text-emerald-400 border border-emerald-500/20',
    },
    {
      label: 'Mind Map',
      icon: Network,
      onClick: () => setViewMode('mindmap'),
      gradient: 'from-amber-500/10 to-orange-500/10 hover:from-amber-500/20 hover:to-orange-500/20 text-amber-400 border border-amber-500/20',
    },
    {
      label: 'AI Chat',
      icon: MessageSquare,
      onClick: () => setViewMode('chatbot'),
      gradient: 'from-sky-500/10 to-cyan-500/10 hover:from-sky-500/20 hover:to-cyan-500/20 text-sky-400 border border-sky-500/20',
    },
  ];

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-6 pb-12 scrollbar-thin">
      <div className="max-w-7xl mx-auto pt-6 space-y-8">
        
        {/* ── 1. Greeting Header ────────────────────────────────── */}
        <motion.header
          initial={{ opacity: 0, y: -18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-glass-border pb-6"
        >
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight">
              <span className="bg-gradient-to-r from-accent-primary via-accent-secondary to-accent-primary bg-clip-text text-transparent">
                {getGreeting()}
              </span>
            </h1>
            <p className="text-surface-500 mt-1.5 text-sm sm:text-base font-semibold">
              {formatDate()}
            </p>
          </div>
        </motion.header>

        {/* ── Dashboard Grid Layout ─────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Column (2/3 width on large screens) */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* ── Pinned Shortcuts Section ──────────────────────── */}
            <section className="space-y-4">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="flex items-center gap-2"
              >
                <Pin size={20} className="text-accent-secondary rotate-45" />
                <h2 className="text-xl font-bold text-surface-950">
                  Pinned Shortcuts
                </h2>
              </motion.div>

              {pinnedBookmarks.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {pinnedBookmarks.map((bookmark, index) => (
                    <motion.div
                      key={bookmark.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{
                        delay: index * 0.05,
                        type: 'spring',
                        stiffness: 260,
                        damping: 22,
                      }}
                    >
                      <BookmarkCard
                        bookmark={bookmark}
                        isSelected={selectedBookmarkIds.has(bookmark.id)}
                        onContextMenu={handleContextMenu}
                      />
                    </motion.div>
                  ))}
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="glass-neumorphic-raised rounded-2xl p-6 text-center border border-dashed border-glass-border"
                >
                  <p className="text-xs text-surface-500 font-semibold">
                    Right-click any bookmark in the Library and select "Pin" to add it here for quick access.
                  </p>
                </motion.div>
              )}
            </section>

            {/* ── 2. Today's Picks ──────────────────────────────── */}
            <section className="space-y-4">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 }}
                className="flex items-center gap-2"
              >
                <Sparkles size={20} className="text-accent-primary" />
                <h2 className="text-xl font-bold text-surface-950">
                  Today's Picks
                </h2>
              </motion.div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {picksLoading
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <SkeletonCard key={i} index={i} />
                    ))
                  : dailyPicks.map((bookmark, index) => (
                      <motion.div
                        key={bookmark.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{
                          delay: index * 0.06,
                          type: 'spring',
                          stiffness: 260,
                          damping: 22,
                        }}
                      >
                        <BookmarkCard
                          bookmark={bookmark}
                          isSelected={selectedBookmarkIds.has(bookmark.id)}
                          onContextMenu={handleContextMenu}
                        />
                      </motion.div>
                    ))}
              </div>

              {!picksLoading && dailyPicks.length === 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="glass-neumorphic-raised rounded-2xl p-8 text-center"
                >
                  <Sparkles
                    size={28}
                    className="mx-auto mb-2 text-surface-400"
                  />
                  <p className="text-surface-600 text-sm font-medium">
                    Add some bookmarks to see your daily picks here!
                  </p>
                </motion.div>
              )}
            </section>

            {/* ── 4. Recently Added ─────────────────────────────── */}
            {recentlyAdded.length > 0 && (
              <section className="space-y-4">
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="flex items-center gap-2"
                >
                  <Clock size={20} className="text-accent-primary" />
                  <h2 className="text-xl font-bold text-surface-950">
                    Recently Added
                  </h2>
                </motion.div>

                <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-thin -mx-1 px-1 snap-x">
                  {recentlyAdded.map((bookmark, index) => (
                    <motion.div
                      key={bookmark.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.18 + index * 0.06 }}
                      className="min-w-[280px] max-w-[320px] shrink-0 snap-start"
                    >
                      <BookmarkCard
                        bookmark={bookmark}
                        isSelected={selectedBookmarkIds.has(bookmark.id)}
                        onContextMenu={handleContextMenu}
                      />
                    </motion.div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Pinned Shortcuts Folders Row ─────────────────── */}
            <PinnedShortcutsSection />
          </div>


          {/* Sidebar Column (1/3 width on large screens) */}
          <div className="space-y-8">
            
            {/* ── 5. Quick Actions ──────────────────────────────── */}
            <section className="space-y-4">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="flex items-center gap-2"
              >
                <Sparkles size={20} className="text-accent-secondary" />
                <h2 className="text-xl font-bold text-surface-950">
                  Quick Actions
                </h2>
              </motion.div>

              <div className="grid grid-cols-2 gap-3">
                {quickActions.map((action, index) => (
                  <motion.button
                    key={action.label}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.22 + index * 0.06 }}
                    whileHover={{ scale: 1.04, y: -2 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={action.onClick}
                    className={cn(
                      'glass-neumorphic-raised rounded-2xl p-4 flex flex-col items-center justify-center text-center gap-2.5',
                      'cursor-pointer transition-all duration-200',
                      'hover:border-accent-primary/40',
                      'group',
                    )}
                  >
                    <action.icon
                      size={20}
                      className="transition-colors"
                    />
                    <span className="text-xs font-bold text-surface-850 group-hover:text-surface-950 transition-colors">
                      {action.label}
                    </span>
                  </motion.button>
                ))}
              </div>
            </section>

            {/* ── 3. Stats Panel ────────────────────────────────── */}
            {bookmarks.length > 0 && (
              <section className="space-y-4">
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                  className="flex items-center gap-2"
                >
                  <TrendingUp size={20} className="text-accent-secondary" />
                  <h2 className="text-xl font-bold text-surface-950">
                    Overview
                  </h2>
                </motion.div>

                <div className="space-y-4">
                  {/* Grid metrics */}
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard
                      icon={Layers}
                      label="Total Links"
                      value={stats.total}
                      color="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                      index={0}
                    />
                    <StatCard
                      icon={Folder}
                      label="Collections"
                      value={collections.length}
                      color="bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      index={1}
                    />
                    <StatCard
                      icon={Tag}
                      label="Unique Tags"
                      value={stats.uniqueTags}
                      color="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      index={2}
                    />
                    <StatCard
                      icon={TrendingUp}
                      label="Active Links"
                      value={stats.active}
                      color="bg-sky-500/10 text-sky-400 border border-sky-500/20"
                      index={3}
                    />
                  </div>

                  {/* Status Breakdown Panel */}
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35 }}
                    className="glass-neumorphic-raised rounded-2xl p-4"
                  >
                    <p className="text-[10px] font-bold text-surface-500 uppercase tracking-widest mb-3">
                      Status Breakdown
                    </p>
                    <div className="h-2.5 rounded-full overflow-hidden flex bg-surface-200/50 mb-3.5">
                      {stats.active > 0 && (
                        <div
                          className="h-full bg-accent-success transition-all"
                          style={{ width: `${pct(stats.active, stats.total)}%` }}
                        />
                      )}
                      {stats.toRead > 0 && (
                        <div
                          className="h-full bg-accent-info transition-all"
                          style={{ width: `${pct(stats.toRead, stats.total)}%` }}
                        />
                      )}
                      {stats.idle > 0 && (
                        <div
                          className="h-full bg-status-idle transition-all"
                          style={{ width: `${pct(stats.idle, stats.total)}%` }}
                        />
                      )}
                    </div>
                    <div className="flex flex-col gap-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 font-medium text-surface-700">
                          <span className="w-2.5 h-2.5 rounded-full bg-accent-success" />
                          Active
                        </span>
                        <span className="font-bold text-surface-900 tabular-nums">
                          {stats.active} ({pct(stats.active, stats.total)}%)
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 font-medium text-surface-700">
                          <span className="w-2.5 h-2.5 rounded-full bg-accent-info" />
                          To Read
                        </span>
                        <span className="font-bold text-surface-900 tabular-nums">
                          {stats.toRead} ({pct(stats.toRead, stats.total)}%)
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 font-medium text-surface-700">
                          <span className="w-2.5 h-2.5 rounded-full bg-status-idle" />
                          Idle
                        </span>
                        <span className="font-bold text-surface-900 tabular-nums">
                          {stats.idle} ({pct(stats.idle, stats.total)}%)
                        </span>
                      </div>
                    </div>
                  </motion.div>

                  {/* Categories Panel */}
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="glass-neumorphic-raised rounded-2xl p-4"
                  >
                    <p className="text-[10px] font-bold text-surface-500 uppercase tracking-widest mb-3">
                      Categories
                    </p>
                    <div className="space-y-3">
                      {[
                        { label: 'Project', count: stats.project, color: 'bg-category-project' },
                        { label: 'Area', count: stats.area, color: 'bg-category-area' },
                        { label: 'Resource', count: stats.resource, color: 'bg-category-resource' },
                      ].map((cat) => (
                        <div key={cat.label} className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-semibold">
                            <span className="text-surface-700">{cat.label}</span>
                            <span className="text-surface-900 tabular-nums">{cat.count}</span>
                          </div>
                          <div className="h-2 rounded-full bg-surface-200/50 overflow-hidden">
                            <div
                              className={cn('h-full rounded-full transition-all', cat.color)}
                              style={{ width: `${stats.total > 0 ? (cat.count / stats.total) * 100 : 0}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>

                  {/* Insights Panel (Top Tags & Collections) */}
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.45 }}
                    className="glass-neumorphic-raised rounded-2xl p-4 space-y-5"
                  >
                    {/* Top Tags */}
                    {stats.topTags.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold text-surface-500 uppercase tracking-widest">
                          Top Tags
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {stats.topTags.map(([tag, count]) => (
                            <span
                              key={tag}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-surface-200 hover:bg-surface-300 text-surface-800 border border-glass-border transition-colors cursor-default"
                            >
                              <span>#{tag}</span>
                              <span className="text-surface-500 font-bold text-[10px]">
                                {count}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Top Collections */}
                    {stats.topCollections.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold text-surface-500 uppercase tracking-widest">
                          Top Collections
                        </p>
                        <div className="space-y-2">
                          {stats.topCollections.map((coll) => (
                            <div
                              key={coll.name}
                              className="flex items-center justify-between text-xs font-semibold"
                            >
                              <span className="flex items-center gap-2 text-surface-700 truncate">
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: coll.color }}
                                />
                                <span className="truncate">{coll.name}</span>
                              </span>
                              <span className="text-surface-500 shrink-0 ml-2 tabular-nums">
                                {coll.count}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
      {/* Context Menu */}
      <AnimatePresence>
        {contextMenu && (
          <ContextMenu
            bookmark={contextMenu.bookmark}
            position={contextMenu.position}
            onClose={() => setContextMenu(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
