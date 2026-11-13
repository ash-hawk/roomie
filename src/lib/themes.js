const light = { bg: '#f6f6f5', card: '#ffffff', ink: '#202124', mute: '#55585f', line: '#d8dadd', accent: '#292b30', 'on-accent': '#ffffff', good: '#16733D', warn: '#855000', bad: '#A92B2B' };
const dark = { bg: '#151515', card: '#222222', ink: '#f5f5f5', mute: '#c0c0c0', line: '#515151', accent: '#eeeeee', 'on-accent': '#202124', good: '#62D493', warn: '#F3B859', bad: '#FF8585' };
// Roles describe interface styling, not Events/Chores/Finances categories.
const definitions = {
  coastal: ['Coastal', 'Orange, golden yellow, olive, and charcoal blue.', ['#FE7F2D','#FCCA46','#89925F','#627F67','#233D4D','#426C6C','#619B8A'], [0,4,1,5,3,6,2]],
  orchid: ['Orchid', 'Orchid pink, blue grey, Baltic blue, and navy.', ['#CC87D4','#9877BC','#6466A3','#709BCE','#435E85','#16213C','#210127'], [0,2,3,4,1,5,6]],
  berry: ['Berry', 'Burgundy, blackberry, berry pinks, and mint.', ['#694D6D','#63274B','#5C0029','#882F5F','#B35E94','#A0DBC0','#ACF7C1'], [4,2,6,5,3,0,1]],
  retro: ['Retro', 'Mustard yellow, paprika, berry pink, blue, and teal.', ['#F1C40F','#E5643C','#D90368','#913977','#2274A5','#11A086','#00CC66'], [1,3,0,4,5,2,6]],
  sunset: ['Sunset', 'Deep purples, blush pink, tangerine, and saffron.', ['#22162B','#341B40','#451F55','#724E91','#E54F6D','#EF8B4F','#F8C630'], [5,3,6,4,2,1,0]],
};
function themeColors(base, palette, order) {
  const [accent, nav, highlight, detail, secondary, decoration, outline] = order.map(i => palette[i]);
  const readable = palette.filter(c => contrastRatio(c, base.card) >= 4.5 && contrastRatio(c, base.bg) >= 4.5);
  const textAccent = readable.includes(detail) ? detail : readable[0] ?? base.ink;
  const focus = [highlight, detail, accent, ...palette].find(c => contrastRatio(c, base.card) >= 3 && contrastRatio(c, base.bg) >= 3) ?? base.ink;
  return { ...base, accent, 'on-accent': onColor(accent), 'nav-accent': nav, 'on-nav': onColor(nav),
    highlight, 'on-highlight': onColor(highlight), 'on-decoration': onColor(decoration), 'on-outline': onColor(outline), detail, secondary, decoration, outline,
    'text-accent': textAccent, focus, good: textAccent, warn: textAccent, bad: textAccent, danger: accent };
}
export const themes = Object.fromEntries(Object.entries(definitions).map(([id, [name, description, palette, order]]) => [id, {
  name, description, palette, light: themeColors(light, palette, order), dark: themeColors(dark, palette, order),
}]));

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
