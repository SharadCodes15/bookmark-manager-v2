import { useState, useMemo, useEffect } from 'react';
import {
  AlertTriangle,
  Check,
  X,
  Sparkles,
  Tag,
  Info,
  Calendar,
  Layers,
  Search,
  CheckCircle,
  HelpCircle
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { db } from '../db';
import { useLinkMindStore } from '../store';
import { formatDate } from '../utils';
import type { Bookmark, Category, Status } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalizes a URL string for comparison:
 * - Prepends http:// if missing (for parsing)
 * - Lowercases the domain
 * - Strips common tracking parameters (utm_*, fbclid, etc.)
 * - Strips trailing slashes from the path (but not root path /)
 */
function normalizeUrl(urlString: string): string {
  let cleanStr = urlString.trim();
  if (!/^https?:\/\//i.test(cleanStr)) {
    cleanStr = 'https://' + cleanStr;
  }
  try {
    const url = new URL(cleanStr);
    url.hostname = url.hostname.toLowerCase();

    // Get all query params keys, find any starting with 'utm_' or matching common tracking params
    const keys = Array.from(url.searchParams.keys());
    keys.forEach(key => {
      const k = key.toLowerCase();
      if (k.startsWith('utm_') || 
          ['fbclid', 'gclid', 'msclkid', 'yclid', 'mc_cid', 'mc_eid', 'ref', 'source'].includes(k)) {
        url.searchParams.delete(key);
      }
    });

    let pathname = url.pathname;
    if (pathname.endsWith('/') && pathname !== '/') {
      pathname = pathname.slice(0, -1);
    }

    let search = url.searchParams.toString();
    search = search ? '?' + search : '';

    return `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}${pathname}${search}${url.hash}`;
  } catch {
    let normalized = urlString.trim().toLowerCase();
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  }
}

/**
 * Calculates the Levenshtein distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  const tmp = [];
  let i, j;
  for (i = 0; i <= a.length; i++) {
    tmp.push([i]);
  }
  for (j = 0; j <= b.length; j++) {
    tmp[0][j] = j;
  }
  for (i = 1; i <= a.length; i++) {
    for (j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1, // deletion
        tmp[i][j - 1] + 1, // insertion
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1) // substitution
      );
    }
  }
  return tmp[a.length][b.length];
}

/**
 * Checks if two tags are near duplicates:
 * - Case-insensitive plural/singular variants
 * - Spelling variations (Levenshtein distance <= 1 for tags >= 4 chars)
 */
function isNearDuplicate(tag1: string, tag2: string): boolean {
  const t1 = tag1.toLowerCase().trim();
  const t2 = tag2.toLowerCase().trim();
  if (t1 === t2) return false;

  // Plural/singular check:
  if (t1 + 's' === t2 || t2 + 's' === t1) return true;
  if (t1 + 'es' === t2 || t2 + 'es' === t1) return true;

  // e.g. "category" and "categories"
  if (t1.endsWith('y') && t2.endsWith('ies')) {
    if (t1.slice(0, -1) === t2.slice(0, -3)) return true;
  }
  if (t2.endsWith('y') && t1.endsWith('ies')) {
    if (t2.slice(0, -1) === t1.slice(0, -3)) return true;
  }

  // Levenshtein check for spelling variants
  if (t1.length >= 4 && t2.length >= 4) {
    const dist = levenshteinDistance(t1, t2);
    if (dist <= 1) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// CleanupTab Component
// ---------------------------------------------------------------------------

export default function CleanupTab() {
  const { bookmarks, collections } = useLinkMindStore();

  // Tab selections
  const [activeSubTab, setActiveSubTab] = useState<'duplicates' | 'tags'>('duplicates');
  const [tagsSection, setTagsSection] = useState<'casing' | 'near' | 'manager'>('casing');

  // Review states (Duplicates)
  const [reviewMode, setReviewMode] = useState(false);
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0);

  // Edit details states (Duplicates Review)
  const [selectedKeepId, setSelectedKeepId] = useState<string>('');
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState<Category>('Resource');
  const [editStatus, setEditStatus] = useState<Status>('Active');
  const [editCollectionId, setEditCollectionId] = useState<string>('');
  const [editTagsString, setEditTagsString] = useState('');

  // Casing consolidate custom state
  const [customCasingValues, setCustomCasingValues] = useState<Record<string, string>>({});
  const [selectedCasingCanonical, setSelectedCasingCanonical] = useState<Record<string, string>>({});

  // Near-duplicate merge state
  const [selectedNearCanonical, setSelectedNearCanonical] = useState<Record<string, string>>({});
  const [customNearValues, setCustomNearValues] = useState<Record<string, string>>({});
  const [ignoredPairs, setIgnoredPairs] = useState<Set<string>>(new Set());

  // Global tag manager state
  const [tagSearch, setTagSearch] = useState('');
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteTag, setConfirmDeleteTag] = useState<string | null>(null);

  // Cumulative session stats
  const [duplicatesRemoved, setDuplicatesRemoved] = useState(0);
  const [tagsMerged, setTagsMerged] = useState(0);

  // ---------------------------------------------------------------------------
  // Calculations
  // ---------------------------------------------------------------------------

  // Group bookmarks by normalized URL
  const duplicateGroups = useMemo(() => {
    const groupsMap = new Map<string, Bookmark[]>();
    for (const b of bookmarks) {
      const norm = normalizeUrl(b.url);
      const list = groupsMap.get(norm) || [];
      list.push(b);
      groupsMap.set(norm, list);
    }

    const groups = Array.from(groupsMap.values()).filter(g => g.length > 1);
    groups.forEach(g => {
      g.sort((a, b) => a.createdAt - b.createdAt); // Oldest first
    });
    return groups;
  }, [bookmarks]);

  const bookmarksToRemoveCount = useMemo(() => {
    return duplicateGroups.reduce((sum, g) => sum + (g.length - 1), 0);
  }, [duplicateGroups]);

  // Unique tags and counts
  const tagStats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const b of bookmarks) {
      for (const t of b.tags) {
        counts[t] = (counts[t] || 0) + 1;
      }
    }
    return counts;
  }, [bookmarks]);

  const uniqueTags = useMemo(() => {
    return Object.keys(tagStats).sort((a, b) => a.localeCompare(b));
  }, [tagStats]);

  // Case-insensitive groups
  const caseDuplicateGroups = useMemo(() => {
    const groupsMap = new Map<string, string[]>();
    for (const tag of uniqueTags) {
      const lower = tag.toLowerCase();
      const list = groupsMap.get(lower) || [];
      if (!list.includes(tag)) {
        list.push(tag);
      }
      groupsMap.set(lower, list);
    }

    return Array.from(groupsMap.entries())
      .filter(([_, list]) => list.length > 1)
      .map(([lower, list]) => {
        // Sort variations by usage count descending (highest first)
        const sortedList = [...list].sort((a, b) => (tagStats[b] || 0) - (tagStats[a] || 0));
        return {
          lower,
          variations: sortedList,
          totalCount: list.reduce((sum, v) => sum + (tagStats[v] || 0), 0)
        };
      });
  }, [uniqueTags, tagStats]);

  // Near-duplicates (casing differences ignored)
  const nearDuplicatePairs = useMemo(() => {
    const uniqueLowerTags = Array.from(new Set(uniqueTags.map(t => t.toLowerCase())));
    const pairs: { tag1: string; count1: number; tag2: string; count2: number }[] = [];

    for (let i = 0; i < uniqueLowerTags.length; i++) {
      const t1 = uniqueLowerTags[i];
      for (let j = i + 1; j < uniqueLowerTags.length; j++) {
        const t2 = uniqueLowerTags[j];

        if (isNearDuplicate(t1, t2)) {
          // Find representative casings
          const vars1: string[] = [];
          const vars2: string[] = [];
          for (const ut of uniqueTags) {
            const utLower = ut.toLowerCase();
            if (utLower === t1) vars1.push(ut);
            if (utLower === t2) vars2.push(ut);
          }

          const rep1 = vars1.sort((a, b) => (tagStats[b] || 0) - (tagStats[a] || 0))[0] || t1;
          const rep2 = vars2.sort((a, b) => (tagStats[b] || 0) - (tagStats[a] || 0))[0] || t2;

          const pairKey = [rep1.toLowerCase(), rep2.toLowerCase()].sort().join('::');
          if (ignoredPairs.has(pairKey)) continue;

          const count1 = vars1.reduce((sum, v) => sum + (tagStats[v] || 0), 0);
          const count2 = vars2.reduce((sum, v) => sum + (tagStats[v] || 0), 0);

          pairs.push({
            tag1: rep1,
            count1,
            tag2: rep2,
            count2
          });
        }
      }
    }
    return pairs;
  }, [uniqueTags, tagStats, ignoredPairs]);

  // Search filtered tags for Global Tag Manager
  const filteredTags = useMemo(() => {
    if (!tagSearch.trim()) return uniqueTags;
    const query = tagSearch.toLowerCase().trim();
    return uniqueTags.filter(t => t.toLowerCase().includes(query));
  }, [uniqueTags, tagSearch]);

  // ---------------------------------------------------------------------------
  // Sync Edit form for current duplicate group
  // ---------------------------------------------------------------------------
  // Sync form when currentReviewIndex changes
  useEffect(() => {
    if (!reviewMode || duplicateGroups.length === 0) return;
    const currentGroup = duplicateGroups[currentReviewIndex];
    if (!currentGroup) return;

    const defaultKeep = currentGroup[0];

    setSelectedKeepId(defaultKeep.id);
    setEditTitle(defaultKeep.title);
    setEditCategory(defaultKeep.category);
    setEditStatus(defaultKeep.status);
    setEditCollectionId(defaultKeep.collectionId || '');

    // Merge tags from all bookmarks in the group
    const allTags = new Set<string>();
    currentGroup.forEach(b => b.tags.forEach(t => allTags.add(t)));
    setEditTagsString(Array.from(allTags).join(', '));
  }, [currentReviewIndex, reviewMode, duplicateGroups]);

  // If reviews completed or index goes out of bounds
  useEffect(() => {
    if (reviewMode) {
      if (duplicateGroups.length === 0) {
        setReviewMode(false);
      } else if (currentReviewIndex >= duplicateGroups.length) {
        setCurrentReviewIndex(Math.max(0, duplicateGroups.length - 1));
      }
    }
  }, [duplicateGroups, reviewMode, currentReviewIndex]);

  // ---------------------------------------------------------------------------
  // Actions & Consolidations
  // ---------------------------------------------------------------------------

  /** Shows glassy running confirmation toast */
  const triggerCleanupToast = (newDupesRemoved: number, newTagsMerged: number) => {
    const nextDupes = duplicatesRemoved + newDupesRemoved;
    const nextTags = tagsMerged + newTagsMerged;

    setDuplicatesRemoved(nextDupes);
    setTagsMerged(nextTags);

    toast.success(`Cleaned up: ${nextDupes} duplicate${nextDupes !== 1 ? 's' : ''} removed, ${nextTags} tag${nextTags !== 1 ? 's' : ''} merged`, {
      id: 'cleanup-toast', // Replaces/updates the same toast
      duration: 4000
    });
  };

  /** Handles selecting which copy to keep during review */
  const handleSelectKeep = (b: Bookmark) => {
    setSelectedKeepId(b.id);
    setEditTitle(b.title);
    setEditCategory(b.category);
    setEditStatus(b.status);
    setEditCollectionId(b.collectionId || '');
  };

  /** Confirms resolution of the current duplicate group */
  const handleConfirmReviewGroup = async () => {
    const currentGroup = duplicateGroups[currentReviewIndex];
    if (!currentGroup) return;

    const idsToDelete = currentGroup
      .map(b => b.id)
      .filter(id => id !== selectedKeepId);

    const tagsParsed = editTagsString
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    // Save edited bookmark
    await db.bookmarks.update(selectedKeepId, {
      title: editTitle.trim(),
      category: editCategory,
      status: editStatus,
      collectionId: editCollectionId || undefined,
      tags: tagsParsed
    });

    // Delete duplicates
    await db.bookmarks.bulkDelete(idsToDelete);

    // Toast & Refresh
    triggerCleanupToast(idsToDelete.length, 0);
    await useLinkMindStore.getState().loadData();
  };

  /** Resolves all duplicate groups instantly with defaults */
  const handleResolveAllDefaults = async () => {
    if (duplicateGroups.length === 0) return;

    let removed = 0;
    for (const group of duplicateGroups) {
      const keep = group[0]; // Oldest copy
      const others = group.slice(1);

      // Merge tags
      const allTags = new Set<string>();
      group.forEach(b => b.tags.forEach(t => allTags.add(t)));

      // Save kept bookmark with merged tags
      await db.bookmarks.update(keep.id, { tags: Array.from(allTags) });

      // Delete others
      const otherIds = others.map(o => o.id);
      await db.bookmarks.bulkDelete(otherIds);
      removed += otherIds.length;
    }

    triggerCleanupToast(removed, 0);
    await useLinkMindStore.getState().loadData();
  };

  /** Unified Tag merger (handles casings, plurals, renames) */
  const handleMergeTags = async (tagsToMerge: string[], canonicalTag: string) => {
    const canonicalOriginal = canonicalTag.trim();
    if (!canonicalOriginal) return;

    const lowerToMerge = tagsToMerge.map(t => t.toLowerCase());
    const affectedBookmarks = bookmarks.filter(b => 
      b.tags.some(t => lowerToMerge.includes(t.toLowerCase()))
    );

    let bookmarksUpdated = 0;
    for (const b of affectedBookmarks) {
      let replaced = false;
      const nextTags: string[] = [];

      b.tags.forEach(tag => {
        const isMatch = lowerToMerge.includes(tag.toLowerCase());
        if (isMatch) {
          replaced = true;
          if (!nextTags.includes(canonicalOriginal)) {
            nextTags.push(canonicalOriginal);
          }
        } else {
          if (!nextTags.includes(tag)) {
            nextTags.push(tag);
          }
        }
      });

      if (replaced) {
        await db.bookmarks.update(b.id, { tags: nextTags });
        bookmarksUpdated++;
      }
    }

    // Number of variations merged into 1 = list length - 1 (or 1 if renaming 1 tag)
    const nMerged = tagsToMerge.length > 1 ? tagsToMerge.length - 1 : 1;
    triggerCleanupToast(0, nMerged);

    // Refresh state
    await useLinkMindStore.getState().loadData();
  };

  /** Deletes a tag globally from all bookmarks */
  const handleDeleteTagGlobally = async (tagToDelete: string) => {
    const affected = bookmarks.filter(b => b.tags.includes(tagToDelete));
    for (const b of affected) {
      const nextTags = b.tags.filter(t => t !== tagToDelete);
      await db.bookmarks.update(b.id, { tags: nextTags });
    }

    triggerCleanupToast(0, 1);
    await useLinkMindStore.getState().loadData();
    setConfirmDeleteTag(null);
  };

  /** Ignore near-duplicate pair in this session */
  const handleIgnorePair = (t1: string, t2: string) => {
    const pairKey = [t1.toLowerCase(), t2.toLowerCase()].sort().join('::');
    setIgnoredPairs(prev => {
      const next = new Set(prev);
      next.add(pairKey);
      return next;
    });
  };

  // ---------------------------------------------------------------------------
  // Render sub-tabs
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* ── Sub Tabs Selector ────────────────────────────────────────── */}
      <div className="flex border-b border-glass-border gap-6">
        <button
          onClick={() => {
            setActiveSubTab('duplicates');
            setReviewMode(false);
          }}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'duplicates'
              ? 'border-accent-primary text-accent-primary'
              : 'border-transparent text-surface-600 hover:text-surface-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          Duplicate Bookmarks
          {duplicateGroups.length > 0 && (
            <span className="bg-accent-primary/20 text-accent-primary-light text-xs px-2 py-0.5 rounded-full font-bold">
              {duplicateGroups.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveSubTab('tags')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'tags'
              ? 'border-accent-primary text-accent-primary'
              : 'border-transparent text-surface-600 hover:text-surface-800'
          }`}
        >
          <Tag className="w-4 h-4" />
          Tag Cleanup
          {(caseDuplicateGroups.length + nearDuplicatePairs.length) > 0 && (
            <span className="bg-accent-secondary/20 text-accent-secondary text-xs px-2 py-0.5 rounded-full font-bold">
              {caseDuplicateGroups.length + nearDuplicatePairs.length}
            </span>
          )}
        </button>
      </div>

      {/* ── SUB-TAB: DUPLICATES ───────────────────────────────────────── */}
      {activeSubTab === 'duplicates' && (
        <div className="space-y-4">
          {!reviewMode ? (
            /* SUMMARY VIEW */
            duplicateGroups.length === 0 ? (
              <div className="glass-subtle rounded-2xl p-8 text-center flex flex-col items-center justify-center space-y-3 border border-accent-success/10 bg-accent-success/2">
                <CheckCircle className="w-12 h-12 text-accent-success animate-float" />
                <h4 className="text-base font-bold text-surface-900">Library is Clean</h4>
                <p className="text-xs text-surface-600 max-w-sm leading-relaxed">
                  No duplicate bookmark URLs were found. Everything is perfectly organized.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="border border-accent-primary/25 bg-accent-primary/5 rounded-2xl p-5 space-y-4">
                  <h4 className="text-sm font-bold text-accent-primary-light flex items-center gap-2">
                    <AlertTriangle className="w-4.5 h-4.5" />
                    Duplicate Bookmarks Found
                  </h4>
                  <p className="text-xs text-surface-600 leading-relaxed">
                    We detected <strong className="text-surface-900">{bookmarksToRemoveCount} duplicate bookmark(s)</strong> across <strong className="text-surface-900">{duplicateGroups.length} groups</strong>. You can review them one by one or merge all using the defaults (keeping the oldest copy and merging all unique tags).
                  </p>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => {
                        setReviewMode(true);
                        setCurrentReviewIndex(0);
                      }}
                      className="bg-gradient-to-r from-accent-primary to-accent-secondary text-white px-5 py-2.5 rounded-xl text-xs font-semibold hover:shadow-lg hover:shadow-accent-primary/20 transition-all cursor-pointer"
                    >
                      Review All ({duplicateGroups.length})
                    </button>
                    <button
                      onClick={handleResolveAllDefaults}
                      className="bg-surface-300 border border-glass-border hover:bg-surface-400 text-surface-850 px-5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                    >
                      Resolve All with Defaults
                    </button>
                  </div>
                </div>

                {/* Preview List */}
                <div className="glass-subtle p-5 rounded-2xl space-y-3">
                  <h4 className="text-xs font-semibold text-surface-700 uppercase tracking-wider">
                    Duplicate Groups Preview
                  </h4>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {duplicateGroups.map((group, idx) => (
                      <div key={idx} className="bg-surface-200/50 hover:bg-surface-200 p-3 rounded-xl border border-glass-border flex items-center justify-between text-xs transition-colors">
                        <div className="truncate flex-1 pr-4">
                          <span className="font-semibold text-surface-900 block truncate">{group[0].title}</span>
                          <span className="text-surface-500 truncate block mt-0.5 font-mono text-[10px]">{normalizeUrl(group[0].url)}</span>
                        </div>
                        <span className="bg-surface-300 text-surface-700 px-2.5 py-1 rounded-lg shrink-0 font-bold">
                          {group.length} copies
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          ) : (
            /* STEP BY STEP REVIEW FLOW */
            (() => {
              const currentGroup = duplicateGroups[currentReviewIndex];
              if (!currentGroup) return null;

              return (
                <div className="space-y-5">
                  {/* Progress Header */}
                  <div className="flex items-center justify-between text-xs bg-surface-50/50 px-4 py-2.5 rounded-xl border border-glass-border">
                    <span className="text-surface-600 font-medium">
                      Reviewing Group <strong>{currentReviewIndex + 1}</strong> of <strong>{duplicateGroups.length}</strong>
                    </span>
                    <button
                      onClick={() => setReviewMode(false)}
                      className="text-surface-500 hover:text-surface-800 transition-colors flex items-center gap-1 font-medium"
                    >
                      Cancel Review
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Progress Bar */}
                  <div className="h-1 bg-surface-200 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${((currentReviewIndex + 1) / duplicateGroups.length) * 100}%` }}
                      className="h-full bg-gradient-to-r from-accent-primary to-accent-secondary transition-all duration-300"
                    />
                  </div>

                  {/* Instructions */}
                  <div className="text-xs text-surface-600 leading-relaxed bg-surface-200/30 p-3.5 rounded-xl border border-glass-border flex gap-2">
                    <Info className="w-4 h-4 text-accent-primary shrink-0 mt-0.5" />
                    <span>
                      Select the bookmark copy you want to keep. The other copies will be deleted. Any tags on discarded copies will be merged into the kept copy below.
                    </span>
                  </div>

                  {/* Side-by-Side Copies */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-64 overflow-y-auto pr-1">
                    {currentGroup.map((b) => {
                      const isSelected = selectedKeepId === b.id;
                      const coll = collections.find(c => c.id === b.collectionId);

                      return (
                        <div
                          key={b.id}
                          onClick={() => handleSelectKeep(b)}
                          className={`p-4 rounded-xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                            isSelected
                              ? 'bg-accent-primary/5 border-accent-primary ring-1 ring-accent-primary/20 text-surface-900 shadow-md'
                              : 'bg-surface-300 border-glass-border hover:border-surface-400 text-surface-700'
                          }`}
                        >
                          <div className="absolute top-3.5 right-3.5">
                            <div className={`w-4.5 h-4.5 rounded-full border flex items-center justify-center transition-all ${
                              isSelected ? 'border-accent-primary bg-accent-primary text-white' : 'border-surface-500'
                            }`}>
                              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                          </div>

                          <div className="space-y-2 pr-6">
                            <h5 className="font-bold text-sm truncate" title={b.title}>{b.title}</h5>
                            <p className="text-[10px] text-surface-500 truncate font-mono" title={b.url}>
                              {b.url}
                            </p>

                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              <span className={`pill pill-${b.category.toLowerCase()}`}>{b.category}</span>
                              <span className={`pill pill-${b.status.toLowerCase().replace(' ', '')}`}>{b.status}</span>
                              {coll && (
                                <span className="tag-chip flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full ring-1 ring-white/10" style={{ backgroundColor: coll.color }} />
                                  {coll.name}
                                </span>
                              )}
                            </div>

                            <span className="text-[10px] text-surface-500 flex items-center gap-1 pt-0.5">
                              <Calendar className="w-3 h-3 text-surface-500" />
                              Added: {formatDate(b.createdAt)}
                            </span>
                          </div>

                          {b.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-3 border-t border-glass-border mt-3">
                              {b.tags.map(t => (
                                <span key={t} className="tag-chip font-semibold text-[9px]">#{t}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Edit Panel for Kept Bookmark */}
                  <div className="glass-subtle p-5 rounded-2xl space-y-4">
                    <h4 className="text-xs font-bold text-surface-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-accent-primary" />
                      Configure Kept Copy
                    </h4>

                    <div className="space-y-3.5">
                      {/* Title */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-surface-600 uppercase tracking-wider">Title</label>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={e => setEditTitle(e.target.value)}
                          className="w-full rounded-xl border border-glass-border bg-surface-200 px-4 py-2 text-sm text-surface-900 focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/20 transition-all"
                        />
                      </div>

                      {/* Category & Status */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-surface-600 uppercase tracking-wider">Category</label>
                          <select
                            value={editCategory}
                            onChange={e => setEditCategory(e.target.value as Category)}
                            className="w-full rounded-xl border border-glass-border bg-surface-200 px-3 py-2 text-sm text-surface-900 focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/20 transition-all"
                          >
                            <option value="Project">Project</option>
                            <option value="Area">Area</option>
                            <option value="Resource">Resource</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-surface-600 uppercase tracking-wider">Status</label>
                          <select
                            value={editStatus}
                            onChange={e => setEditStatus(e.target.value as Status)}
                            className="w-full rounded-xl border border-glass-border bg-surface-200 px-3 py-2 text-sm text-surface-900 focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/20 transition-all"
                          >
                            <option value="Active">Active</option>
                            <option value="Idle">Idle</option>
                            <option value="To Read">To Read</option>
                          </select>
                        </div>
                      </div>

                      {/* Collection */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-surface-600 uppercase tracking-wider">Collection</label>
                        <select
                          value={editCollectionId}
                          onChange={e => setEditCollectionId(e.target.value)}
                          className="w-full rounded-xl border border-glass-border bg-surface-200 px-4 py-2 text-sm text-surface-900 focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/20 transition-all"
                        >
                          <option value="">None</option>
                          {collections.map(col => (
                            <option key={col.id} value={col.id}>{col.name}</option>
                          ))}
                        </select>
                      </div>

                      {/* Tags */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-surface-600 uppercase tracking-wider">Tags (comma-separated)</label>
                        <input
                          type="text"
                          value={editTagsString}
                          onChange={e => setEditTagsString(e.target.value)}
                          placeholder="e.g. tech, coding, tutorial"
                          className="w-full rounded-xl border border-glass-border bg-surface-200 px-4 py-2 text-sm text-surface-900 focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/20 transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end items-center gap-3 pt-2">
                    <button
                      onClick={() => setCurrentReviewIndex((currentReviewIndex + 1) % duplicateGroups.length)}
                      className="bg-surface-300 hover:bg-surface-400 text-surface-850 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer border border-glass-border"
                    >
                      Skip Group
                    </button>
                    <button
                      onClick={handleConfirmReviewGroup}
                      disabled={!editTitle.trim()}
                      className="bg-gradient-to-r from-accent-primary to-accent-secondary text-white px-6 py-2.5 rounded-xl text-xs font-semibold hover:shadow-lg hover:shadow-accent-primary/20 transition-all cursor-pointer disabled:opacity-40"
                    >
                      Confirm & Resolve
                    </button>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* ── SUB-TAB: TAGS ────────────────────────────────────────────── */}
      {activeSubTab === 'tags' && (
        <div className="space-y-5">
          {/* Mini Sub-sections Switcher */}
          <div className="flex bg-surface-200 p-1 rounded-xl border border-glass-border gap-1 text-xs">
            <button
              onClick={() => setTagsSection('casing')}
              className={`flex-1 text-center py-2 rounded-lg font-semibold transition-all cursor-pointer ${
                tagsSection === 'casing' ? 'bg-surface-350 text-surface-950 shadow-sm' : 'text-surface-600 hover:text-surface-800'
              }`}
            >
              Case Variations ({caseDuplicateGroups.length})
            </button>
            <button
              onClick={() => setTagsSection('near')}
              className={`flex-1 text-center py-2 rounded-lg font-semibold transition-all cursor-pointer ${
                tagsSection === 'near' ? 'bg-surface-350 text-surface-950 shadow-sm' : 'text-surface-600 hover:text-surface-800'
              }`}
            >
              Near-duplicates ({nearDuplicatePairs.length})
            </button>
            <button
              onClick={() => {
                setTagsSection('manager');
                setEditingTag(null);
                setConfirmDeleteTag(null);
              }}
              className={`flex-1 text-center py-2 rounded-lg font-semibold transition-all cursor-pointer ${
                tagsSection === 'manager' ? 'bg-surface-350 text-surface-950 shadow-sm' : 'text-surface-600 hover:text-surface-800'
              }`}
            >
              Global Tag Manager ({uniqueTags.length})
            </button>
          </div>

          {/* SECTION 1: CASE MERGES */}
          {tagsSection === 'casing' && (
            <div className="space-y-4">
              {caseDuplicateGroups.length === 0 ? (
                <div className="glass-subtle rounded-2xl p-8 text-center flex flex-col items-center justify-center space-y-3 border border-accent-success/10 bg-accent-success/2">
                  <CheckCircle className="w-11 h-11 text-accent-success animate-float" />
                  <h4 className="text-sm font-bold text-surface-900">Casing is Perfect</h4>
                  <p className="text-xs text-surface-600 max-w-sm leading-relaxed">
                    No duplicate tags with different casings were found.
                  </p>
                </div>
              ) : (
                <div className="space-y-3.5 max-h-[420px] overflow-y-auto pr-1">
                  {caseDuplicateGroups.map((group) => {
                    // Chosen variation
                    const selectedCanonical = selectedCasingCanonical[group.lower] || group.variations[0];
                    const customValue = customCasingValues[group.lower] || '';
                    const isCustomSelected = selectedCanonical === '__custom__';

                    return (
                      <div key={group.lower} className="glass-subtle p-5 rounded-2xl border border-glass-border space-y-4">
                        <div className="flex justify-between items-center border-b border-glass-border pb-2.5">
                          <h4 className="text-xs font-bold text-surface-900 flex items-center gap-1.5">
                            <Tag className="w-3.5 h-3.5 text-accent-primary" />
                            Consolidate Tag: <span className="font-mono bg-surface-300 px-1.5 py-0.5 rounded text-accent-secondary text-[10px]">#{group.lower}</span>
                          </h4>
                          <span className="text-[10px] text-surface-500 font-medium">
                            {group.totalCount} total uses
                          </span>
                        </div>

                        {/* Options */}
                        <div className="space-y-2">
                          <p className="text-[10px] font-semibold text-surface-600 uppercase tracking-wider mb-1">
                            Choose Canonical casing:
                          </p>
                          {group.variations.map((v) => (
                            <label key={v} className="flex items-center gap-3.5 text-xs text-surface-800 cursor-pointer bg-surface-200/30 hover:bg-surface-200/75 p-2 rounded-xl transition-colors border border-transparent hover:border-glass-border">
                              <input
                                type="radio"
                                name={`casing-${group.lower}`}
                                checked={selectedCanonical === v}
                                onChange={() => {
                                  setSelectedCasingCanonical(prev => ({ ...prev, [group.lower]: v }));
                                }}
                                className="accent-accent-primary w-3.5 h-3.5"
                              />
                              <span className="font-semibold text-surface-900">#{v}</span>
                              <span className="text-[10px] text-surface-500 font-mono">({tagStats[v] || 0} uses)</span>
                            </label>
                          ))}

                          {/* Custom Option */}
                          <label className="flex items-center gap-3.5 text-xs text-surface-800 cursor-pointer bg-surface-200/30 hover:bg-surface-200/75 p-2 rounded-xl transition-colors border border-transparent hover:border-glass-border">
                            <input
                              type="radio"
                              name={`casing-${group.lower}`}
                              checked={isCustomSelected}
                              onChange={() => {
                                setSelectedCasingCanonical(prev => ({ ...prev, [group.lower]: '__custom__' }));
                              }}
                              className="accent-accent-primary w-3.5 h-3.5"
                            />
                            <span className="text-surface-600 font-medium">Custom Casing:</span>
                            <input
                              type="text"
                              value={customValue}
                              placeholder="e.g. Courses"
                              disabled={!isCustomSelected}
                              onClick={e => {
                                e.stopPropagation();
                                setSelectedCasingCanonical(prev => ({ ...prev, [group.lower]: '__custom__' }));
                              }}
                              onChange={e => {
                                setCustomCasingValues(prev => ({ ...prev, [group.lower]: e.target.value }));
                              }}
                              className="bg-surface-200 border border-glass-border rounded px-2.5 py-0.5 text-xs text-surface-900 focus:outline-none focus:border-accent-primary ml-1 flex-1 max-w-[150px] disabled:opacity-40"
                            />
                          </label>
                        </div>

                        {/* Submit Button */}
                        <div className="flex justify-end pt-1">
                          <button
                            onClick={() => {
                              const canonical = isCustomSelected ? customValue.trim() : selectedCanonical;
                              if (!canonical) {
                                toast.error('Please specify a canonical tag name');
                                return;
                              }
                              void handleMergeTags(group.variations, canonical);
                            }}
                            className="bg-accent-primary text-white hover:bg-accent-primary-light px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                          >
                            Merge Variations
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SECTION 2: NEAR DUPLICATES */}
          {tagsSection === 'near' && (
            <div className="space-y-4">
              {nearDuplicatePairs.length === 0 ? (
                <div className="glass-subtle rounded-2xl p-8 text-center flex flex-col items-center justify-center space-y-3 border border-accent-success/10 bg-accent-success/2">
                  <CheckCircle className="w-11 h-11 text-accent-success animate-float" />
                  <h4 className="text-sm font-bold text-surface-900">Tags are Distinct</h4>
                  <p className="text-xs text-surface-600 max-w-sm leading-relaxed">
                    No near-duplicate tag spelling or plural variations were found.
                  </p>
                </div>
              ) : (
                <div className="space-y-3.5 max-h-[420px] overflow-y-auto pr-1">
                  {nearDuplicatePairs.map((pair) => {
                    const pairKey = [pair.tag1.toLowerCase(), pair.tag2.toLowerCase()].sort().join('::');
                    const selectedCanonical = selectedNearCanonical[pairKey] || pair.tag1;
                    const customValue = customNearValues[pairKey] || '';
                    const isCustomSelected = selectedCanonical === '__custom__';

                    return (
                      <div key={pairKey} className="glass-subtle p-5 rounded-2xl border border-glass-border space-y-4">
                        <div className="flex justify-between items-center border-b border-glass-border pb-2.5">
                          <h4 className="text-xs font-bold text-surface-900 flex items-center gap-1.5">
                            <HelpCircle className="w-4 h-4 text-accent-warning shrink-0" />
                            Review Similar Tags
                          </h4>
                          <span className="text-[10px] text-accent-warning font-semibold bg-accent-warning/10 px-2 py-0.5 rounded-full">
                            Suggested Near-duplicate
                          </span>
                        </div>

                        {/* Options */}
                        <div className="space-y-2">
                          <p className="text-[10px] font-semibold text-surface-600 uppercase tracking-wider mb-1">
                            Choose Tag to Merge into:
                          </p>

                          {/* Choice 1 */}
                          <label className="flex items-center gap-3.5 text-xs text-surface-800 cursor-pointer bg-surface-200/30 hover:bg-surface-200/75 p-2 rounded-xl transition-colors border border-transparent hover:border-glass-border">
                            <input
                              type="radio"
                              name={`near-${pairKey}`}
                              checked={selectedCanonical === pair.tag1}
                              onChange={() => {
                                setSelectedNearCanonical(prev => ({ ...prev, [pairKey]: pair.tag1 }));
                              }}
                              className="accent-accent-primary w-3.5 h-3.5"
                            />
                            <span className="font-semibold text-surface-900">#{pair.tag1}</span>
                            <span className="text-[10px] text-surface-500 font-mono">({pair.count1} uses)</span>
                          </label>

                          {/* Choice 2 */}
                          <label className="flex items-center gap-3.5 text-xs text-surface-800 cursor-pointer bg-surface-200/30 hover:bg-surface-200/75 p-2 rounded-xl transition-colors border border-transparent hover:border-glass-border">
                            <input
                              type="radio"
                              name={`near-${pairKey}`}
                              checked={selectedCanonical === pair.tag2}
                              onChange={() => {
                                setSelectedNearCanonical(prev => ({ ...prev, [pairKey]: pair.tag2 }));
                              }}
                              className="accent-accent-primary w-3.5 h-3.5"
                            />
                            <span className="font-semibold text-surface-900">#{pair.tag2}</span>
                            <span className="text-[10px] text-surface-500 font-mono">({pair.count2} uses)</span>
                          </label>

                          {/* Custom Option */}
                          <label className="flex items-center gap-3.5 text-xs text-surface-800 cursor-pointer bg-surface-200/30 hover:bg-surface-200/75 p-2 rounded-xl transition-colors border border-transparent hover:border-glass-border">
                            <input
                              type="radio"
                              name={`near-${pairKey}`}
                              checked={isCustomSelected}
                              onChange={() => {
                                setSelectedNearCanonical(prev => ({ ...prev, [pairKey]: '__custom__' }));
                              }}
                              className="accent-accent-primary w-3.5 h-3.5"
                            />
                            <span className="text-surface-600 font-medium">Custom Tag name:</span>
                            <input
                              type="text"
                              value={customValue}
                              placeholder="e.g. course"
                              disabled={!isCustomSelected}
                              onClick={e => {
                                e.stopPropagation();
                                setSelectedNearCanonical(prev => ({ ...prev, [pairKey]: '__custom__' }));
                              }}
                              onChange={e => {
                                setCustomNearValues(prev => ({ ...prev, [pairKey]: e.target.value }));
                              }}
                              className="bg-surface-200 border border-glass-border rounded px-2.5 py-0.5 text-xs text-surface-900 focus:outline-none focus:border-accent-primary ml-1 flex-1 max-w-[150px] disabled:opacity-40"
                            />
                          </label>
                        </div>

                        {/* Actions */}
                        <div className="flex justify-end items-center gap-3 pt-1">
                          <button
                            onClick={() => handleIgnorePair(pair.tag1, pair.tag2)}
                            className="text-surface-500 hover:text-surface-850 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                          >
                            Ignore Suggestion
                          </button>
                          <button
                            onClick={() => {
                              const canonical = isCustomSelected ? customValue.trim() : selectedCanonical;
                              if (!canonical) {
                                toast.error('Please specify a tag name');
                                return;
                              }
                              void handleMergeTags([pair.tag1, pair.tag2], canonical);
                            }}
                            className="bg-accent-primary text-white hover:bg-accent-primary-light px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                          >
                            Merge Tags
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SECTION 3: GLOBAL TAG MANAGER */}
          {tagsSection === 'manager' && (
            <div className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
                <input
                  type="text"
                  placeholder="Search tags..."
                  value={tagSearch}
                  onChange={e => setTagSearch(e.target.value)}
                  className="w-full rounded-xl border border-glass-border bg-surface-200 pl-10 pr-4 py-2.5 text-sm text-surface-900 focus:outline-none focus:border-accent-primary"
                />
              </div>

              {/* Tag List */}
              <div className="glass-subtle p-2 rounded-2xl border border-glass-border overflow-hidden">
                <div className="max-h-72 overflow-y-auto space-y-1 p-1">
                  {filteredTags.length === 0 ? (
                    <p className="text-xs text-surface-500 italic p-4 text-center">No tags found</p>
                  ) : (
                    filteredTags.map((tag) => {
                      const count = tagStats[tag] || 0;
                      const isEditing = editingTag === tag;
                      const isConfirmingDelete = confirmDeleteTag === tag;

                      return (
                        <div key={tag} className="flex items-center justify-between p-2 rounded-xl hover:bg-surface-200/50 transition-colors border border-transparent hover:border-glass-border">
                          {isEditing ? (
                            /* Inline Rename Form */
                            <div className="flex items-center gap-2 flex-1 mr-4">
                              <input
                                autoFocus
                                type="text"
                                value={renameValue}
                                onChange={e => setRenameValue(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    void handleMergeTags([tag], renameValue);
                                    setEditingTag(null);
                                  } else if (e.key === 'Escape') {
                                    setEditingTag(null);
                                  }
                                }}
                                className="bg-surface-300 border border-glass-border rounded-lg px-2.5 py-1 text-xs text-surface-900 focus:outline-none focus:border-accent-primary flex-1 max-w-[200px]"
                              />
                              <button
                                onClick={() => {
                                  void handleMergeTags([tag], renameValue);
                                  setEditingTag(null);
                                }}
                                disabled={!renameValue.trim() || renameValue.trim() === tag}
                                className="p-1 rounded bg-accent-success/15 hover:bg-accent-success/30 text-accent-success transition-colors cursor-pointer disabled:opacity-40"
                              >
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                              </button>
                              <button
                                onClick={() => setEditingTag(null)}
                                className="p-1 rounded bg-surface-350 hover:bg-surface-450 text-surface-700 transition-colors cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            /* Standard Label */
                            <div className="truncate flex items-center gap-2 flex-1 pr-4">
                              <span className="font-semibold text-xs text-surface-850 truncate">#{tag}</span>
                              <span className="text-[10px] text-surface-500 font-mono">({count} use{count !== 1 ? 's' : ''})</span>
                            </div>
                          )}

                          {/* Action Buttons */}
                          {!isEditing && (
                            <div className="flex items-center gap-2 shrink-0">
                              {isConfirmingDelete ? (
                                <div className="flex items-center gap-1.5 bg-accent-danger/10 border border-accent-danger/25 p-1 rounded-lg">
                                  <span className="text-[9px] text-accent-danger font-bold px-1">Delete tag globally?</span>
                                  <button
                                    onClick={() => void handleDeleteTagGlobally(tag)}
                                    className="px-2 py-0.5 rounded bg-accent-danger text-white text-[9px] font-bold cursor-pointer hover:bg-accent-danger-dark"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteTag(null)}
                                    className="p-0.5 rounded bg-surface-300 text-surface-600 cursor-pointer"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <button
                                    onClick={() => {
                                      setEditingTag(tag);
                                      setRenameValue(tag);
                                      setConfirmDeleteTag(null);
                                    }}
                                    className="text-xs text-accent-primary hover:text-accent-primary-light transition-colors px-2 py-1 rounded-lg hover:bg-surface-300 cursor-pointer font-medium"
                                  >
                                    Rename
                                  </button>
                                  <button
                                    onClick={() => {
                                      setConfirmDeleteTag(tag);
                                      setEditingTag(null);
                                    }}
                                    className="text-xs text-accent-danger hover:bg-accent-danger/10 hover:text-accent-danger transition-colors px-2 py-1 rounded-lg cursor-pointer font-medium"
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
