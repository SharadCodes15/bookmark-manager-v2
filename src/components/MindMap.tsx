import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Maximize,
  ExternalLink,
  Pencil,
  Copy,
  Check,
  Trash2,
  SlidersHorizontal,
  Info,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useLinkMindStore } from '../store';
import type { Bookmark } from '../types';

// ---------------------------------------------------------------------------
// Image Caching Helper for Favicons
// ---------------------------------------------------------------------------
const imageCache = new Map<string, HTMLImageElement>();

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function MindMap() {
  const {
    bookmarks,
    collections,
    filters,
    getFilteredBookmarks,
    deleteBookmark,
    openEditModal,
    theme,
  } = useLinkMindStore();

  const graphRef = useRef<any>(null);
  const [, setRepaintCount] = useState(0);
  const lastClickTimeRef = useRef<number>(0);
  const lastClickedNodeRef = useRef<any>(null);

  // States for toggling features
  const [colorMode, setColorMode] = useState<'category' | 'collection'>('category');
  const [showCollectionLinks, setShowCollectionLinks] = useState(false);
  const [showControls, setShowControls] = useState(false);

  // Interactive selection states
  const [hoverNode, setHoverNode] = useState<any | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [popoverBookmark, setPopoverBookmark] = useState<Bookmark | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ x: number; y: number } | null>(null);
  const [copied, setCopied] = useState(false);

  // Trigger repainting canvas when favicons load
  const triggerRepaint = useCallback(() => {
    setRepaintCount((c) => c + 1);
  }, []);

  const getCachedImage = useCallback((url: string) => {
    if (!url) return null;
    if (!imageCache.has(url)) {
      const img = new Image();
      img.src = url;
      img.onload = () => triggerRepaint();
      img.onerror = () => {
        // Fallback placeholder image or nothing
      };
      imageCache.set(url, img);
    }
    return imageCache.get(url);
  }, [triggerRepaint]);

  // Handle click outside to close popover
  useEffect(() => {
    const handleClose = () => {
      setPopoverBookmark(null);
      setPopoverPosition(null);
    };
    window.addEventListener('click', handleClose);
    return () => window.removeEventListener('click', handleClose);
  }, []);

  // ---------------------------------------------------------------------------
  // Graph Data Formulation
  // ---------------------------------------------------------------------------
  const graphData = useMemo(() => {
    // 1. Gather all unique tags
    const tagCountMap = new Map<string, number>();
    bookmarks.forEach((b) => {
      b.tags.forEach((tag) => {
        tagCountMap.set(tag, (tagCountMap.get(tag) || 0) + 1);
      });
    });

    // 2. Build tag nodes
    const tagNodes = Array.from(tagCountMap.entries()).map(([tag, count]) => ({
      id: `tag-${tag}`,
      type: 'tag',
      name: `#${tag}`,
      count,
      val: 5 + count * 1.8, // size based on bookmarks using it
      color: '#fbbf24', // Amber/gold tag node
    }));

    // 3. Build bookmark nodes
    const bookmarkNodes = bookmarks.map((b) => {
      // Calculate degree: count connected tags + 1 if has collection links enabled
      let degree = b.tags.length;
      if (showCollectionLinks && b.collectionId) {
        const othersInCollection = bookmarks.filter(
          (ob) => ob.collectionId === b.collectionId && ob.id !== b.id
        ).length;
        if (othersInCollection > 0) degree += 1;
      }

      // Compute colors based on coloring mode
      let color = 'var(--color-accent-primary)';
      if (colorMode === 'collection' && b.collectionId) {
        const col = collections.find((c) => c.id === b.collectionId);
        if (col) color = col.color;
      } else {
        // color by category
        if (b.category === 'Project') color = 'var(--color-category-project)';
        else if (b.category === 'Area') color = 'var(--color-category-area)';
        else if (b.category === 'Resource') color = 'var(--color-category-resource)';
      }

      return {
        id: `book-${b.id}`,
        type: 'bookmark',
        name: b.title,
        bookmark: b,
        val: 3.5 + degree * 1.0, // size based on degree (increased)
        r: Math.max(4.5, 3.5 + degree * 1.0), // circle radius (increased)
        color,
      };
    });

    // Combine all nodes
    const nodes = [...bookmarkNodes, ...tagNodes];

    // 4. Build links
    const links: any[] = [];

    // Tag links (bookmark to tag)
    bookmarks.forEach((b) => {
      b.tags.forEach((tag) => {
        links.push({
          source: `book-${b.id}`,
          target: `tag-${tag}`,
          type: 'tag-link',
        });
      });
    });

    // Collection links (star structure: link bookmarks sharing the same collection to the first one in it)
    if (showCollectionLinks) {
      const collectionGroups = new Map<string, typeof bookmarks>();
      bookmarks.forEach((b) => {
        if (b.collectionId) {
          const arr = collectionGroups.get(b.collectionId) || [];
          arr.push(b);
          collectionGroups.set(b.collectionId, arr);
        }
      });

      collectionGroups.forEach((group) => {
        if (group.length <= 1) return;
        const oldest = group.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
        group.forEach((b) => {
          if (b.id !== oldest.id) {
            links.push({
              source: `book-${b.id}`,
              target: `book-${oldest.id}`,
              type: 'collection-link',
            });
          }
        });
      });
    }

    // Tag-to-tag links (if a bookmark has two or more tags, join them sequentially to form semantic hubs)
    bookmarks.forEach((b) => {
      if (b.tags.length >= 2) {
        for (let i = 0; i < b.tags.length - 1; i++) {
          links.push({
            source: `tag-${b.tags[i]}`,
            target: `tag-${b.tags[i + 1]}`,
            type: 'tag-to-tag-link',
          });
        }
      }
    });

    return { nodes, links };
  }, [bookmarks, collections, colorMode, showCollectionLinks]);

  // ---------------------------------------------------------------------------
  // Dynamic Highlight & Fade Logic
  // ---------------------------------------------------------------------------
  const searchFiltered = useMemo(() => getFilteredBookmarks(), [getFilteredBookmarks]);
  const matchingBookmarkIds = useMemo(
    () => new Set(searchFiltered.map((b) => b.id)),
    [searchFiltered]
  );
  const isSearchActive = !!filters.search;

  // Build lookup of connected neighbors for hover highlights
  const neighbors = useMemo(() => {
    const set = new Set<string>();
    if (!hoverNode) return set;
    set.add(hoverNode.id);

    graphData.links.forEach((link) => {
      const sId = typeof link.source === 'object' ? link.source.id : link.source;
      const tId = typeof link.target === 'object' ? link.target.id : link.target;
      if (sId === hoverNode.id) {
        set.add(tId);
      } else if (tId === hoverNode.id) {
        set.add(sId);
      }
    });

    return set;
  }, [hoverNode, graphData.links]);

  // Tag cluster isolation neighbor set
  const isolatedNeighbors = useMemo(() => {
    const set = new Set<string>();
    if (!selectedTag) return set;
    set.add(selectedTag);

    graphData.links.forEach((link) => {
      const sId = typeof link.source === 'object' ? link.source.id : link.source;
      const tId = typeof link.target === 'object' ? link.target.id : link.target;
      if (sId === selectedTag) {
        set.add(tId);
      } else if (tId === selectedTag) {
        set.add(sId);
      }
    });
    return set;
  }, [selectedTag, graphData.links]);

  // Adjust simulation physics forces
  useEffect(() => {
    if (graphRef.current) {
      const fg = graphRef.current;
      fg.d3Force('charge').strength(-150);
      fg.d3Force('link').distance((link: any) => {
        return link.type === 'collection-link' ? 70 : 35;
      });
      fg.d3Force('center').x(0).y(0);
      fg.d3ReheatSimulation();
    }
  }, [graphData.links]);

  // ---------------------------------------------------------------------------
  // Canvas Custom Drawing Custom Renderers
  // ---------------------------------------------------------------------------
  const drawBackgroundGrid = useCallback(
    (ctx: CanvasRenderingContext2D, globalScale: number) => {
      ctx.save();
      // Grid lines fade out as you zoom in (inverse relationship)
      const opacity = Math.max(0.015, 0.05 / Math.sqrt(globalScale));
      ctx.strokeStyle = theme === 'dark' 
        ? `rgba(255, 255, 255, ${opacity})` 
        : `rgba(15, 15, 25, ${opacity})`;
      ctx.lineWidth = 0.5 / globalScale;

      const step = 80;
      const range = 2500;

      ctx.beginPath();
      for (let x = -range; x <= range; x += step) {
        ctx.moveTo(x, -range);
        ctx.lineTo(x, range);
      }
      for (let y = -range; y <= range; y += step) {
        ctx.moveTo(-range, y);
        ctx.lineTo(range, y);
      }
      ctx.stroke();
      ctx.restore();
    },
    [theme]
  );

  const drawNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const label = node.name;
      const isTag = node.type === 'tag';

      // ── DYNAMIC FADE CHECK ──
      let isFaded = false;
      // 1. Isolate tag cluster filter
      if (selectedTag && !isolatedNeighbors.has(node.id)) {
        isFaded = true;
      }
      // 2. Global search bar filter
      if (!isFaded && isSearchActive) {
        if (node.type === 'bookmark') {
          const bookId = node.id.replace('book-', '');
          isFaded = !matchingBookmarkIds.has(bookId);
        } else if (node.type === 'tag') {
          const tagName = node.id.replace('tag-', '');
          const hasMatch = bookmarks.some(
            (b) => b.tags.includes(tagName) && matchingBookmarkIds.has(b.id)
          );
          isFaded = !hasMatch;
        }
      }
      // 3. Hover highlights filter
      if (!isFaded && hoverNode && !neighbors.has(node.id)) {
        isFaded = true;
      }

      const opacity = isFaded ? 0.15 : 1.0;

      ctx.save();
      ctx.globalAlpha = opacity;

      if (isTag) {
        // Draw tag bubble & text
        // Scale down tag bubble text slightly slower as zoomed in
        const fontSize = (11 / globalScale) / Math.pow(globalScale, 0.15);
        ctx.font = `${fontSize}px var(--font-sans)`;
        const textWidth = ctx.measureText(label).width;
        const paddingX = 6 / globalScale;
        const paddingY = 4 / globalScale;
        const radius = 5 / globalScale;

        // Draw bubble background
        ctx.fillStyle = 'rgba(251, 191, 36, 0.12)';
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.35)';
        ctx.lineWidth = 1 / globalScale;

        ctx.beginPath();
        ctx.roundRect(
          node.x - textWidth / 2 - paddingX,
          node.y - fontSize / 2 - paddingY,
          textWidth + paddingX * 2,
          fontSize + paddingY * 2,
          radius
        );
        ctx.fill();
        ctx.stroke();

        // Draw tag label
        ctx.fillStyle = '#fbbf24';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, node.x, node.y);
      } else {
        // Draw bookmark node circle
        // As globalScale increases (zooms in), divide radius to keep nodes tidy
        const baseRadius = node.r || 4.5;
        const radius = baseRadius / Math.pow(globalScale, 0.32);

        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
        ctx.fillStyle = node.color;
        ctx.fill();

        ctx.lineWidth = 1.2 / globalScale;
        ctx.strokeStyle = '#08080c'; // surface-0 stroke
        ctx.stroke();

        // Overlay Favicon if zoomed in
        const showFavicon = globalScale > 1.2;
        if (showFavicon && node.bookmark?.faviconUrl) {
          const img = getCachedImage(node.bookmark.faviconUrl);
          if (img && img.complete && img.naturalWidth !== 0) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius - 0.4, 0, 2 * Math.PI, false);
            ctx.clip();
            ctx.drawImage(img, node.x - radius, node.y - radius, radius * 2, radius * 2);
            ctx.restore();
          }
        }

        // Show label next to it when hovered or zoomed in
        const showLabel = globalScale > 1.8 || node.id === (hoverNode?.id || '');
        if (showLabel) {
          const fontSize = 10 / globalScale;
          ctx.font = `${fontSize}px var(--font-sans)`;
          ctx.fillStyle = theme === 'dark' ? '#eeeef4' : '#111119';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(`  ${label}`, node.x + radius, node.y);
        }
      }

      ctx.restore();
    },
    [
      hoverNode,
      getCachedImage,
      theme,
      selectedTag,
      isolatedNeighbors,
      isSearchActive,
      matchingBookmarkIds,
      bookmarks,
      neighbors,
    ]
  );

  const drawLink = useCallback(
    (link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const start = link.source;
      const end = link.target;
      if (typeof start !== 'object' || typeof end !== 'object') return;

      const sId = start.id;
      const tId = end.id;

      // ── DYNAMIC FADE CHECK ──
      let isFaded = false;

      // Hover fades links
      if (hoverNode && (!neighbors.has(sId) || !neighbors.has(tId))) {
        isFaded = true;
      }

      // Tag isolation fades links
      if (!isFaded && selectedTag && (sId !== selectedTag && tId !== selectedTag)) {
        isFaded = true;
      }

      // Search filters fades links
      if (!isFaded && isSearchActive) {
        const sBook = sId.startsWith('book-') ? sId.replace('book-', '') : '';
        const tBook = tId.startsWith('book-') ? tId.replace('book-', '') : '';

        if (sBook || tBook) {
          const sMatched = !sBook || matchingBookmarkIds.has(sBook);
          const tMatched = !tBook || matchingBookmarkIds.has(tBook);
          isFaded = !sMatched || !tMatched;
        } else {
          // Both are tags (tag-to-tag link)
          const sTag = sId.replace('tag-', '');
          const tTag = tId.replace('tag-', '');
          const sMatched = bookmarks.some((b) => b.tags.includes(sTag) && matchingBookmarkIds.has(b.id));
          const tMatched = bookmarks.some((b) => b.tags.includes(tTag) && matchingBookmarkIds.has(b.id));
          isFaded = !sMatched || !tMatched;
        }
      }

      // Fade link lines as you zoom in (inverse relationship), but keep a minimum of 0.05 opacity
      const baseOpacity = isFaded ? 0.02 : 0.35;
      const opacity = Math.max(0.04, baseOpacity / Math.sqrt(globalScale));

      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);

      if (link.type === 'collection-link') {
        ctx.strokeStyle = 'var(--color-surface-500)';
        ctx.lineWidth = 0.8 / globalScale;
        ctx.setLineDash([2, 3]);
      } else if (link.type === 'tag-to-tag-link') {
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.35)'; // Amber/Gold color
        ctx.lineWidth = 0.9 / globalScale;
        ctx.setLineDash([3, 3]); // Dashed style
      } else {
        ctx.strokeStyle = 'var(--color-surface-400)';
        ctx.lineWidth = 1.0 / globalScale;
        ctx.setLineDash([]);
      }

      ctx.stroke();
      ctx.restore();
    },
    [hoverNode, neighbors, selectedTag, isSearchActive, matchingBookmarkIds, bookmarks]
  );

  // ---------------------------------------------------------------------------
  // Action Handlers
  // ---------------------------------------------------------------------------
  const handleNodeClick = useCallback(
    (node: any, event: MouseEvent) => {
      event.stopPropagation();

      const now = Date.now();
      const timeDiff = now - lastClickTimeRef.current;

      if (lastClickedNodeRef.current === node && timeDiff < 300) {
        // Double click detected!
        if (node.type === 'bookmark' && node.bookmark?.url) {
          window.open(node.bookmark.url, '_blank', 'noopener,noreferrer');
        }
        // Reset click tracking
        lastClickTimeRef.current = 0;
        lastClickedNodeRef.current = null;
        setPopoverBookmark(null);
        setPopoverPosition(null);
        return;
      }

      // Track single click
      lastClickTimeRef.current = now;
      lastClickedNodeRef.current = node;

      if (node.type === 'tag') {
        setSelectedTag(node.id === selectedTag ? null : node.id);
        setPopoverBookmark(null);
        setPopoverPosition(null);
      } else {
        // Bookmark node click
        // Compute canvas coordinates to screen coordinates
        const screenCoords = graphRef.current.graph2ScreenCoords(node.x, node.y);
        if (screenCoords) {
          setPopoverBookmark(node.bookmark);
          setPopoverPosition({ x: screenCoords.x, y: screenCoords.y });
        }
      }
    },
    [selectedTag]
  );

  const handleRecenter = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.zoomToFit(800, 60);
    }
  }, []);

  const handleZoomIn = useCallback(() => {
    if (graphRef.current) {
      const currentZoom = graphRef.current.zoom();
      graphRef.current.zoom(currentZoom * 1.3, 300);
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (graphRef.current) {
      const currentZoom = graphRef.current.zoom();
      graphRef.current.zoom(currentZoom / 1.3, 300);
    }
  }, []);

  // Popover Actions
  const handleCopy = async (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Copied URL to clipboard');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy URL');
    }
  };

  const handleOpen = (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    window.open(url, '_blank', 'noopener,noreferrer');
    setPopoverBookmark(null);
    setPopoverPosition(null);
  };

  const handleEdit = (e: React.MouseEvent, b: Bookmark) => {
    e.stopPropagation();
    openEditModal(b);
    setPopoverBookmark(null);
    setPopoverPosition(null);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteBookmark(id);
    setPopoverBookmark(null);
    setPopoverPosition(null);
  };

  return (
    <div className="w-full h-full flex-1 relative min-h-[450px] overflow-hidden select-none bg-surface-0">
      {/* ── React Force Graph canvas ──────────────────────────────────── */}
      <ForceGraph2D
        ref={graphRef}
        graphData={graphData}
        nodeCanvasObject={drawNode}
        linkCanvasObject={drawLink}
        onRenderFramePre={(ctx, globalScale) => drawBackgroundGrid(ctx, globalScale)}
        onNodeHover={(node) => setHoverNode(node)}
        onNodeClick={handleNodeClick}
        onNodeRightClick={handleNodeClick}
        onBackgroundClick={() => {
          setSelectedTag(null);
          setPopoverBookmark(null);
          setPopoverPosition(null);
        }}
        cooldownTicks={120}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        enableNodeDrag={true}
        onNodeDragEnd={(node) => {
          // Keep node pinned or let simulation naturally resettle:
          // d3 force graph node.fx and node.fy lock position, we reset them to undefined to let it resettle:
          node.fx = undefined;
          node.fy = undefined;
        }}
      />

      {/* ── Isolation State Notification Pill ────────────────────────── */}
      <AnimatePresence>
        {selectedTag && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className="absolute top-4 left-1/2 bg-surface-300 border border-glass-border px-3.5 py-2 rounded-xl shadow-lg flex items-center gap-2.5 z-10 text-xs text-surface-900"
          >
            <span className="w-2 h-2 rounded-full bg-accent-warning animate-pulse" />
            <span className="font-semibold">Showing Tag Hub:</span>
            <span className="bg-surface-100 px-2 py-0.5 rounded-lg border border-glass-border font-bold text-accent-warning">
              {selectedTag.replace('tag-', '#')}
            </span>
            <button
              onClick={() => setSelectedTag(null)}
              className="text-[10px] bg-surface-50 hover:bg-surface-200 text-surface-600 hover:text-surface-900 px-2 py-1 rounded-md border border-glass-border font-medium transition-colors cursor-pointer"
            >
              Reset view
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Overlay Popover Portal ────────────────────────────────────── */}
      <AnimatePresence>
        {popoverBookmark && popoverPosition && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            className="absolute bg-surface-200 border border-glass-border px-2 py-1.5 rounded-xl shadow-xl z-30 flex items-center gap-0.5 glass min-w-max"
            style={{
              left: `${popoverPosition.x}px`,
              top: `${popoverPosition.y - 48}px`, // Float slightly above the node
              transform: 'translateX(-50%)',
            }}
          >
            <button
              onClick={(e) => handleOpen(e, popoverBookmark.url)}
              className="p-1.5 rounded-lg hover:bg-surface-300 text-surface-700 hover:text-surface-950 transition-colors cursor-pointer"
              title="Open URL"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => handleEdit(e, popoverBookmark)}
              className="p-1.5 rounded-lg hover:bg-surface-300 text-surface-700 hover:text-surface-950 transition-colors cursor-pointer"
              title="Edit Bookmark"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => handleCopy(e, popoverBookmark.url)}
              className="p-1.5 rounded-lg hover:bg-surface-300 text-surface-700 hover:text-surface-950 transition-colors cursor-pointer"
              title="Copy URL"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-accent-success" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
            <div className="w-px h-4 bg-glass-border mx-1" />
            <button
              onClick={(e) => handleDelete(e, popoverBookmark.id)}
              className="p-1.5 rounded-lg hover:bg-accent-danger/25 text-accent-danger transition-colors cursor-pointer"
              title="Delete Bookmark"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Legend & Controls Drawer Panel ───────────────────────────── */}
      <div className="absolute right-4 bottom-4 flex flex-col gap-2 items-end z-10">
        {/* Toggle drawer button */}
        <button
          onClick={() => setShowControls(!showControls)}
          className={`p-2.5 rounded-xl border border-glass-border transition-all cursor-pointer flex items-center gap-1.5 shadow-md ${
            showControls ? 'bg-surface-300 text-surface-950' : 'glass text-surface-700 hover:text-surface-950 hover:bg-surface-200'
          }`}
          title="Graph Preferences"
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span className="text-xs font-semibold">Graph Options</span>
        </button>

        <AnimatePresence>
          {showControls && (
            <motion.div
              initial={{ opacity: 0, y: 15, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.95 }}
              className="glass p-4 rounded-2xl border border-glass-border shadow-xl flex flex-col gap-3.5 w-60 text-xs text-surface-900"
            >
              {/* Color Mode Switcher */}
              <div className="space-y-1.5">
                <span className="font-semibold text-surface-600 block uppercase tracking-wider text-[10px]">
                  Color Nodes By
                </span>
                <div className="grid grid-cols-2 bg-surface-200 rounded-xl p-0.5 border border-glass-border">
                  <button
                    onClick={() => setColorMode('category')}
                    className={`py-1.5 rounded-lg font-medium text-center transition-all cursor-pointer ${
                      colorMode === 'category' ? 'bg-surface-300 text-surface-950 shadow-sm' : 'text-surface-500 hover:text-surface-900'
                    }`}
                  >
                    Category
                  </button>
                  <button
                    onClick={() => setColorMode('collection')}
                    className={`py-1.5 rounded-lg font-medium text-center transition-all cursor-pointer ${
                      colorMode === 'collection' ? 'bg-surface-300 text-surface-950 shadow-sm' : 'text-surface-500 hover:text-surface-900'
                    }`}
                  >
                    Collection
                  </button>
                </div>
              </div>

              {/* Show Collection Links Toggle */}
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="font-semibold text-surface-650">Link Same Collections</span>
                <input
                  type="checkbox"
                  checked={showCollectionLinks}
                  onChange={(e) => setShowCollectionLinks(e.target.checked)}
                  className="w-4 h-4 rounded-md accent-accent-primary cursor-pointer shrink-0"
                />
              </label>

              <hr className="border-glass-border my-0.5" />

              {/* Graph Legend */}
              <div className="space-y-2">
                <span className="font-semibold text-surface-600 block uppercase tracking-wider text-[10px]">
                  Graph Legend
                </span>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-[#fbbf24] border border-[#fbbf24]/20" />
                    <span className="text-surface-700">Tag Hub nodes (#tag)</span>
                  </div>
                  {colorMode === 'category' ? (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-category-project" />
                        <span className="text-surface-700">Project Category</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-category-area" />
                        <span className="text-surface-700">Area Category</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-category-resource" />
                        <span className="text-surface-700">Resource Category</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[10px] text-surface-550 leading-relaxed italic">
                      <Info className="w-3.5 h-3.5 shrink-0" />
                      <span>Nodes match custom collection database colors.</span>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Zoom and Recenter Controls ────────────────────────────────── */}
      <div className="absolute left-4 bottom-4 flex flex-col gap-1.5 z-10 glass p-1 rounded-xl border border-glass-border shadow-md">
        <button
          onClick={handleZoomIn}
          className="p-2 rounded-lg hover:bg-surface-200 text-surface-700 hover:text-surface-950 transition-colors cursor-pointer"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={handleZoomOut}
          className="p-2 rounded-lg hover:bg-surface-200 text-surface-700 hover:text-surface-950 transition-colors cursor-pointer"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <hr className="border-glass-border mx-1" />
        <button
          onClick={handleRecenter}
          className="p-2 rounded-lg hover:bg-surface-200 text-surface-700 hover:text-surface-950 transition-colors cursor-pointer"
          title="Fit view / Recenter Graph"
        >
          <Maximize className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
