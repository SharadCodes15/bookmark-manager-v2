import { create } from 'zustand';
import { toast } from 'react-hot-toast';
import Fuse from 'fuse.js';
import { db } from '../db';
import type {
  Bookmark,
  Collection,
  Filters,
  LinkMindExport,
  SortOption,
  ViewMode,
  ChatSession,
  ChatMessage,
  AISettings,
} from '../types';

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface LinkMindState {
  bookmarks: Bookmark[];
  collections: Collection[];
  viewMode: ViewMode;
  sortOption: SortOption;
  filters: Filters;
  selectedBookmarkIds: Set<string>;
  theme: 'dark' | 'light';
  isAddModalOpen: boolean;
  editingBookmark: Bookmark | null;
  isLoading: boolean;

  // Actions
  loadData: () => Promise<void>;
  addBookmark: (bookmark: Omit<Bookmark, 'id' | 'createdAt' | 'faviconUrl'>) => Promise<void>;
  updateBookmark: (id: string, updates: Partial<Bookmark>) => Promise<void>;
  deleteBookmark: (id: string) => Promise<void>;
  bulkDeleteBookmarks: (ids: string[]) => Promise<void>;
  bulkUpdateBookmarks: (ids: string[], updates: Partial<Bookmark>) => Promise<void>;
  addCollection: (collection: Omit<Collection, 'id' | 'createdAt'>) => Promise<void>;
  updateCollection: (id: string, updates: Partial<Collection>) => Promise<void>;
  deleteCollection: (id: string) => Promise<void>;
  setViewMode: (mode: ViewMode) => void;
  setSortOption: (option: SortOption) => void;
  setFilters: (filters: Partial<Filters>) => void;
  resetFilters: () => void;
  toggleSelectedBookmark: (id: string) => void;
  selectAllVisible: (ids: string[]) => void;
  clearSelection: () => void;
  toggleTheme: () => void;
  openAddModal: () => void;
  openEditModal: (bookmark: Bookmark) => void;
  closeModal: () => void;
  importData: (data: LinkMindExport) => Promise<void>;
  exportData: () => LinkMindExport;
  getFilteredBookmarks: () => Bookmark[];
  getAllTags: () => string[];

  // Chat State
  aiSettings: AISettings;
  chatSessions: ChatSession[];
  currentSessionId: string | null;
  chatMessages: ChatMessage[];

  // Chat Actions
  saveAISettings: (settings: Partial<AISettings>) => void;
  loadChatSessions: () => Promise<void>;
  loadChatMessages: (sessionId: string) => Promise<void>;
  createChatSession: (title?: string) => Promise<string>;
  deleteChatSession: (sessionId: string) => Promise<void>;
  addChatMessage: (sessionId: string, role: 'user' | 'assistant' | 'system', content: string) => Promise<void>;
  updateLastMessage: (content: string) => void;
  commitLastMessageToDB: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultFilters: Filters = {
  search: '',
  categories: [],
  statuses: [],
  collectionIds: [],
  tags: [],
};

function getFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  } catch {
    return '';
  }
}

const defaultAISettings: AISettings = {
  provider: 'ollama',
  apiKey: '',
  endpoint: 'http://localhost:11434',
  model: 'llama3',
};

const getStoredAISettings = (): AISettings => {
  try {
    const val = localStorage.getItem('linkmind_ai_settings');
    if (val) {
      return { ...defaultAISettings, ...JSON.parse(val) };
    }
  } catch {}
  return defaultAISettings;
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useLinkMindStore = create<LinkMindState>((set, get) => ({
  // ---- initial state ----
  bookmarks: [],
  collections: [],
  viewMode: 'grid',
  sortOption: 'newest',
  filters: { ...defaultFilters },
  selectedBookmarkIds: new Set<string>(),
  theme: 'dark',
  isAddModalOpen: false,
  editingBookmark: null,
  isLoading: false,

  // ---- chat initial state ----
  aiSettings: getStoredAISettings(),
  chatSessions: [],
  currentSessionId: null,
  chatMessages: [],

  // ---- actions ----

  async loadData() {
    set({ isLoading: true });
    try {
      const [bookmarks, collections] = await Promise.all([
        db.bookmarks.toArray(),
        db.collections.toArray(),
      ]);
      set({ bookmarks, collections });
      // Pre-load chat sessions
      await get().loadChatSessions();
    } catch (err) {
      console.error('Failed to load data', err);
      toast.error('Failed to load data');
    } finally {
      set({ isLoading: false });
    }
  },

  async addBookmark(input) {
    const bookmark: Bookmark = {
      ...input,
      id: crypto.randomUUID(),
      faviconUrl: getFaviconUrl(input.url),
      createdAt: Date.now(),
    };
    try {
      await db.bookmarks.add(bookmark);
      set((s) => ({ bookmarks: [...s.bookmarks, bookmark] }));
      toast.success('Bookmark added');
    } catch (err) {
      console.error('Failed to add bookmark', err);
      toast.error('Failed to add bookmark');
    }
  },

  async updateBookmark(id, updates) {
    try {
      // If the URL changed, refresh the favicon
      if (updates.url) {
        updates.faviconUrl = getFaviconUrl(updates.url);
      }
      await db.bookmarks.update(id, updates);
      set((s) => ({
        bookmarks: s.bookmarks.map((b) => (b.id === id ? { ...b, ...updates } : b)),
      }));
      toast.success('Bookmark updated');
    } catch (err) {
      console.error('Failed to update bookmark', err);
      toast.error('Failed to update bookmark');
    }
  },

  async deleteBookmark(id) {
    const { bookmarks } = get();
    const bookmark = bookmarks.find((b) => b.id === id);
    if (!bookmark) return;

    try {
      await db.bookmarks.delete(id);
      set((s) => ({
        bookmarks: s.bookmarks.filter((b) => b.id !== id),
        selectedBookmarkIds: (() => {
          const next = new Set(s.selectedBookmarkIds);
          next.delete(id);
          return next;
        })(),
      }));

      const undo = async () => {
        await db.bookmarks.add(bookmark);
        set((s) => ({ bookmarks: [...s.bookmarks, bookmark] }));
        toast.success('Bookmark restored');
      };

      toast(
        `Deleted "${bookmark.title}". Click to undo.`,
        {
          duration: 5000,
          icon: '🗑️',
          style: { cursor: 'pointer' },
        },
      );

      // Expose undo via a 5-second window; UI components can call this
      const undoTimeout = setTimeout(() => { /* undo window closed */ }, 5000);

      // Store the undo function on the store-accessible closure for toast onClick handlers
      (globalThis as Record<string, unknown>).__linkMindLastUndo = () => {
        clearTimeout(undoTimeout);
        void undo();
      };
    } catch (err) {
      console.error('Failed to delete bookmark', err);
      toast.error('Failed to delete bookmark');
    }
  },

  async bulkDeleteBookmarks(ids) {
    const { bookmarks } = get();
    const deleted = bookmarks.filter((b) => ids.includes(b.id));
    if (deleted.length === 0) return;

    try {
      await db.bookmarks.bulkDelete(ids);
      const idSet = new Set(ids);
      set((s) => ({
        bookmarks: s.bookmarks.filter((b) => !idSet.has(b.id)),
        selectedBookmarkIds: new Set<string>(),
      }));

      const undo = async () => {
        await db.bookmarks.bulkAdd(deleted);
        set((s) => ({ bookmarks: [...s.bookmarks, ...deleted] }));
        toast.success(`Restored ${deleted.length} bookmark(s)`);
      };

      toast(
        `Deleted ${deleted.length} bookmark(s). Click to undo.`,
        {
          duration: 5000,
          icon: '🗑️',
          style: { cursor: 'pointer' },
        },
      );

      const undoTimeout = setTimeout(() => { /* undo window closed */ }, 5000);

      (globalThis as Record<string, unknown>).__linkMindLastUndo = () => {
        clearTimeout(undoTimeout);
        void undo();
      };
    } catch (err) {
      console.error('Failed to bulk delete bookmarks', err);
      toast.error('Failed to bulk delete bookmarks');
    }
  },

  async bulkUpdateBookmarks(ids, updates) {
    try {
      await Promise.all(ids.map((id) => db.bookmarks.update(id, updates)));
      const idSet = new Set(ids);
      set((s) => ({
        bookmarks: s.bookmarks.map((b) => (idSet.has(b.id) ? { ...b, ...updates } : b)),
      }));
      toast.success(`Updated ${ids.length} bookmark(s)`);
    } catch (err) {
      console.error('Failed to bulk update bookmarks', err);
      toast.error('Failed to bulk update bookmarks');
    }
  },

  async addCollection(input) {
    const collection: Collection = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    try {
      await db.collections.add(collection);
      set((s) => ({ collections: [...s.collections, collection] }));
      toast.success('Collection created');
    } catch (err) {
      console.error('Failed to add collection', err);
      toast.error('Failed to add collection');
    }
  },

  async updateCollection(id, updates) {
    try {
      await db.collections.update(id, updates);
      set((s) => ({
        collections: s.collections.map((c) => (c.id === id ? { ...c, ...updates } : c)),
      }));
      toast.success('Collection updated');
    } catch (err) {
      console.error('Failed to update collection', err);
      toast.error('Failed to update collection');
    }
  },

  async deleteCollection(id) {
    try {
      // Unset collectionId on bookmarks that belong to this collection
      const affectedBookmarks = await db.bookmarks
        .where('collectionId')
        .equals(id)
        .toArray();

      await Promise.all(
        affectedBookmarks.map((b) => db.bookmarks.update(b.id, { collectionId: undefined })),
      );
      await db.collections.delete(id);

      set((s) => ({
        collections: s.collections.filter((c) => c.id !== id),
        bookmarks: s.bookmarks.map((b) =>
          b.collectionId === id ? { ...b, collectionId: undefined } : b,
        ),
      }));
      toast.success('Collection deleted');
    } catch (err) {
      console.error('Failed to delete collection', err);
      toast.error('Failed to delete collection');
    }
  },

  setViewMode(mode) {
    set({ viewMode: mode });
  },

  setSortOption(option) {
    set({ sortOption: option });
  },

  setFilters(partial) {
    set((s) => ({ filters: { ...s.filters, ...partial } }));
  },

  resetFilters() {
    set({ filters: { ...defaultFilters } });
  },

  toggleSelectedBookmark(id) {
    set((s) => {
      const next = new Set(s.selectedBookmarkIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { selectedBookmarkIds: next };
    });
  },

  selectAllVisible(ids) {
    set({ selectedBookmarkIds: new Set(ids) });
  },

  clearSelection() {
    set({ selectedBookmarkIds: new Set<string>() });
  },

  toggleTheme() {
    set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' }));
  },

  openAddModal() {
    set({ isAddModalOpen: true, editingBookmark: null });
  },

  openEditModal(bookmark) {
    set({ isAddModalOpen: true, editingBookmark: bookmark });
  },

  closeModal() {
    set({ isAddModalOpen: false, editingBookmark: null });
  },

  async importData(data) {
    try {
      const { bookmarks: existing, collections: existingCols } = get();
      const existingBookmarkIds = new Set(existing.map((b) => b.id));
      const existingCollectionIds = new Set(existingCols.map((c) => c.id));

      const newBookmarks = data.bookmarks.filter((b) => !existingBookmarkIds.has(b.id));
      const newCollections = data.collections.filter((c) => !existingCollectionIds.has(c.id));

      if (newBookmarks.length > 0) {
        await db.bookmarks.bulkAdd(newBookmarks);
      }
      if (newCollections.length > 0) {
        await db.collections.bulkAdd(newCollections);
      }

      // Reload all data from DB to be consistent
      const [allBookmarks, allCollections] = await Promise.all([
        db.bookmarks.toArray(),
        db.collections.toArray(),
      ]);
      set({ bookmarks: allBookmarks, collections: allCollections });

      toast.success(
        `Imported ${newBookmarks.length} bookmark(s) and ${newCollections.length} collection(s)`,
      );
    } catch (err) {
      console.error('Failed to import data', err);
      toast.error('Failed to import data');
    }
  },

  exportData() {
    const { bookmarks, collections } = get();
    return {
      bookmarks,
      collections,
      exportDate: new Date().toISOString(),
    };
  },

  getFilteredBookmarks() {
    const { bookmarks, filters, sortOption, collections } = get();

    let filtered = [...bookmarks];

    // Search filter using Fuse.js
    if (filters.search) {
      const collectionsMap = new Map(collections.map((c) => [c.id, c.name]));
      const searchItems = filtered.map((b) => ({
        ...b,
        collectionName: b.collectionId ? (collectionsMap.get(b.collectionId) || '') : '',
      }));

      const fuse = new Fuse(searchItems, {
        keys: [
          { name: 'title', weight: 1.5 },
          { name: 'url', weight: 1.0 },
          { name: 'tags', weight: 1.2 },
          { name: 'category', weight: 0.8 },
          { name: 'collectionName', weight: 1.0 },
        ],
        threshold: 0.4,
        includeMatches: true,
      });

      const results = fuse.search(filters.search);
      filtered = results.map((res) => ({
        ...res.item,
        matches: res.matches as any,
      }));
    }

    // Category filter
    if (filters.categories.length > 0) {
      const cats = new Set(filters.categories);
      filtered = filtered.filter((b) => cats.has(b.category));
    }

    // Status filter
    if (filters.statuses.length > 0) {
      const stats = new Set(filters.statuses);
      filtered = filtered.filter((b) => stats.has(b.status));
    }

    // Collection filter
    if (filters.collectionIds.length > 0) {
      const colIds = new Set(filters.collectionIds);
      filtered = filtered.filter((b) => b.collectionId && colIds.has(b.collectionId));
    }

    // Tags filter (bookmark must have at least one of the selected tags)
    if (filters.tags.length > 0) {
      const tagSet = new Set(filters.tags);
      filtered = filtered.filter((b) => b.tags.some((t) => tagSet.has(t)));
    }

    // Sorting - only sort if not using search, or sort search results as well.
    // Usually we sort the search results as well, or keep Fuse.js relevance order.
    // Let's only sort if search query is empty, otherwise keep relevance order! This is standard and preferred for fuzzy search.
    if (!filters.search) {
      switch (sortOption) {
        case 'newest':
          filtered.sort((a, b) => b.createdAt - a.createdAt);
          break;
        case 'oldest':
          filtered.sort((a, b) => a.createdAt - b.createdAt);
          break;
        case 'title':
          filtered.sort((a, b) => a.title.localeCompare(b.title));
          break;
        case 'category':
          filtered.sort((a, b) => a.category.localeCompare(b.category));
          break;
        case 'status':
          filtered.sort((a, b) => a.status.localeCompare(b.status));
          break;
      }
    }

    return filtered;
  },

  getAllTags() {
    const { bookmarks } = get();
    const tagSet = new Set<string>();
    for (const b of bookmarks) {
      for (const t of b.tags) {
        tagSet.add(t);
      }
    }
    return Array.from(tagSet).sort();
  },

  async loadChatSessions() {
    try {
      const sessions = await db.chatSessions.orderBy('updatedAt').reverse().toArray();
      set({ chatSessions: sessions });
    } catch (err) {
      console.error('Failed to load chat sessions', err);
    }
  },

  async loadChatMessages(sessionId) {
    try {
      const messages = await db.chatMessages
        .where('sessionId')
        .equals(sessionId)
        .sortBy('createdAt');
      set({ chatMessages: messages, currentSessionId: sessionId });
    } catch (err) {
      console.error('Failed to load chat messages', err);
    }
  },

  async createChatSession(title) {
    const id = crypto.randomUUID();
    const session: ChatSession = {
      id,
      title: title || 'New Conversation',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    try {
      await db.chatSessions.add(session);
      set((s) => ({
        chatSessions: [session, ...s.chatSessions],
        currentSessionId: id,
        chatMessages: [],
      }));
      return id;
    } catch (err) {
      console.error('Failed to create chat session', err);
      return '';
    }
  },

  async deleteChatSession(sessionId) {
    try {
      await db.chatMessages.where('sessionId').equals(sessionId).delete();
      await db.chatSessions.delete(sessionId);
      set((s) => {
        const nextSessions = s.chatSessions.filter((cs) => cs.id !== sessionId);
        const nextSessionId = s.currentSessionId === sessionId
          ? (nextSessions[0]?.id || null)
          : s.currentSessionId;
        return {
          chatSessions: nextSessions,
          currentSessionId: nextSessionId,
        };
      });

      const currentId = get().currentSessionId;
      if (currentId) {
        void get().loadChatMessages(currentId);
      } else {
        set({ chatMessages: [] });
      }
      toast.success('Conversation deleted');
    } catch (err) {
      console.error('Failed to delete chat session', err);
      toast.error('Failed to delete conversation');
    }
  },

  async addChatMessage(sessionId, role, content) {
    const id = crypto.randomUUID();
    const msg: ChatMessage = {
      id,
      sessionId,
      role,
      content,
      createdAt: Date.now(),
    };
    try {
      await db.chatMessages.add(msg);
      await db.chatSessions.update(sessionId, { updatedAt: Date.now() });

      const currentSession = get().chatSessions.find((s) => s.id === sessionId);
      if (currentSession && currentSession.title === 'New Conversation' && role === 'user') {
        const shortenedTitle = content.length > 25 ? content.substring(0, 25) + '...' : content;
        await db.chatSessions.update(sessionId, { title: shortenedTitle });
      }

      const sessions = await db.chatSessions.orderBy('updatedAt').reverse().toArray();
      set((s) => ({
        chatSessions: sessions,
        chatMessages: s.currentSessionId === sessionId ? [...s.chatMessages, msg] : s.chatMessages,
      }));
    } catch (err) {
      console.error('Failed to add chat message', err);
    }
  },

  updateLastMessage(content) {
    set((s) => {
      const messages = [...s.chatMessages];
      if (messages.length > 0) {
        const last = messages[messages.length - 1];
        if (last.role === 'assistant') {
          messages[messages.length - 1] = { ...last, content };
        }
      }
      return { chatMessages: messages };
    });
  },

  async commitLastMessageToDB() {
    const { chatMessages, currentSessionId } = get();
    if (!currentSessionId || chatMessages.length === 0) return;
    const last = chatMessages[chatMessages.length - 1];
    try {
      const existing = await db.chatMessages.get(last.id);
      if (existing) {
        await db.chatMessages.update(last.id, { content: last.content });
      } else {
        await db.chatMessages.add(last);
      }
      await db.chatSessions.update(currentSessionId, { updatedAt: Date.now() });
      const sessions = await db.chatSessions.orderBy('updatedAt').reverse().toArray();
      set({ chatSessions: sessions });
    } catch (err) {
      console.error('Failed to commit last message to DB', err);
    }
  },

  saveAISettings(settings) {
    const next = { ...get().aiSettings, ...settings };
    set({ aiSettings: next });
    localStorage.setItem('linkmind_ai_settings', JSON.stringify(next));
    toast.success('AI Settings saved');
  },
}));
