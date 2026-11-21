export const BRAND_MARK_PATH = 'M9 25V8h15M9 16.5h6';

type BrandMarkProps = {
  size?: number;
  className?: string;
};

export function BrandMark({ size = 24, className }: BrandMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      focusable="false"
      style={{ color: 'var(--fw-primary)' }}
    >
      <path
        d={BRAND_MARK_PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="20.5" cy="16.5" r="3.1" fill="var(--fw-accent)" />
    </svg>
  );
}

export function initializeBrandFavicon() {
  const link = document.getElementById('fw-favicon');
  if (!(link instanceof HTMLLinkElement)) return;

  const tokens = getComputedStyle(document.documentElement);
  const primary = tokens.getPropertyValue('--fw-primary').trim();
  const accent = tokens.getPropertyValue('--fw-accent').trim();
  if (!primary || !accent) return;

  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
    '<path d="' +
    BRAND_MARK_PATH +
    '" fill="none" stroke="' +
    primary +
    '" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="20.5" cy="16.5" r="3.1" fill="' +
    accent +
    '"/>' +
    '</svg>';
  link.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
}
