import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, Pencil, Copy, Trash2, Pin } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useLinkMindStore } from '../store';
import type { Bookmark } from '../types';

interface ContextMenuProps {
  bookmark: Bookmark;
  position: { x: number; y: number };
  onClose: () => void;
}

interface MenuItem {
  label: string;
  icon: React.ReactNode;
  danger?: boolean;
  action: () => void;
}

export default function ContextMenu({
  bookmark,
  position,
  onClose,
}: ContextMenuProps) {
  const openEditModal = useLinkMindStore((s) => s.openEditModal);
  const deleteBookmark = useLinkMindStore((s) => s.deleteBookmark);
  const updateBookmark = useLinkMindStore((s) => s.updateBookmark);
  const menuRef = useRef<HTMLDivElement>(null);
  const [clamped, setClamped] = useState(position);
  
  // Clamp position to viewport once the menu is rendered
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    const rect = menu.getBoundingClientRect();
    const pad = 8;
    let { x, y } = position;

    if (x + rect.width > window.innerWidth - pad) {
      x = window.innerWidth - rect.width - pad;
    }
    if (y + rect.height > window.innerHeight - pad) {
      y = window.innerHeight - rect.height - pad;
    }
    if (x < pad) x = pad;
    if (y < pad) y = pad;

    setClamped({ x, y });
  }, [position]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const items: MenuItem[] = [
    {
      label: 'Open Link',
      icon: <ExternalLink size={14} />,
      action: () => {
        window.open(bookmark.url, '_blank');
        onClose();
      },
    },
    {
      label: bookmark.pinned ? 'Unpin' : 'Pin',
      icon: <Pin size={14} />,
      action: () => {
        void updateBookmark(bookmark.id, { pinned: !bookmark.pinned });
        onClose();
      },
    },
    {
      label: 'Edit',
      icon: <Pencil size={14} />,
      action: () => {
        openEditModal(bookmark);
        onClose();
      },
    },
    {
      label: 'Copy URL',
      icon: <Copy size={14} />,
      action: async () => {
        try {
          await navigator.clipboard.writeText(bookmark.url);
          toast.success('URL copied to clipboard');
        } catch {
          toast.error('Failed to copy URL');
        }
        onClose();
      },
    },
    {
      label: 'Delete',
      icon: <Trash2 size={14} />,
      danger: true,
      action: () => {
        void deleteBookmark(bookmark.id);
        onClose();
      },
    },
  ];

  return (
    <AnimatePresence>
      <motion.div
        ref={menuRef}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.12, ease: 'easeOut' }}
        className="fixed z-50 glass rounded-xl py-1 min-w-[180px] shadow-xl"
        style={{ top: clamped.y, left: clamped.x }}
      >
        {items.map((item) => (
          <button
            key={item.label}
            onClick={item.action}
            className={`
              w-full px-3 py-2 mx-1 flex items-center gap-2
              rounded-lg text-sm cursor-pointer transition-colors
              hover:bg-surface-300
              ${item.danger ? 'text-red-400 hover:text-red-300' : 'text-surface-900'}
            `}
            style={{ width: 'calc(100% - 8px)' }}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </motion.div>
    </AnimatePresence>
  );
}
