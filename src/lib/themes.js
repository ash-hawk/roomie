const light = { bg: '#f6f6f5', card: '#ffffff', ink: '#202124', mute: '#55585f', line: '#d8dadd', accent: '#292b30', 'on-accent': '#ffffff', good: '#16733D', warn: '#855000', bad: '#A92B2B' };
const dark = { bg: '#151515', card: '#222222', ink: '#f5f5f5', mute: '#c0c0c0', line: '#515151', accent: '#eeeeee', 'on-accent': '#202124', good: '#62D493', warn: '#F3B859', bad: '#FF8585' };
const themeColors = (base, accent) => ({ ...base, accent, 'on-accent': onColor(accent) });
// Exact source palettes remain visible; each supplies an app-wide accent in both modes.
export const themes = {
  coastal: { name: 'Coastal', description: 'Orange, golden yellow, olive, and charcoal blue.',
    palette: ['#FE7F2D', '#FCCA46', '#89925F', '#627F67', '#233D4D', '#426C6C', '#619B8A'],
    light: themeColors(light, '#FE7F2D'),
    dark: themeColors(dark, '#FE7F2D') },
  orchid: { name: 'Orchid', description: 'Orchid pink, blue grey, Baltic blue, and navy.',
    palette: ['#CC87D4', '#9877BC', '#6466A3', '#709BCE', '#435E85', '#16213C', '#210127'],
    light: themeColors(light, '#6466A3'),
    dark: themeColors(dark, '#CC87D4') },
  berry: { name: 'Berry', description: 'Burgundy, blackberry, berry pinks, and mint.',
    palette: ['#694D6D', '#63274B', '#5C0029', '#882F5F', '#B35E94', '#A0DBC0', '#ACF7C1'],
    light: themeColors(light, '#882F5F'),
    dark: themeColors(dark, '#B35E94') },
  retro: { name: 'Retro', description: 'Mustard yellow, paprika, berry pink, blue, and teal.',
    palette: ['#F1C40F', '#E5643C', '#D90368', '#913977', '#2274A5', '#11A086', '#00CC66'],
    light: themeColors(light, '#D90368'),
    dark: themeColors(dark, '#F1C40F') },
  sunset: { name: 'Sunset', description: 'Deep purples, blush pink, tangerine, and saffron.',
    palette: ['#22162B', '#341B40', '#451F55', '#724E91', '#E54F6D', '#EF8B4F', '#F8C630'],
    light: themeColors(light, '#724E91'),
    dark: themeColors(dark, '#EF8B4F') },
};

export function onColor(hex) {
  const luminance = (color) => {
    const c = color.slice(1).match(/../g).map(part => parseInt(part, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  };
  const value = luminance(hex), darkText = 0;
  return (value + 0.05) / (darkText + 0.05) >= 1.05 / (value + 0.05) ? '#000000' : '#FFFFFF';
}

export function contrastRatio(a, b) {
  const luminance = hex => {
    const c = hex.slice(1).match(/../g).map(part => parseInt(part, 16) / 255)
      .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  };
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
