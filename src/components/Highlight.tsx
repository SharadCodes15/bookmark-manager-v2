import React from 'react';

interface HighlightProps {
  text: string;
  matches?: any[];
  matchKey: string;
  value?: string;
}

export default function Highlight({ text, matches, matchKey, value }: HighlightProps) {
  if (!matches) return <>{text}</>;

  const match = matches.find(
    (m) => m.key === matchKey && (value === undefined || m.value === value)
  );
  if (!match || !match.indices) return <>{text}</>;

  const indices = match.indices as [number, number][];
  const result: React.ReactNode[] = [];
  let lastIndex = 0;

  indices.forEach(([start, end], i) => {
    // Unmatched part before match
    if (start > lastIndex) {
      result.push(text.slice(lastIndex, start));
    }
    // Matched part (inclusive indices in Fuse.js)
    result.push(
      <mark
        key={i}
        className="bg-accent-primary/30 text-accent-primary-light font-semibold rounded-sm px-0.5 border-b border-accent-primary/40"
      >
        {text.slice(start, end + 1)}
      </mark>
    );
    lastIndex = end + 1;
  });

  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex));
  }

  return <>{result}</>;
}
