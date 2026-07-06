import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  X,
  Trash2,
  Pencil,
  Palette,
  Search,
  FolderOpen,
  Check,
} from 'lucide-react';
import { usePinnedShortcutsStore } from '../store/pinnedShortcutsStore';
import { useLinkMindStore } from '../store';
import { toast } from 'react-hot-toast';
import { cn } from '../utils';
import type { PinnedFolder, PinnedShortcut, Bookmark } from '../types';
import Fuse from 'fuse.js';

// ---------------------------------------------------------------------------
// Predefined Premium Swatches
// ---------------------------------------------------------------------------
interface Swatch {
  id: string;
  name: string;
  darkHex: string;
  lightHex: string;
}

const COLOR_SWATCHES: Swatch[] = [
  { id: 'slate', name: 'Slate', darkHex: '#181822', lightHex: '#e4e4eb' },
  { id: 'indigo', name: 'Indigo', darkHex: '#1a1c3e', lightHex: '#e1e3fa' },
  { id: 'emerald', name: 'Emerald', darkHex: '#0a241b', lightHex: '#dff2e6' },
  { id: 'amber', name: 'Amber', darkHex: '#2d1c0b', lightHex: '#fef1d6' },
  { id: 'rose', name: 'Rose', darkHex: '#300d16', lightHex: '#fde7eb' },
  { id: 'sky', name: 'Sky', darkHex: '#081f33', lightHex: '#d8effe' },
  { id: 'violet', name: 'Violet', darkHex: '#211038', lightHex: '#eedefa' },
];

// ---------------------------------------------------------------------------
// Utility Helpers
// ---------------------------------------------------------------------------
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  hex = hex.replace(/^#/, '');
  let r = parseInt(hex.substring(0, 2), 16) / 255;
  let g = parseInt(hex.substring(2, 4), 16) / 255;
  let b = parseInt(hex.substring(4, 6), 16) / 255;

  let max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0,
    l = (max + min) / 2;

  if (max !== min) {
    let d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function getNeumorphicStyle(colorKey: string, isPressed: boolean, theme: 'dark' | 'light') {
  const swatch = COLOR_SWATCHES.find((s) => s.id === colorKey);
  const baseHex = swatch ? (theme === 'dark' ? swatch.darkHex : swatch.lightHex) : colorKey;

  const { h, s, l } = hexToHsl(baseHex);

  // Soft contrast shift
  const shiftLight = theme === 'dark' ? 5 : 7;
  const shiftDark = theme === 'dark' ? 6 : 9;

  const lightL = Math.min(l + shiftLight, 98);
  const darkL = Math.max(l - shiftDark, 2);

  const lightShadow = `hsl(${h}, ${s}%, ${lightL}%)`;
  const darkShadow = `hsl(${h}, ${s}%, ${darkL}%)`;

  if (isPressed) {
    return {
      backgroundColor: baseHex,
      boxShadow: `inset 3px 3px 6px ${darkShadow}, inset -3px -3px 6px ${lightShadow}`,
    };
  } else {
    return {
      backgroundColor: baseHex,
      boxShadow: `4px 4px 10px ${darkShadow}, -4px -4px 10px ${lightShadow}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Favicon Image Component with Error Fallback
// ---------------------------------------------------------------------------
function FaviconImage({ src, title, className }: { src: string; title: string; className?: string }) {
  const [error, setError] = useState(false);

  if (error || !src) {
    const firstLetter = title ? title.charAt(0).toUpperCase() : '?';
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-surface-300/40 text-surface-700 dark:text-surface-800 text-[10px] font-bold rounded',
          className
        )}
      >
        {firstLetter}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={title}
      onError={() => setError(true)}
      className={cn('object-contain', className)}
    />
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function PinnedShortcutsSection() {
  const theme = useLinkMindStore((s) => s.theme);
  const bookmarks = useLinkMindStore((s) => s.bookmarks);

  const {
    pinnedFolders,
    pinnedShortcuts,
    loadPinnedData,
    addFolder,
    updateFolder,
    deleteFolder,
    addShortcut,
    deleteShortcut,
  } = usePinnedShortcutsStore();

  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  // Modals & UI States
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('slate');

  // Context Menu
  const [contextMenu, setContextMenu] = useState<{
    folder: PinnedFolder;
    x: number;
    y: number;
  } | null>(null);

  // Manage Folder Properties Modals
  const [renameFolder, setRenameFolder] = useState<PinnedFolder | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [colorFolder, setColorFolder] = useState<PinnedFolder | null>(null);
  const [colorValue, setColorValue] = useState('slate');

  const [deleteConfirmFolder, setDeleteConfirmFolder] = useState<PinnedFolder | null>(null);

  // Load database tables
  useEffect(() => {
    loadPinnedData();
  }, [loadPinnedData]);

  // Touch Long Press references
  const longPressTimeoutRef = useRef<any | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);

  const openContextMenu = useCallback((folder: PinnedFolder, x: number, y: number) => {
    setContextMenu({ folder, x, y });
  }, []);

  const handleTouchStart = (e: React.TouchEvent, folder: PinnedFolder) => {
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };

    if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);

    longPressTimeoutRef.current = setTimeout(() => {
      openContextMenu(folder, touch.clientX, touch.clientY);
      // Vibrate if browser supports it
      if ('vibrate' in navigator) navigator.vibrate(50);
    }, 600);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPos.current) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartPos.current.x);
    const dy = Math.abs(touch.clientY - touchStartPos.current.y);

    // Cancel long press if user drags or scrolls
    if (dx > 10 || dy > 10) {
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = null;
      }
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  };

  // Close context menu on click outside
  useEffect(() => {
    const handleOutside = () => {
      setContextMenu(null);
    };
    window.addEventListener('click', handleOutside);
    return () => window.removeEventListener('click', handleOutside);
  }, []);

  // Filter shortcuts inside each folder and resolve bookmarks info
  const getResolvedShortcuts = useCallback(
    (folderId: string) => {
      const shortcuts = pinnedShortcuts.filter((s) => s.folderId === folderId);
      return shortcuts.map((s) => {
        if (s.bookmarkId) {
          const matchedBookmark = bookmarks.find((b) => b.id === s.bookmarkId);
          if (matchedBookmark) {
            return {
              ...s,
              title: matchedBookmark.title,
              url: matchedBookmark.url,
              faviconUrl:
                matchedBookmark.faviconUrl ||
                `https://www.google.com/s2/favicons?domain=${new URL(matchedBookmark.url).hostname}&sz=64`,
            };
          }
        }
        return s;
      });
    },
    [pinnedShortcuts, bookmarks]
  );

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) {
      toast.error('Please enter a folder name');
      return;
    }
    await addFolder(newFolderName.trim(), newFolderColor);
    setNewFolderName('');
    setNewFolderColor('slate');
    setIsNewFolderOpen(false);
  };

  const handleRenameFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameFolder) return;
    if (!renameValue.trim()) {
      toast.error('Folder name cannot be empty');
      return;
    }
    await updateFolder(renameFolder.id, { name: renameValue.trim() });
    setRenameFolder(null);
  };

  const handleSaveColor = async () => {
    if (!colorFolder) return;
    await updateFolder(colorFolder.id, { color: colorValue });
    setColorFolder(null);
  };

  const handleDeleteFolder = async () => {
    if (!deleteConfirmFolder) return;
    await deleteFolder(deleteConfirmFolder.id);
    setDeleteConfirmFolder(null);
  };

  const defaultTileColor = theme === 'dark' ? '#16161f' : '#dddde8';

  return (
    <section className="space-y-4">
      {/* Section Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="flex items-center gap-2"
      >
        <FolderOpen size={20} className="text-accent-secondary" />
        <h2 className="text-xl font-bold text-surface-950">Pinned Folders</h2>
      </motion.div>

      {/* Row container */}
      <div className="flex flex-wrap gap-6 items-center">
        {pinnedFolders.map((folder) => {
          const resolved = getResolvedShortcuts(folder.id);
          const first4 = resolved.slice(0, 4);

          return (
            <div key={folder.id} className="flex flex-col items-center select-none">
              <motion.div
                layoutId={`folder-tile-${folder.id}`}
                style={getNeumorphicStyle(folder.color, activeFolderId === folder.id, theme)}
                onClick={() => setActiveFolderId(folder.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openContextMenu(folder, e.clientX, e.clientY);
                }}
                onTouchStart={(e) => handleTouchStart(e, folder)}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                className={cn(
                  'w-32 h-32 rounded-3xl flex items-center justify-center relative cursor-pointer transition-all duration-200'
                )}
              >
                {/* 2x2 Mini-Preview Grid */}
                <div className="w-18 h-18 bg-black/10 dark:bg-black/35 rounded-2xl p-2.5 grid grid-cols-2 gap-2.5 items-center justify-center">
                  {Array.from({ length: 4 }).map((_, i) => {
                    const shortcut = first4[i];
                    if (shortcut) {
                      return (
                        <div key={shortcut.id} className="w-5 h-5 rounded flex items-center justify-center bg-white/5 dark:bg-white/10 overflow-hidden">
                          <FaviconImage src={shortcut.faviconUrl} title={shortcut.title} className="w-3.5 h-3.5" />
                        </div>
                      );
                    }
                    return <div key={i} className="w-5 h-5 rounded bg-white/5 dark:bg-white/5" />;
                  })}
                </div>

                {/* Count Badge for > 4 items */}
                {resolved.length > 4 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-accent-primary text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border border-surface-0 shadow-sm animate-pulse-glow">
                    {resolved.length}
                  </span>
                )}
              </motion.div>
              {/* Folder Name */}
              <span className="mt-2 text-xs font-bold text-surface-850 text-center truncate w-28">
                {folder.name}
              </span>
            </div>
          );
        })}

        {/* Add Folder Tile */}
        <div className="flex flex-col items-center">
          <motion.div
            style={getNeumorphicStyle(defaultTileColor, isNewFolderOpen, theme)}
            onClick={() => setIsNewFolderOpen(true)}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            className="w-32 h-32 rounded-3xl flex items-center justify-center cursor-pointer transition-all duration-200 text-surface-600 dark:text-surface-700 hover:text-accent-secondary"
          >
            <Plus size={28} />
          </motion.div>
          <span className="mt-2 text-xs font-semibold text-surface-500 text-center">
            New Folder
          </span>
        </div>
      </div>

      {/* Context Menu Overlay */}
      <AnimatePresence>
        {contextMenu && (
          <>
            {/* Backdrop to close menu */}
            <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.1, ease: 'easeOut' }}
              className="fixed z-50 glass rounded-xl py-1.5 min-w-[170px] shadow-xl border border-glass-border"
              style={{ top: contextMenu.y, left: contextMenu.x }}
            >
              <button
                onClick={() => {
                  setRenameFolder(contextMenu.folder);
                  setRenameValue(contextMenu.folder.name);
                  setContextMenu(null);
                }}
                className="w-[calc(100%-8px)] mx-1 px-3 py-2 flex items-center gap-2.5 rounded-lg text-sm text-surface-900 cursor-pointer hover:bg-surface-300/40 transition-colors text-left"
              >
                <Pencil size={14} className="text-surface-600" />
                Rename
              </button>
              <button
                onClick={() => {
                  setColorFolder(contextMenu.folder);
                  setColorValue(contextMenu.folder.color);
                  setContextMenu(null);
                }}
                className="w-[calc(100%-8px)] mx-1 px-3 py-2 flex items-center gap-2.5 rounded-lg text-sm text-surface-900 cursor-pointer hover:bg-surface-300/40 transition-colors text-left"
              >
                <Palette size={14} className="text-surface-600" />
                Change Color
              </button>
              <div className="h-[1px] bg-glass-border my-1 mx-1" />
              <button
                onClick={() => {
                  setDeleteConfirmFolder(contextMenu.folder);
                  setContextMenu(null);
                }}
                className="w-[calc(100%-8px)] mx-1 px-3 py-2 flex items-center gap-2.5 rounded-lg text-sm text-accent-danger cursor-pointer hover:bg-red-500/10 transition-colors text-left"
              >
                <Trash2 size={14} />
                Delete Folder
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ───────────────────────────────────────────────────────────
          MODALS & DIALOGS
         ─────────────────────────────────────────────────────────── */}

      {/* New Folder Modal */}
      <AnimatePresence>
        {isNewFolderOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsNewFolderOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="glass w-full max-w-sm rounded-3xl p-6 relative flex flex-col z-10 shadow-2xl border border-glass-border text-surface-950"
            >
              <button
                onClick={() => setIsNewFolderOpen(false)}
                className="absolute top-4 right-4 p-1.5 rounded-lg bg-surface-200/50 hover:bg-surface-300 text-surface-600 cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>

              <h3 className="text-lg font-bold mb-4 bg-gradient-to-r from-accent-primary to-accent-secondary bg-clip-text text-transparent">
                Create Folder
              </h3>

              <form onSubmit={handleCreateFolder} className="space-y-5">
                <div>
                  <label className="text-xs font-semibold text-surface-500 block mb-1.5 uppercase tracking-wide">
                    Folder Name
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="Work, Social, etc..."
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="w-full bg-surface-100/50 border border-glass-border rounded-xl px-4 py-2.5 text-sm text-surface-900 focus:outline-none focus:border-accent-primary transition-all"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-surface-500 block mb-2 uppercase tracking-wide">
                    Color Swatch
                  </label>
                  <div className="grid grid-cols-7 gap-2">
                    {COLOR_SWATCHES.map((swatch) => (
                      <button
                        key={swatch.id}
                        type="button"
                        onClick={() => setNewFolderColor(swatch.id)}
                        className={cn(
                          'w-8 h-8 rounded-full border-2 transition-all cursor-pointer flex items-center justify-center',
                          newFolderColor === swatch.id
                            ? 'border-accent-primary scale-110 shadow-md'
                            : 'border-transparent hover:scale-105'
                        )}
                        style={{
                          backgroundColor: theme === 'dark' ? swatch.darkHex : swatch.lightHex,
                        }}
                      >
                        {newFolderColor === swatch.id && (
                          <Check size={14} className="text-accent-primary" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setIsNewFolderOpen(false)}
                    className="px-4 py-2 text-sm font-semibold text-surface-600 rounded-xl bg-surface-200/50 hover:bg-surface-200 cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-sm font-bold text-white rounded-xl bg-accent-primary hover:bg-accent-primary-dark cursor-pointer shadow-md transition-colors"
                  >
                    Create
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Rename Folder Modal */}
      <AnimatePresence>
        {renameFolder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setRenameFolder(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="glass w-full max-w-sm rounded-3xl p-6 relative flex flex-col z-10 shadow-2xl border border-glass-border text-surface-950"
            >
              <button
                onClick={() => setRenameFolder(null)}
                className="absolute top-4 right-4 p-1.5 rounded-lg bg-surface-200/50 hover:bg-surface-300 text-surface-600 cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>

              <h3 className="text-lg font-bold mb-4">Rename Folder</h3>

              <form onSubmit={handleRenameFolder} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-surface-500 block mb-1.5 uppercase tracking-wide">
                    New Name
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="Enter folder name..."
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    className="w-full bg-surface-100/50 border border-glass-border rounded-xl px-4 py-2.5 text-sm text-surface-900 focus:outline-none focus:border-accent-primary transition-all"
                  />
                </div>

                <div className="flex gap-3 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setRenameFolder(null)}
                    className="px-4 py-2 text-sm font-semibold text-surface-600 rounded-xl bg-surface-200/50 hover:bg-surface-200 cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-sm font-bold text-white rounded-xl bg-accent-primary hover:bg-accent-primary-dark cursor-pointer shadow-md transition-colors"
                  >
                    Save
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Change Color Modal */}
      <AnimatePresence>
        {colorFolder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setColorFolder(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="glass w-full max-w-sm rounded-3xl p-6 relative flex flex-col z-10 shadow-2xl border border-glass-border text-surface-950"
            >
              <button
                onClick={() => setColorFolder(null)}
                className="absolute top-4 right-4 p-1.5 rounded-lg bg-surface-200/50 hover:bg-surface-300 text-surface-600 cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>

              <h3 className="text-lg font-bold mb-4">Change Folder Color</h3>

              <div className="space-y-5">
                <div>
                  <label className="text-xs font-semibold text-surface-500 block mb-2.5 uppercase tracking-wide">
                    Select Swatch
                  </label>
                  <div className="grid grid-cols-7 gap-2">
                    {COLOR_SWATCHES.map((swatch) => (
                      <button
                        key={swatch.id}
                        type="button"
                        onClick={() => setColorValue(swatch.id)}
                        className={cn(
                          'w-8 h-8 rounded-full border-2 transition-all cursor-pointer flex items-center justify-center',
                          colorValue === swatch.id
                            ? 'border-accent-primary scale-110 shadow-md'
                            : 'border-transparent hover:scale-105'
                        )}
                        style={{
                          backgroundColor: theme === 'dark' ? swatch.darkHex : swatch.lightHex,
                        }}
                      >
                        {colorValue === swatch.id && (
                          <Check size={14} className="text-accent-primary" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setColorFolder(null)}
                    className="px-4 py-2 text-sm font-semibold text-surface-600 rounded-xl bg-surface-200/50 hover:bg-surface-200 cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveColor}
                    className="px-5 py-2 text-sm font-bold text-white rounded-xl bg-accent-primary hover:bg-accent-primary-dark cursor-pointer shadow-md transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Folder Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmFolder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setDeleteConfirmFolder(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="glass w-full max-w-sm rounded-3xl p-6 relative flex flex-col z-10 shadow-2xl border border-glass-border text-surface-950"
            >
              <h3 className="text-lg font-bold mb-2 flex items-center gap-2 text-accent-danger">
                <Trash2 size={20} />
                Delete Folder?
              </h3>
              <p className="text-sm text-surface-600 leading-relaxed mb-5">
                Are you sure you want to delete the folder <span className="font-bold text-surface-900">"{deleteConfirmFolder.name}"</span>?
                <br />
                <span className="mt-2 block text-xs bg-red-500/10 text-red-400 p-2.5 rounded-xl border border-red-500/10">
                  ⚠️ Standalone quick links inside will be permanently deleted. Bookmark-referencing links will be unpinned (they will remain intact in your main bookmark library).
                </span>
              </p>

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmFolder(null)}
                  className="px-4 py-2 text-sm font-semibold text-surface-600 rounded-xl bg-surface-200/50 hover:bg-surface-200 cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteFolder}
                  className="px-5 py-2 text-sm font-bold text-white rounded-xl bg-accent-danger hover:bg-red-500/90 cursor-pointer shadow-md transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ───────────────────────────────────────────────────────────
          SHARED-LAYOUT MORPHING FOLDER EXPANSION MODAL
         ─────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {activeFolderId && (
          <FolderDetailModal
            folder={pinnedFolders.find((f) => f.id === activeFolderId)!}
            shortcuts={getResolvedShortcuts(activeFolderId)}
            onClose={() => setActiveFolderId(null)}
            onRemoveShortcut={deleteShortcut}
            onAddShortcut={addShortcut}
            theme={theme}
            defaultTileColor={defaultTileColor}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Expanded Folder Modal Component
// ---------------------------------------------------------------------------
interface FolderDetailModalProps {
  folder: PinnedFolder;
  shortcuts: PinnedShortcut[];
  onClose: () => void;
  onRemoveShortcut: (id: string) => Promise<void>;
  onAddShortcut: (folderId: string, input: any) => Promise<void>;
  theme: 'dark' | 'light';
  defaultTileColor: string;
}

function FolderDetailModal({
  folder,
  shortcuts,
  onClose,
  onRemoveShortcut,
  onAddShortcut,
  theme,
  defaultTileColor,
}: FolderDetailModalProps) {
  const [showAddPicker, setShowAddPicker] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 select-none">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-md cursor-zoom-out"
        onClick={onClose}
      />

      {/* Folder Expanded container */}
      <motion.div
        layoutId={`folder-tile-${folder.id}`}
        style={{
          // Use standard folder color but slightly adjusted with glass styling overlay
          backgroundColor: theme === 'dark' ? 'rgba(20, 20, 30, 0.85)' : 'rgba(240, 240, 248, 0.85)',
        }}
        className="glass w-full max-w-2xl h-[520px] rounded-[32px] p-6 relative flex flex-col z-10 shadow-2xl border border-glass-border overflow-hidden"
      >
        {/* Header */}
        <div className="flex justify-between items-center pb-3 border-b border-glass-border">
          <h3 className="text-2xl font-black text-surface-950 flex items-center gap-2">
            <span
              className="w-4.5 h-4.5 rounded-full shrink-0"
              style={{
                backgroundColor: COLOR_SWATCHES.find((s) => s.id === folder.color)
                  ? theme === 'dark'
                    ? COLOR_SWATCHES.find((s) => s.id === folder.color)?.darkHex
                    : COLOR_SWATCHES.find((s) => s.id === folder.color)?.lightHex
                  : folder.color,
              }}
            />
            {folder.name}
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-surface-200/50 hover:bg-surface-300 text-surface-700 cursor-pointer transition-colors shadow-sm"
          >
            <X size={18} />
          </button>
        </div>

        {/* Shortcuts Grid */}
        <div className="flex-1 overflow-y-auto mt-6 pr-1 scrollbar-thin">
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-6 pb-6">
            {shortcuts.map((shortcut) => (
              <motion.div
                key={shortcut.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.05 }}
                onClick={() => {
                  window.open(shortcut.url, '_blank', 'noopener,noreferrer');
                }}
                className="group flex flex-col items-center p-3 rounded-2xl bg-surface-100/10 hover:bg-surface-100/30 border border-glass-border cursor-pointer relative transition-all duration-200 select-none"
              >
                {/* Remove button (X) on hover */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void onRemoveShortcut(shortcut.id);
                  }}
                  className="absolute -top-1.5 -right-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-accent-danger hover:bg-red-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] cursor-pointer shadow-md z-20 border border-glass-border"
                >
                  <X size={10} />
                </button>

                {/* Favicon container */}
                <div className="w-12 h-12 rounded-xl bg-surface-200/50 dark:bg-black/20 flex items-center justify-center shadow-inner overflow-hidden border border-glass-border">
                  <FaviconImage src={shortcut.faviconUrl} title={shortcut.title} className="w-6 h-6" />
                </div>

                {/* Title */}
                <span className="mt-2 text-[11px] font-bold text-surface-850 text-center line-clamp-2 w-full px-1">
                  {shortcut.title}
                </span>
              </motion.div>
            ))}

            {/* Add Shortcut tile inside folder */}
            <div className="flex flex-col items-center">
              <motion.div
                style={getNeumorphicStyle(defaultTileColor, showAddPicker, theme)}
                onClick={() => setShowAddPicker(true)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-20 h-20 rounded-2xl flex items-center justify-center cursor-pointer transition-all duration-200 text-surface-600 dark:text-surface-700 hover:text-accent-secondary"
              >
                <Plus size={22} />
              </motion.div>
              <span className="mt-1.5 text-[11px] font-semibold text-surface-500 text-center">
                Add Link
              </span>
            </div>
          </div>
        </div>

        {/* Inner Picker Overlay */}
        <AnimatePresence>
          {showAddPicker && (
            <AddLinkPicker
              folderId={folder.id}
              existingShortcuts={shortcuts}
              onClose={() => setShowAddPicker(false)}
              onAddShortcut={onAddShortcut}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Link Picker Overlay inside Folder modal
// ---------------------------------------------------------------------------
interface AddLinkPickerProps {
  folderId: string;
  existingShortcuts: PinnedShortcut[];
  onClose: () => void;
  onAddShortcut: (folderId: string, input: any) => Promise<void>;
}

function AddLinkPicker({ folderId, existingShortcuts, onClose, onAddShortcut }: AddLinkPickerProps) {
  const bookmarks = useLinkMindStore((s) => s.bookmarks);
  const [tab, setTab] = useState<'library' | 'manual'>('library');

  // Library Tab Search state
  const [searchTerm, setSearchTerm] = useState('');

  // Manual Tab Form state
  const [manualUrl, setManualUrl] = useState('');
  const [manualTitle, setManualTitle] = useState('');

  // Fuzzy Search setup
  const fuse = useMemo(() => {
    return new Fuse(bookmarks, {
      keys: ['title', 'url', 'tags'],
      threshold: 0.45,
    });
  }, [bookmarks]);

  // Compute filtered bookmarks list
  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) {
      // Return first 15 bookmarks by default for rapid picking
      return bookmarks.slice(0, 15);
    }
    return fuse.search(searchTerm).map((r) => r.item);
  }, [searchTerm, bookmarks, fuse]);

  // Check if a bookmark is already in the folder
  const isAlreadyAdded = useCallback(
    (bookmarkId: string) => {
      return existingShortcuts.some((s) => s.bookmarkId === bookmarkId);
    },
    [existingShortcuts]
  );

  const handleAddLibraryShortcut = async (bookmark: Bookmark) => {
    if (isAlreadyAdded(bookmark.id)) {
      toast.error('This bookmark is already in the folder');
      return;
    }

    await onAddShortcut(folderId, {
      bookmarkId: bookmark.id,
      url: bookmark.url,
      title: bookmark.title,
      faviconUrl: bookmark.faviconUrl,
    });
    onClose();
  };

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualUrl.trim()) return;

    let url = manualUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    try {
      const hostname = new URL(url).hostname;
      const title = manualTitle.trim() || hostname;
      const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;

      // Check duplicate by url
      const isUrlAdded = existingShortcuts.some((s) => s.url === url);
      if (isUrlAdded) {
        toast.error('This URL is already in the folder');
        return;
      }

      await onAddShortcut(folderId, {
        url,
        title,
        faviconUrl,
      });

      setManualUrl('');
      setManualTitle('');
      onClose();
    } catch {
      toast.error('Please enter a valid URL');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-30 rounded-[32px]"
    >
      <div
        className="w-full max-w-md h-[400px] bg-surface-100 border border-glass-border rounded-2xl flex flex-col p-5 shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center">
          <span className="text-sm font-black text-surface-950 uppercase tracking-widest">Add Link</span>
          <button
            onClick={onClose}
            className="p-1 rounded-lg bg-surface-200/50 hover:bg-surface-300 text-surface-600 cursor-pointer transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex bg-surface-200/50 p-1 rounded-xl mt-3 text-xs font-semibold relative">
          <button
            onClick={() => setTab('library')}
            className={cn(
              'flex-1 py-1.5 rounded-lg text-center cursor-pointer transition-all',
              tab === 'library'
                ? 'bg-surface-0 text-accent-primary shadow-sm font-bold'
                : 'text-surface-600 hover:text-surface-850'
            )}
          >
            From Library
          </button>
          <button
            onClick={() => setTab('manual')}
            className={cn(
              'flex-1 py-1.5 rounded-lg text-center cursor-pointer transition-all',
              tab === 'manual'
                ? 'bg-surface-0 text-accent-primary shadow-sm font-bold'
                : 'text-surface-600 hover:text-surface-850'
            )}
          >
            Paste URL
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-hidden mt-4 flex flex-col">
          {tab === 'library' ? (
            <div className="flex-1 flex flex-col overflow-hidden space-y-3">
              {/* Search Bar */}
              <div className="flex items-center gap-2 bg-surface-0 border border-glass-border px-3 py-2 rounded-xl">
                <Search size={14} className="text-surface-500" />
                <input
                  type="text"
                  placeholder="Search library bookmarks..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1 bg-transparent text-xs text-surface-900 border-none outline-none focus:ring-0"
                />
              </div>

              {/* Scrollable Bookmarks list */}
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
                {searchResults.length > 0 ? (
                  searchResults.map((bm) => {
                    const added = isAlreadyAdded(bm.id);
                    return (
                      <div
                        key={bm.id}
                        onClick={() => !added && handleAddLibraryShortcut(bm)}
                        className={cn(
                          'flex items-center gap-3 p-2.5 rounded-xl border border-transparent transition-all select-none',
                          added
                            ? 'opacity-40 cursor-not-allowed bg-surface-200/20'
                            : 'cursor-pointer hover:bg-surface-200/50 hover:border-glass-border'
                        )}
                      >
                        <div className="w-8 h-8 rounded-lg bg-surface-200 flex items-center justify-center overflow-hidden shrink-0 border border-glass-border">
                          <FaviconImage src={bm.faviconUrl} title={bm.title} className="w-4.5 h-4.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-surface-850 truncate">{bm.title}</p>
                          <p className="text-[10px] text-surface-500 truncate mt-0.5">{bm.url}</p>
                        </div>
                        {added ? (
                          <span className="text-[10px] font-bold text-accent-primary uppercase tracking-wide bg-accent-primary/10 px-2 py-0.5 rounded-lg border border-accent-primary/20 shrink-0">
                            Added
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-surface-500 uppercase tracking-wide bg-surface-200 px-2 py-0.5 rounded-lg border border-glass-border shrink-0 hover:text-accent-primary transition-colors">
                            Pin
                          </span>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="text-center text-xs text-surface-500 py-6">No bookmarks found</p>
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={handleManualAdd} className="space-y-4 flex flex-col h-full justify-between">
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-surface-500 block mb-1 uppercase tracking-wide">
                    Website URL
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="example.com or https://..."
                    value={manualUrl}
                    onChange={(e) => setManualUrl(e.target.value)}
                    className="w-full bg-surface-0 border border-glass-border rounded-xl px-3 py-2 text-xs text-surface-900 focus:outline-none focus:border-accent-primary transition-all"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-surface-500 block mb-1 uppercase tracking-wide">
                    Shortcut Title (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Defaults to website domain"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    className="w-full bg-surface-0 border border-glass-border rounded-xl px-3 py-2 text-xs text-surface-900 focus:outline-none focus:border-accent-primary transition-all"
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3 justify-end border-t border-glass-border mt-auto">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-surface-600 rounded-xl bg-surface-200/50 hover:bg-surface-200 cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white rounded-xl bg-accent-primary hover:bg-accent-primary-dark cursor-pointer shadow-md transition-colors"
                >
                  Add Shortcut
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </motion.div>
  );
}
