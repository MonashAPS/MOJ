export function Announcement({ html }: { html?: string }) {
  if (!html || html.trim().length === 0) return null;
  return (
    <div id="announcement" role="status">
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: misc config, staff authored */}
      <span dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
