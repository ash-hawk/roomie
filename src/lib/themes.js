const light = { bg: '#f6f6f5', card: '#ffffff', ink: '#202124', mute: '#55585f', line: '#d8dadd', accent: '#292b30', 'on-accent': '#ffffff', good: '#16733D', warn: '#855000', bad: '#A92B2B' };
const dark = { bg: '#151515', card: '#222222', ink: '#f5f5f5', mute: '#c0c0c0', line: '#515151', accent: '#eeeeee', 'on-accent': '#202124', good: '#62D493', warn: '#F3B859', bad: '#FF8585' };
// Source swatches are the user's exact palettes. Dark category accents adapt only
// the shades that disappear against charcoal; the source palette stays visible.
export const themes = {
  coastal: { name: 'Coastal', description: 'Orange, golden yellow, olive, and charcoal blue.',
    palette: ['#FE7F2D', '#FCCA46', '#89925F', '#627F67', '#233D4D', '#426C6C', '#619B8A'],
    light: { ...light, 'color-event': '#FE7F2D', 'color-chore': '#627F67', 'color-finance': '#233D4D', 'color-announcement': '#FCCA46' },
    dark: { ...dark, 'color-event': '#FE7F2D', 'color-chore': '#9BB59E', 'color-finance': '#8EADBD', 'color-announcement': '#FCCA46' } },
  orchid: { name: 'Orchid', description: 'Orchid pink, blue grey, Baltic blue, and navy.',
    palette: ['#FFFFFF', '#CC87D4', '#709BCE', '#435E85', '#16213C'],
    light: { ...light, 'color-event': '#CC87D4', 'color-chore': '#709BCE', 'color-finance': '#435E85', 'color-announcement': '#16213C' },
    dark: { ...dark, 'color-event': '#CC87D4', 'color-chore': '#709BCE', 'color-finance': '#9AB2D2', 'color-announcement': '#C2CDE3' } },
  berry: { name: 'Berry', description: 'Burgundy, blackberry, rosy grey, aqua, and mint.',
    palette: ['#5C0029', '#61304B', '#857C8D', '#94BFBE', '#ACF7C1'],
    light: { ...light, 'color-event': '#5C0029', 'color-chore': '#94BFBE', 'color-finance': '#61304B', 'color-announcement': '#ACF7C1' },
    dark: { ...dark, 'color-event': '#E19ABB', 'color-chore': '#94BFBE', 'color-finance': '#C39AB2', 'color-announcement': '#ACF7C1' } },
};
