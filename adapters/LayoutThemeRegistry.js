const COLOR_THEMES = {
  classic: { primary: '#172033', accent: '#64748B', soft: '#F8FAFC', invertedHeader: false },
  spotlight: { primary: '#183153', accent: '#9A6700', soft: '#FBF7EF', invertedHeader: true },
  technical: { primary: '#075E54', accent: '#087F73', soft: '#EFF8F6', invertedHeader: true }
};

const MONO_THEME = { primary: '#111111', accent: '#333333', soft: '#F2F2F2', invertedHeader: false };

export class LayoutThemeRegistry {
  resolve(layout, colorMode = 'color') {
    const theme = COLOR_THEMES[layout];
    if (!theme) throw new Error(`Unsupported PDF layout: ${layout}`);
    return colorMode === 'monochrome' ? MONO_THEME : theme;
  }

  supported() {
    return Object.keys(COLOR_THEMES);
  }
}
