export function styleProblems(style: string, title: string): string[] {
  const problems: string[] = [];
  if (style.length > 900) problems.push('Style exceeds 900 characters');
  if (/\b(funny but serious|title joke|title pun|comedic premise|joke-derived)\b/i.test(style)) {
    problems.push('Keep the title joke and humor framing out of Style');
  }
  const normalizedTitle = title
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const normalizedStyle = style
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ');
  if (normalizedTitle.length >= 7 && ` ${normalizedStyle} `.includes(` ${normalizedTitle} `)) {
    problems.push('The track title belongs in the Title field, not Style');
  }
  return problems;
}
