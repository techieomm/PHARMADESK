/**
 * Code 128 Auto/B Barcode SVG Generator
 * Pure TypeScript implementation for crisp label printing on thermal printers.
 * Zero external libraries needed.
 */

// Code 128 patterns (widths of bars and spaces)
const CODE128_PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
];

const START_CODE_B = 104;
const STOP_CODE = 106;

export function generateCode128Svg(text: string, height: number = 50, barWidth: number = 2): string {
  const clean = text.trim();
  const codes: number[] = [START_CODE_B];
  let checkSum = START_CODE_B;

  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i) - 32;
    codes.push(code);
    checkSum += code * (i + 1);
  }

  codes.push(checkSum % 103);
  codes.push(STOP_CODE);

  // Build pattern
  let pattern = '';
  for (const c of codes) {
    if (c >= 0 && c < CODE128_PATTERNS.length) {
      pattern += CODE128_PATTERNS[c];
    }
  }

  let totalModules = 0;
  for (let i = 0; i < pattern.length; i++) {
    totalModules += parseInt(pattern[i], 10);
  }

  const svgWidth = totalModules * barWidth + 20; // with 10px quiet zone on each side

  let currentX = 10;
  let rectsSvg = '';

  for (let i = 0; i < pattern.length; i++) {
    const moduleWidth = parseInt(pattern[i], 10) * barWidth;
    const isBar = i % 2 === 0;

    if (isBar) {
      rectsSvg += `<rect x="${currentX}" y="0" width="${moduleWidth}" height="${height}" fill="#000000" />`;
    }
    currentX += moduleWidth;
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${height + 16}" width="${svgWidth}" height="${height + 16}">
      ${rectsSvg}
      <text x="${svgWidth / 2}" y="${height + 12}" text-anchor="middle" font-family="monospace" font-size="11" fill="#000000">${clean}</text>
    </svg>
  `.trim();
}
