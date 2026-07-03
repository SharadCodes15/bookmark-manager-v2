import { useRef } from 'react';
import { motion } from 'framer-motion';
import { Link, Plus, Upload, FilterX } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useLinkMindStore } from '../store';
import type { LinkMindExport } from '../types';

interface EmptyStateProps {
  hasFilters?: boolean;
}

export default function EmptyState({ hasFilters = false }: EmptyStateProps) {
  const openAddModal = useLinkMindStore((s) => s.openAddModal);
  const resetFilters = useLinkMindStore((s) => s.resetFilters);
  const importData = useLinkMindStore((s) => s.importData);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string) as LinkMindExport;
        if (!data.bookmarks || !data.collections) {
          toast.error('Invalid file format');
          return;
        }
        void importData(data);
      } catch {
        toast.error('Failed to parse import file');
      }
    };
    reader.readAsText(file);

    // Reset file input so re-selecting the same file works
    e.target.value = '';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="flex flex-col items-center justify-center text-center px-6 py-24"
    >
      {hasFilters ? (
        /* ── Filter-active empty state ──────────────────────────────── */
        <>
          <motion.div
            initial={{ rotate: -10 }}
            animate={{ rotate: 0 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          >
            <FilterX size={56} className="text-surface-500 mb-6" />
          </motion.div>

          <h2 className="text-xl font-semibold text-surface-800 mb-2">
            No bookmarks match your filters
          </h2>
          <p className="text-sm text-surface-600 mb-6 max-w-sm">
            Try adjusting or clearing your filters to see more results.
          </p>

          <button
            onClick={resetFilters}
            className="
              glass rounded-xl px-5 py-2.5 text-sm font-medium
              text-accent-primary hover:text-accent-primary-light
              hover:bg-surface-300 transition-colors
              flex items-center gap-2
            "
          >
            <FilterX size={16} />
            Clear All Filters
          </button>
        </>
      ) : (
        /* ── Fresh / welcome empty state ───────────────────────────── */
        <>
          {/* Floating animated link icon */}
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="mb-8"
          >
            <div className="w-20 h-20 rounded-2xl bg-accent-primary/10 flex items-center justify-center animate-pulse-glow">
              <Link size={36} className="text-accent-primary" />
            </div>
          </motion.div>

          <h2
            className="text-2xl sm:text-3xl font-bold mb-3"
            style={{
              background: 'linear-gradient(135deg, #818cf8 0%, #a78bfa 50%, #34d399 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Your bookmark collection is empty
          </h2>
          <p className="text-sm text-surface-600 mb-8 max-w-md">
            Start by adding your first link or importing your existing bookmarks.
            Organize them into collections, tag them, and find them fast.
          </p>

          <div className="flex items-center gap-3">
            <button
              onClick={openAddModal}
              className="
                rounded-xl px-5 py-2.5 text-sm font-medium
                bg-accent-primary hover:bg-accent-primary-dark
                text-white transition-colors
                flex items-center gap-2 shadow-lg shadow-accent-primary/20
              "
            >
              <Plus size={16} />
              Add First Link
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="
                glass rounded-xl px-5 py-2.5 text-sm font-medium
                text-surface-800 hover:text-surface-950
                hover:bg-surface-300 transition-colors
                flex items-center gap-2
              "
            >
              <Upload size={16} />
              Import Bookmarks
            </button>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
          </div>
        </>
      )}
    </motion.div>
  );
}
