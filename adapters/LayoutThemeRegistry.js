/**
 * The palette, with a role for every colour and a grey that survives monochrome.
 *
 * `signal` is text-weight and must clear 4.5:1 on white; `signalBright` marks only geometry —
 * bars and ticks — so it answers to 1.4.11's 3:1 instead. Neither ever carries meaning alone.
 */
const SIGNALS = {
  ember: { signal: '#C2410C', signalBright: '#EA580C' },
  glacier: { signal: '#0E7490', signalBright: '#0891B2' }
};

const INK = '#14161A';
const BODY = '#2B2F36';
const MUTED = '#475569';
const SOFT = '#F4F4F5';

const COLOR_THEMES = {
  classic: { primary: INK, ink: INK, body: BODY, muted: MUTED, soft: SOFT, invertedHeader: false },
  spotlight: { primary: INK, ink: INK, body: BODY, muted: MUTED, soft: SOFT, invertedHeader: false },
  technical: { primary: INK, ink: INK, body: BODY, muted: MUTED, soft: SOFT, invertedHeader: false }
};

const MONO_THEME = {
  primary: '#111111', ink: '#111111', body: '#333333', muted: '#555555', soft: '#F2F2F2',
  signal: '#333333', signalBright: '#333333', accent: '#333333', invertedHeader: false
};

export class LayoutThemeRegistry {
  constructor(signal = 'ember') {
    this.signal = SIGNALS[signal] ? signal : 'ember';
  }

  resolve(layout, colorMode = 'color') {
    const theme = COLOR_THEMES[layout];
    if (!theme) throw new Error(`Unsupported PDF layout: ${layout}`);
    if (colorMode === 'monochrome') return MONO_THEME;
    const signal = SIGNALS[this.signal];
    return { ...theme, ...signal, accent: signal.signal };
  }

  supported() {
    return Object.keys(COLOR_THEMES);
  }

  signals() {
    return Object.keys(SIGNALS);
  }
}
