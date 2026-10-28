export type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info';

// Colour means something or it is not used: tags and stat icons tint only when the tone says something.
// The first four are the original app's values; `info` is the blue pair added for neutral-but-notable states.
export const tones: Record<Tone, { bg: string; color: string }> = {
  neutral: { bg: '#ECEEF1', color: '#17191C' },
  good: { bg: '#E3F3E8', color: '#1E7A3C' },
  warn: { bg: '#FBF0D9', color: '#9A6B10' },
  bad: { bg: '#FBE4E4', color: '#B03A3A' },
  info: { bg: '#E4EDFA', color: '#2A5AA7' },
};
