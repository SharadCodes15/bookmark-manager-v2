import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useLinkMindStore } from '../store';

export default function FloatingAddButton() {
  const openAddModal = useLinkMindStore((s) => s.openAddModal);

  return (
    <motion.button
      onClick={openAddModal}
      className="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-primary to-accent-primary-dark text-white shadow-xl shadow-accent-primary/30 flex items-center justify-center group"
      whileHover={{ scale: 1.1, boxShadow: '0 8px 40px rgba(99, 102, 241, 0.4)' }}
      whileTap={{ scale: 0.95 }}
      title="Add new link (Ctrl+N)"
    >
      <Plus className="w-6 h-6 transition-transform group-hover:rotate-90 duration-300" />
    </motion.button>
  );
}
