import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface MarkdownProps {
  content: string;
}

export default function Markdown({ content }: MarkdownProps) {
  // Split content by triple backticks to identify code blocks
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2 text-sm leading-relaxed text-surface-900 break-words">
      {parts.map((part, index) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          // It's a code block
          const codeContent = part.slice(3, -3);
          const firstNewLine = codeContent.indexOf('\n');
          let language = 'text';
          let codeText = codeContent;

          if (firstNewLine !== -1) {
            language = codeContent.substring(0, firstNewLine).trim();
            codeText = codeContent.substring(firstNewLine + 1);
          }

          return <CodeBlock key={index} code={codeText} language={language} />;
        } else {
          // Inline markdown parsing
          return <InlineMarkdown key={index} text={part} />;
        }
      })}
    </div>
  );
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-glass-border bg-surface-50 shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-surface-100 border-b border-glass-border">
        <span className="text-xs font-semibold text-surface-600 uppercase tracking-wider">
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-surface-650 hover:text-surface-850 transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-accent-success" />
              <span className="text-accent-success font-medium">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      {/* Code */}
      <pre className="p-4 overflow-x-auto text-xs font-mono bg-surface-0/40 text-surface-900 leading-normal">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function InlineMarkdown({ text }: { text: string }) {
  // Split by double newline to render paragraphs
  const paragraphs = text.split(/\n{2,}/g);

  return (
    <>
      {paragraphs.map((p, pIdx) => {
        const trimmed = p.trim();
        if (!trimmed) return null;

        // Check if it's a heading
        if (trimmed.startsWith('# ')) {
          return <h1 key={pIdx} className="text-base sm:text-lg font-bold text-surface-950 mt-4 mb-2">{parseInlineElements(trimmed.slice(2))}</h1>;
        }
        if (trimmed.startsWith('## ')) {
          return <h2 key={pIdx} className="text-sm sm:text-base font-bold text-surface-950 mt-3 mb-2">{parseInlineElements(trimmed.slice(3))}</h2>;
        }
        if (trimmed.startsWith('### ')) {
          return <h3 key={pIdx} className="text-xs sm:text-sm font-bold text-surface-950 mt-2 mb-1.5">{parseInlineElements(trimmed.slice(4))}</h3>;
        }

        // Check if it's a list
        const lines = trimmed.split('\n');
        const isList = lines.every((line) => {
          const l = line.trim();
          return l.startsWith('- ') || l.startsWith('* ') || /^\d+\.\s/.test(l);
        });

        if (isList) {
          const isOrdered = /^\d+\.\s/.test(lines[0].trim());
          const Tag = isOrdered ? 'ol' : 'ul';
          return (
            <Tag key={pIdx} className={`list-outside pl-5 mb-3 space-y-1 ${isOrdered ? 'list-decimal' : 'list-disc'}`}>
              {lines.map((line, lIdx) => {
                const cleanedLine = line.trim().replace(/^[-*]\s|^\d+\.\s/, '');
                return <li key={lIdx} className="text-xs sm:text-sm text-surface-850">{parseInlineElements(cleanedLine)}</li>;
              })}
            </Tag>
          );
        }

        // Regular paragraph
        return (
          <p key={pIdx} className="mb-2 text-xs sm:text-sm text-surface-850 last:mb-0">
            {parseInlineElements(trimmed)}
          </p>
        );
      })}
    </>
  );
}

function parseInlineElements(text: string): React.ReactNode[] {
  // Regex to match bold (**text** or __text__) and inline code (`code`)
  const tokens = text.split(/(\*\*.*?\*\*|__.*?__|`.*?`)/g);

  return tokens.map((token, index) => {
    if ((token.startsWith('**') && token.endsWith('**')) || (token.startsWith('__') && token.endsWith('__'))) {
      return <strong key={index} className="font-bold text-surface-950">{token.slice(2, -2)}</strong>;
    }
    if (token.startsWith('`') && token.endsWith('`')) {
      return <code key={index} className="px-1.5 py-0.5 rounded bg-surface-300 font-mono text-[10px] sm:text-xs text-accent-secondary-dark">{token.slice(1, -1)}</code>;
    }
    return token;
  });
}
