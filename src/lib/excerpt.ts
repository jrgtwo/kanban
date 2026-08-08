/**
 * Flatten markdown to plain prose for a card face.
 *
 * Card descriptions are clamped to a few lines, and a clamped body full of
 * `##`, `**` and backticks reads as syntax rather than as a summary — the
 * reader sees punctuation before they see the sentence. The full document is
 * one click away in the ticket detail, rendered properly; this only has to
 * answer "what is this card about".
 *
 * Deliberately lossy. It strips markers rather than interpreting them, so
 * anything it does not recognise survives as its own text instead of vanishing.
 */
export function excerpt(markdown: string): string {
  return markdown
    .split('\n')
    // Fenced code blocks read as noise at three lines; drop the fences and keep
    // the code, which at least says something.
    .filter((line) => !line.trimStart().startsWith('```'))
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s+/, '') // headings
        .replace(/^\s*>\s?/, '') // quotes
        .replace(/^\s*[-*+]\s+/, '') // bullets
        .replace(/^\s*\d+\.\s+/, '') // numbered items
        .trim(),
    )
    // A horizontal rule leaves an empty string; so does a blank line.
    .filter((line) => line !== '' && !/^[-_*]{3,}$/.test(line))
    .join(' ')
    .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, '$1') // italic
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links → their text
    .replace(/\s+/g, ' ')
    .trim()
}
