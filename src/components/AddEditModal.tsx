import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  Link2,
  Type,
  Tag,
  FolderOpen,
  Plus,
  Check,
  Trash2,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import { useLinkMindStore } from '../store';
import { getDomain, getFaviconUrl, cn } from '../utils';
import type { Category, Status } from '../types';

// ────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────

const CATEGORIES: Category[] = ['Project', 'Area', 'Resource'];
const STATUSES: Status[] = ['Active', 'Idle', 'To Read'];

const CATEGORY_STYLES: Record<Category, { selected: string; ring: string }> = {
  Project: {
    selected: 'bg-category-project/25 text-category-project border-category-project/40',
    ring: 'ring-category-project/30',
  },
  Area: {
    selected: 'bg-category-area/25 text-category-area border-category-area/40',
    ring: 'ring-category-area/30',
  },
  Resource: {
    selected: 'bg-category-resource/25 text-category-resource border-category-resource/40',
    ring: 'ring-category-resource/30',
  },
};

const STATUS_STYLES: Record<Status, { selected: string; ring: string }> = {
  Active: {
    selected: 'bg-status-active/25 text-status-active border-status-active/40',
    ring: 'ring-status-active/30',
  },
  Idle: {
    selected: 'bg-status-idle/25 text-status-idle border-status-idle/40',
    ring: 'ring-status-idle/30',
  },
  'To Read': {
    selected: 'bg-status-toread/25 text-status-toread border-status-toread/40',
    ring: 'ring-status-toread/30',
  },
};

const PRESET_COLORS = [
  '#6366f1',
  '#f59e0b',
  '#10b981',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#f97316',
];

/** Naïve domain → display-name mapping for auto-suggest. */
function domainToTitle(domain: string): string {
  const parts = domain.replace(/^www\./, '').split('.');
  const name = parts[0] ?? domain;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

// ────────────────────────────────────────────────────────────────────
// Overlay + Panel motion variants
// ────────────────────────────────────────────────────────────────────

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
} as const;

const panelVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 12 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 400, damping: 30 },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 12,
    transition: { duration: 0.15 },
  },
} as const;

// ────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────

export default function AddEditModal() {
  const {
    isAddModalOpen,
    editingBookmark,
    closeModal,
    addBookmark,
    updateBookmark,
    deleteBookmark,
    collections,
    addCollection,
    getAllTags,
  } = useLinkMindStore();

  // ── Form state ──────────────────────────────────────────────────
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<Category>('Project');
  const [status, setStatus] = useState<Status>('To Read');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [collectionId, setCollectionId] = useState<string | undefined>(undefined);

  // ── UI state ────────────────────────────────────────────────────
  const [showCollectionDropdown, setShowCollectionDropdown] = useState(false);
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionColor, setNewCollectionColor] = useState(PRESET_COLORS[0]);
  const [tagAutocompleteIdx, setTagAutocompleteIdx] = useState(-1);
  const [isSaving, setIsSaving] = useState(false);

  const tagInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const urlTitleSynced = useRef(true); // tracks if user has manually edited title

  const isEditing = editingBookmark !== null;

  // ── Derived ─────────────────────────────────────────────────────
  const allTags = useMemo(() => getAllTags(), [getAllTags]);
  const filteredAutocomplete = useMemo(() => {
    if (!tagInput.trim()) return [];
    const q = tagInput.trim().toLowerCase();
    return allTags
      .filter((t) => t.toLowerCase().includes(q) && !tags.includes(t))
      .slice(0, 8);
  }, [tagInput, allTags, tags]);

  const urlValid = isValidUrl(url);
  const faviconSrc = urlValid ? getFaviconUrl(url) : null;

  // ── Sync form when modal opens ──────────────────────────────────
  useEffect(() => {
    if (!isAddModalOpen) return;
    if (editingBookmark) {
      setUrl(editingBookmark.url);
      setTitle(editingBookmark.title);
      setCategory(editingBookmark.category);
      setStatus(editingBookmark.status);
      setTags([...editingBookmark.tags]);
      setCollectionId(editingBookmark.collectionId);
      urlTitleSynced.current = false;
    } else {
      const searchParams = new URLSearchParams(window.location.search);
      const qaUrl = searchParams.get('url');
      const qaTitle = searchParams.get('title');
      if (searchParams.get('quickadd') === '1' && qaUrl) {
        setUrl(qaUrl);
        setTitle(qaTitle || '');
        urlTitleSynced.current = false;
      } else {
        setUrl('');
        setTitle('');
        urlTitleSynced.current = true;
      }
      setCategory('Project');
      setStatus('To Read');
      setTags([]);
      setCollectionId(undefined);
    }
    setTagInput('');
    setShowCollectionDropdown(false);
    setShowNewCollection(false);
    setNewCollectionName('');
    setNewCollectionColor(PRESET_COLORS[0]);
    setIsSaving(false);
  }, [isAddModalOpen, editingBookmark]);

  // ── Clear quick-add parameters from URL on unmount ───────────────
  useEffect(() => {
    return () => {
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.get('quickadd') === '1') {
        searchParams.delete('quickadd');
        searchParams.delete('url');
        searchParams.delete('title');
        const newSearch = searchParams.toString();
        const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
        window.history.replaceState({}, '', newUrl);
      }
    };
  }, []);

  // ── Auto-suggest title from URL ─────────────────────────────────
  useEffect(() => {
    if (!urlTitleSynced.current) return;
    if (isValidUrl(url)) {
      const domain = getDomain(url);
      setTitle(domainToTitle(domain));
    } else {
      setTitle('');
    }
  }, [url]);

  // ── Close dropdown on outside click ─────────────────────────────
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowCollectionDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ── Keyboard: Escape to close ───────────────────────────────────
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeModal();
    }
    if (isAddModalOpen) {
      document.addEventListener('keydown', handleKey);
      return () => document.removeEventListener('keydown', handleKey);
    }
  }, [isAddModalOpen, closeModal]);

  // ── Tag helpers ─────────────────────────────────────────────────
  const addTag = useCallback(
    (tag: string) => {
      const trimmed = tag.trim().toLowerCase();
      if (trimmed && !tags.includes(trimmed)) {
        setTags((prev) => [...prev, trimmed]);
      }
      setTagInput('');
      setTagAutocompleteIdx(-1);
    },
    [tags],
  );

  const removeTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const handleTagKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        if (tagAutocompleteIdx >= 0 && filteredAutocomplete[tagAutocompleteIdx]) {
          addTag(filteredAutocomplete[tagAutocompleteIdx]);
        } else if (tagInput.trim()) {
          addTag(tagInput);
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setTagAutocompleteIdx((i) => Math.min(i + 1, filteredAutocomplete.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setTagAutocompleteIdx((i) => Math.max(i - 1, -1));
      } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
        removeTag(tags[tags.length - 1]);
      }
    },
    [tagInput, tagAutocompleteIdx, filteredAutocomplete, tags, addTag, removeTag],
  );

  // ── Save ────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!url.trim() || !title.trim()) return;
    setIsSaving(true);
    try {
      const payload = {
        url: url.trim(),
        title: title.trim(),
        category,
        status,
        tags,
        collectionId,
      };
      if (isEditing) {
        await updateBookmark(editingBookmark.id, payload);
      } else {
        await addBookmark(payload);
      }
      closeModal();
    } finally {
      setIsSaving(false);
    }
  }, [
    url,
    title,
    category,
    status,
    tags,
    collectionId,
    isEditing,
    editingBookmark,
    addBookmark,
    updateBookmark,
    closeModal,
  ]);

  // ── Delete ──────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!isEditing) return;
    await deleteBookmark(editingBookmark.id);
    closeModal();
  }, [isEditing, editingBookmark, deleteBookmark, closeModal]);

  // ── Create collection inline ────────────────────────────────────
  const handleCreateCollection = useCallback(async () => {
    if (!newCollectionName.trim()) return;
    await addCollection({ name: newCollectionName.trim(), color: newCollectionColor });
    // The store appends the new collection – grab the latest one
    const latest = useLinkMindStore.getState().collections;
    const created = latest[latest.length - 1];
    if (created) setCollectionId(created.id);
    setNewCollectionName('');
    setShowNewCollection(false);
    setShowCollectionDropdown(false);
  }, [newCollectionName, newCollectionColor, addCollection]);

  // ── Render ──────────────────────────────────────────────────────
  const selectedCollection = collections.find((c) => c.id === collectionId);

  return (
    <AnimatePresence>
      {isAddModalOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeModal}
            aria-hidden
          />

          {/* Panel */}
          <motion.div
            className="glass relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Header ─────────────────────────────────────── */}
            <div className="flex items-center justify-between border-b border-glass-border px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-primary/15">
                  <Sparkles className="h-4 w-4 text-accent-primary" />
                </div>
                <h2 className="text-lg font-semibold text-surface-950">
                  {isEditing ? 'Edit Link' : 'Add New Link'}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-1.5 text-surface-600 transition-colors hover:bg-surface-300 hover:text-surface-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* ── Body (scrollable) ──────────────────────────── */}
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              {/* URL */}
              <label className="block space-y-1.5">
                <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-surface-600">
                  <Link2 className="h-3.5 w-3.5" /> URL
                </span>
                <div className="relative">
                  {faviconSrc && (
                    <img
                      src={faviconSrc}
                      alt=""
                      className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 rounded-sm"
                    />
                  )}
                  <input
                    type="url"
                    required
                    placeholder="https://example.com"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className={cn(
                      'w-full rounded-xl glass-neumorphic-pressed py-3 pr-4 text-sm text-surface-900 placeholder-surface-500 transition-all border-none',
                      'focus:outline-none focus:ring-2 focus:ring-accent-primary/30',
                      faviconSrc ? 'pl-10' : 'pl-4',
                    )}
                  />
                </div>
              </label>

              {/* Title */}
              <label className="block space-y-1.5">
                <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-surface-600">
                  <Type className="h-3.5 w-3.5" /> Title
                </span>
                <input
                  type="text"
                  required
                  placeholder="Enter a title"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    urlTitleSynced.current = false;
                  }}
                  className="w-full rounded-xl glass-neumorphic-pressed px-4 py-3 text-sm text-surface-900 placeholder-surface-500 transition-all focus:outline-none focus:ring-2 focus:ring-accent-primary/30 border-none"
                />
              </label>

              {/* Category segmented control */}
              <fieldset className="space-y-1.5">
                <legend className="text-xs font-medium uppercase tracking-wider text-surface-600">
                  Category
                </legend>
                <div className="flex gap-2">
                  {CATEGORIES.map((cat) => {
                    const active = category === cat;
                    const styles = CATEGORY_STYLES[cat];
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCategory(cat)}
                        className={cn(
                          'flex-1 rounded-xl px-4 py-2 text-sm font-medium transition-all border-none hover:scale-[1.02] active:scale-[0.98]',
                          active
                            ? `${styles.selected} glass-neumorphic-pressed font-bold`
                            : 'glass-neumorphic-raised text-surface-700',
                        )}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {/* Status segmented control */}
              <fieldset className="space-y-1.5">
                <legend className="text-xs font-medium uppercase tracking-wider text-surface-600">
                  Status
                </legend>
                <div className="flex gap-2">
                  {STATUSES.map((st) => {
                    const active = status === st;
                    const styles = STATUS_STYLES[st];
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setStatus(st)}
                        className={cn(
                          'flex-1 rounded-xl px-4 py-2 text-sm font-medium transition-all border-none hover:scale-[1.02] active:scale-[0.98]',
                          active
                            ? `${styles.selected} glass-neumorphic-pressed font-bold`
                            : 'glass-neumorphic-raised text-surface-700',
                        )}
                      >
                        {st}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {/* Tags */}
              <div className="space-y-1.5">
                <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-surface-600">
                  <Tag className="h-3.5 w-3.5" /> Tags
                </span>
                <div className="relative">
                  <div className="flex flex-wrap items-center gap-2 rounded-xl glass-neumorphic-pressed px-3 py-2.5 transition-all focus-within:ring-2 focus-within:ring-accent-primary/30 border-none">
                    {tags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 rounded-full bg-surface-300 px-3 py-1 text-xs font-medium text-surface-800"
                      >
                        {t}
                        <button
                          type="button"
                          onClick={() => removeTag(t)}
                          className="ml-0.5 rounded-full p-0.5 text-surface-600 transition-colors hover:bg-surface-400 hover:text-surface-900"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    <input
                      ref={tagInputRef}
                      type="text"
                      placeholder={tags.length === 0 ? 'Add tags…' : ''}
                      value={tagInput}
                      onChange={(e) => {
                        setTagInput(e.target.value);
                        setTagAutocompleteIdx(-1);
                      }}
                      onKeyDown={handleTagKeyDown}
                      className="min-w-[80px] flex-1 bg-transparent text-sm text-surface-900 placeholder-surface-500 outline-none"
                    />
                  </div>

                  {/* Autocomplete dropdown */}
                  <AnimatePresence>
                    {filteredAutocomplete.length > 0 && (
                      <motion.ul
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.12 }}
                        className="glass absolute left-0 right-0 top-full z-20 mt-1 max-h-40 overflow-y-auto rounded-xl py-1"
                      >
                        {filteredAutocomplete.map((tag, i) => (
                          <li key={tag}>
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                addTag(tag);
                              }}
                              className={cn(
                                'w-full px-3 py-1.5 text-left text-sm text-surface-800 transition-colors hover:bg-surface-300',
                                i === tagAutocompleteIdx && 'bg-surface-300',
                              )}
                            >
                              {tag}
                            </button>
                          </li>
                        ))}
                      </motion.ul>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Collection */}
              <div className="space-y-1.5" ref={dropdownRef}>
                <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-surface-600">
                  <FolderOpen className="h-3.5 w-3.5" /> Collection
                </span>

                {/* Trigger */}
                <button
                  type="button"
                  onClick={() => setShowCollectionDropdown((v) => !v)}
                  className="flex w-full items-center justify-between rounded-xl glass-neumorphic-pressed px-4 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-accent-primary/30 border-none"
                >
                  <span className="flex items-center gap-2">
                    {selectedCollection ? (
                      <>
                        <span
                          className="inline-block h-3 w-3 rounded-full"
                          style={{ backgroundColor: selectedCollection.color }}
                        />
                        <span className="text-surface-900">{selectedCollection.name}</span>
                      </>
                    ) : (
                      <span className="text-surface-500">No collection</span>
                    )}
                  </span>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 text-surface-500 transition-transform',
                      showCollectionDropdown && 'rotate-180',
                    )}
                  />
                </button>

                {/* Dropdown */}
                <AnimatePresence>
                  {showCollectionDropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.12 }}
                      className="glass absolute left-6 right-6 z-30 mt-1 max-h-52 overflow-y-auto rounded-xl py-1"
                    >
                      {/* None option */}
                      <button
                        type="button"
                        onClick={() => {
                          setCollectionId(undefined);
                          setShowCollectionDropdown(false);
                        }}
                        className={cn(
                          'flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-surface-300',
                          !collectionId ? 'text-accent-primary' : 'text-surface-700',
                        )}
                      >
                        {!collectionId && <Check className="h-3.5 w-3.5" />}
                        <span className={!collectionId ? '' : 'ml-5.5'}>None</span>
                      </button>

                      {collections.map((col) => (
                        <button
                          key={col.id}
                          type="button"
                          onClick={() => {
                            setCollectionId(col.id);
                            setShowCollectionDropdown(false);
                          }}
                          className={cn(
                            'flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-surface-300',
                            collectionId === col.id ? 'text-accent-primary' : 'text-surface-800',
                          )}
                        >
                          {collectionId === col.id && <Check className="h-3.5 w-3.5" />}
                          <span
                            className={cn(
                              'inline-block h-3 w-3 rounded-full',
                              collectionId !== col.id && 'ml-5.5',
                            )}
                            style={{ backgroundColor: col.color }}
                          />
                          {col.name}
                        </button>
                      ))}

                      {/* Divider */}
                      <div className="my-1 border-t border-glass-border" />

                      {!showNewCollection ? (
                        <button
                          type="button"
                          onClick={() => setShowNewCollection(true)}
                          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-accent-primary transition-colors hover:bg-surface-300"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          New Collection
                        </button>
                      ) : (
                        <div className="space-y-2.5 px-4 py-2">
                          <input
                            autoFocus
                            type="text"
                            placeholder="Collection name"
                            value={newCollectionName}
                            onChange={(e) => setNewCollectionName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void handleCreateCollection();
                              }
                            }}
                            className="w-full rounded-lg glass-neumorphic-pressed px-3 py-1.5 text-sm text-surface-900 placeholder-surface-500 outline-none border-none focus:ring-1 focus:ring-accent-primary/20"
                          />
                          <div className="flex items-center gap-1.5">
                            {PRESET_COLORS.map((color) => (
                              <button
                                key={color}
                                type="button"
                                onClick={() => setNewCollectionColor(color)}
                                className={cn(
                                  'h-6 w-6 rounded-full border-2 transition-transform hover:scale-110',
                                  newCollectionColor === color
                                    ? 'border-white scale-110'
                                    : 'border-transparent',
                                )}
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setShowNewCollection(false);
                                setNewCollectionName('');
                              }}
                              className="rounded-lg px-3 py-1 text-xs text-surface-600 transition-colors hover:text-surface-800"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleCreateCollection()}
                              disabled={!newCollectionName.trim()}
                              className="rounded-lg bg-accent-primary/20 px-3 py-1 text-xs font-medium text-accent-primary transition-colors hover:bg-accent-primary/30 disabled:opacity-40"
                            >
                              Create
                            </button>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* ── Footer ─────────────────────────────────────── */}
            <div className="flex items-center justify-between border-t border-glass-border px-6 py-4">
              {/* Left: Delete (edit mode only) */}
              <div>
                {isEditing && (
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-accent-danger transition-all glass-neumorphic-raised hover:scale-[1.04] active:scale-[0.96]"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                )}
              </div>

              {/* Right: Cancel + Save */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-surface-600 transition-all glass-neumorphic-raised hover:scale-[1.04] active:scale-[0.96]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!url.trim() || !title.trim() || isSaving}
                  onClick={() => void handleSave()}
                  className="relative overflow-hidden rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary px-6 py-2 text-sm font-semibold text-white transition-all glass-neumorphic-raised hover:scale-[1.04] active:scale-[0.96] disabled:opacity-40"
                >
                  <span className="relative z-10">
                    {isSaving ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Link'}
                  </span>
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
