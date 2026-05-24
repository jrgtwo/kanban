export type Accent = 'vermillion' | 'ochre' | 'moss' | 'ink'

export const ACCENT_TOKENS: Record<
  Accent,
  { swatch: string; ink: string; label: string }
> = {
  vermillion: {
    swatch: 'var(--color-vermillion)',
    ink: 'var(--color-paper)',
    label: 'Vermillion',
  },
  ochre: {
    swatch: 'var(--color-ochre)',
    ink: 'var(--color-ink)',
    label: 'Ochre',
  },
  moss: {
    swatch: 'var(--color-moss)',
    ink: 'var(--color-paper)',
    label: 'Moss',
  },
  ink: { swatch: 'var(--color-ink)', ink: 'var(--color-paper)', label: 'Ink' },
}

export const romanize = (n: number): string => {
  const map: [number, string][] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ]
  let result = ''
  let num = Math.max(1, n)
  for (const [value, sym] of map) {
    while (num >= value) {
      result += sym
      num -= value
    }
  }
  return result
}
