import { create } from 'zustand';
import { db } from '../db';
import type { PinnedFolder, PinnedShortcut } from '../types';
import { toast } from 'react-hot-toast';

interface PinnedShortcutsState {
  pinnedFolders: PinnedFolder[];
  pinnedShortcuts: PinnedShortcut[];
  isLoading: boolean;

  // Actions
  loadPinnedData: () => Promise<void>;
  addFolder: (name: string, color: string) => Promise<void>;
  updateFolder: (id: string, updates: Partial<PinnedFolder>) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  addShortcut: (
    folderId: string,
    shortcut: Omit<PinnedShortcut, 'id' | 'folderId' | 'order' | 'createdAt'>
  ) => Promise<void>;
  deleteShortcut: (id: string) => Promise<void>;
}

export const usePinnedShortcutsStore = create<PinnedShortcutsState>((set, get) => ({
  pinnedFolders: [],
  pinnedShortcuts: [],
  isLoading: false,

  async loadPinnedData() {
    set({ isLoading: true });
    try {
      const [folders, shortcuts] = await Promise.all([
        db.pinnedFolders.toArray(),
        db.pinnedShortcuts.toArray(),
      ]);

      // Sort by order ascending
      folders.sort((a, b) => a.order - b.order);
      shortcuts.sort((a, b) => a.order - b.order);

      set({ pinnedFolders: folders, pinnedShortcuts: shortcuts });
    } catch (err) {
      console.error('Failed to load pinned shortcuts data', err);
      toast.error('Failed to load pinned shortcuts');
    } finally {
      set({ isLoading: false });
    }
  },

  async addFolder(name, color) {
    const { pinnedFolders } = get();
    const newFolder: PinnedFolder = {
      id: crypto.randomUUID(),
      name,
      color,
      order: pinnedFolders.length,
      createdAt: Date.now(),
    };

    try {
      await db.pinnedFolders.add(newFolder);
      set({ pinnedFolders: [...pinnedFolders, newFolder] });
      toast.success('Folder created');
    } catch (err) {
      console.error('Failed to add folder', err);
      toast.error('Failed to create folder');
    }
  },

  async updateFolder(id, updates) {
    try {
      await db.pinnedFolders.update(id, updates);
      set((s) => ({
        pinnedFolders: s.pinnedFolders.map((f) => (f.id === id ? { ...f, ...updates } : f)),
      }));
      toast.success('Folder updated');
    } catch (err) {
      console.error('Failed to update folder', err);
      toast.error('Failed to update folder');
    }
  },

  async deleteFolder(id) {
    try {
      // Delete all shortcuts inside this folder
      const shortcutsToDelete = await db.pinnedShortcuts.where('folderId').equals(id).toArray();
      const shortcutIds = shortcutsToDelete.map((s) => s.id);

      await Promise.all([
        db.pinnedFolders.delete(id),
        db.pinnedShortcuts.bulkDelete(shortcutIds),
      ]);

      set((s) => ({
        pinnedFolders: s.pinnedFolders.filter((f) => f.id !== id),
        pinnedShortcuts: s.pinnedShortcuts.filter((s) => s.folderId !== id),
      }));
      toast.success('Folder deleted');
    } catch (err) {
      console.error('Failed to delete folder', err);
      toast.error('Failed to delete folder');
    }
  },

  async addShortcut(folderId, shortcutInput) {
    const { pinnedShortcuts } = get();
    
    // Count existing shortcuts in this folder to set the order
    const folderShortcuts = pinnedShortcuts.filter((s) => s.folderId === folderId);
    
    const newShortcut: PinnedShortcut = {
      ...shortcutInput,
      id: crypto.randomUUID(),
      folderId,
      order: folderShortcuts.length,
      createdAt: Date.now(),
    };

    try {
      await db.pinnedShortcuts.add(newShortcut);
      set({ pinnedShortcuts: [...pinnedShortcuts, newShortcut] });
      toast.success('Shortcut added');
    } catch (err) {
      console.error('Failed to add shortcut', err);
      toast.error('Failed to add shortcut');
    }
  },

  async deleteShortcut(id) {
    const { pinnedShortcuts } = get();
    try {
      await db.pinnedShortcuts.delete(id);
      set({ pinnedShortcuts: pinnedShortcuts.filter((s) => s.id !== id) });
      toast.success('Shortcut removed');
    } catch (err) {
      console.error('Failed to delete shortcut', err);
      toast.error('Failed to remove shortcut');
    }
  },
}));
