/**
 * Returns the public-facing base URL for attendee links.
 * In preview/dev environments (lovableproject.com or localhost),
 * falls back to the published custom domain.
 */
export function getPublicOrigin(): string {
  const origin = window.location.origin;
  // Lovable preview URLs contain "lovableproject.com" or "id-preview--"
  if (
    origin.includes('lovableproject.com') ||
    origin.includes('id-preview--')
  ) {
    // Use the published URL
    return 'https://gg-eventcheckin.lovable.app';
  }
  return origin;
}
