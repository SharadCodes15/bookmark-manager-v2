/**
 * Extract the domain (hostname) from a URL string.
 */
export function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Return a Google S2 favicon URL for the given page URL.
 */
export function getFaviconUrl(url: string): string {
  const domain = getDomain(url);
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

/**
 * Generate a unique ID using the Web Crypto API.
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Format a Unix-millisecond timestamp to a locale date string.
 */
export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString();
}

/**
 * Utility to join class names, filtering out falsy values.
 */
export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
