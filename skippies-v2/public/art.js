/* SKIPPIES art: all creatures drawn in code as SVG (original designs). */
(function (root) {
  'use strict';
  const K = '#1F2A24';
  function face(cx, cy, mood) {
    const blush = `<ellipse cx="${cx - 22}" cy="${cy + 10}" rx="5" ry="3" fill="#F49AAE" opacity=".8"/><ellipse cx="${cx + 22}" cy="${cy + 10}" rx="5" ry="3" fill="#F49AAE" opacity=".8"/>`;
    if (mood === 'sleepy') {
      return `<path d="M${cx - 19} ${cy + 1} q6 5 12 0 M${cx + 7} ${cy + 1} q6 5 12 0" fill="none" stroke="${K}" stroke-width="2.6" stroke-linecap="round"/>${blush}
      <ellipse cx="${cx}" cy="${cy + 13}" rx="3" ry="2.4" fill="${K}"/><text x="${cx + 26}" y="${cy - 14}" font-size="14" font-weight="800" fill="${K}" font-family="system-ui,sans-serif">z</text>`;
    }
    const eyes = `<ellipse cx="${cx - 13}" cy="${cy}" rx="6.5" ry="7.5" fill="#fff" stroke="${K}" stroke-width="2"/><ellipse cx="${cx + 13}" cy="${cy}" rx="6.5" ry="7.5" fill="#fff" stroke="${K}" stroke-width="2"/>
      <circle cx="${cx - 12}" cy="${cy + 1.5}" r="3.4" fill="${K}"/><circle cx="${cx + 14}" cy="${cy + 1.5}" r="3.4" fill="${K}"/><circle cx="${cx - 10.6}" cy="${cy - 0.5}" r="1.1" fill="#fff"/><circle cx="${cx + 15.4}" cy="${cy - 0.5}" r="1.1" fill="#fff"/>`;
    let mouth;
    if (mood === 'sad') mouth = `<path d="M${cx - 6} ${cy + 15} Q${cx} ${cy + 10} ${cx + 6} ${cy + 15}" fill="none" stroke="${K}" stroke-width="2.4" stroke-linecap="round"/>`;
    else if (mood === 'ok') mouth = `<path d="M${cx - 5} ${cy + 13} L${cx + 5} ${cy + 13}" stroke="${K}" stroke-width="2.4" stroke-linecap="round"/>`;
    else mouth = `<path d="M${cx - 6} ${cy + 11} Q${cx} ${cy + 17} ${cx + 6} ${cy + 11}" fill="none" stroke="${K}" stroke-width="2.4" stroke-linecap="round"/>`;
    return eyes + blush + mouth;
  }
  function angryFace(cx, cy) {
    return `<path d="M${cx - 20} ${cy - 9} L${cx - 7} ${cy - 4} M${cx + 20} ${cy - 9} L${cx + 7} ${cy - 4}" stroke="${K}" stroke-width="3" stroke-linecap="round"/>
      <ellipse cx="${cx - 12}" cy="${cy + 2}" rx="5" ry="5.5" fill="#fff" stroke="${K}" stroke-width="2"/><ellipse cx="${cx + 12}" cy="${cy + 2}" rx="5" ry="5.5" fill="#fff" stroke="${K}" stroke-width="2"/>
      <circle cx="${cx - 11}" cy="${cy + 3}" r="2.6" fill="${K}"/><circle cx="${cx + 11}" cy="${cy + 3}" r="2.6" fill="${K}"/>
      <path d="M${cx - 8} ${cy + 16} Q${cx} ${cy + 10} ${cx + 8} ${cy + 16}" fill="none" stroke="${K}" stroke-width="2.6" stroke-linecap="round"/><path d="M${cx - 2} ${cy + 13} l2 4 l2 -4" fill="#fff" stroke="${K}" stroke-width="1.2"/>`;
  }
  function body(shape, c) {
    const s = `fill="${c}" stroke="${K}" stroke-width="3" stroke-linejoin="round"`;
    switch (shape) {
      case 'cup': return `<path d="M30 42 L90 42 L82 106 Q60 113 38 106 Z" ${s}/><rect x="25" y="32" width="70" height="12" rx="6" ${s}/><path d="M66 32 L74 10" stroke="${K}" stroke-width="5" stroke-linecap="round"/>`;
      case 'bottle': return `<rect x="47" y="12" width="26" height="14" rx="4" ${s}/><path d="M50 26 L70 26 Q88 34 88 52 L88 100 Q88 110 78 110 L42 110 Q32 110 32 100 L32 52 Q32 34 50 26Z" ${s}/>`;
      case 'box': return `<rect x="16" y="44" width="88" height="62" rx="14" ${s}/><path d="M16 60 L104 60" stroke="${K}" stroke-width="3"/><rect x="50" y="38" width="20" height="10" rx="4" ${s}/>`;
      case 'bag': return `<path d="M42 40 Q42 14 60 14 Q78 14 78 40" fill="none" stroke="${K}" stroke-width="5"/><path d="M24 40 L96 40 L102 108 L18 108 Z" ${s}/>`;
      case 'straw': return `<rect x="30" y="36" width="60" height="74" rx="24" ${s}/><path d="M56 36 L56 6" stroke="${K}" stroke-width="7" stroke-linecap="round"/><path d="M56 36 L56 8" stroke="#F3A6B8" stroke-width="3" stroke-linecap="round"/>`;
      case 'bao': return `<path d="M14 96 Q14 40 60 34 Q106 40 106 96 Q60 110 14 96Z" ${s}/><path d="M50 40 Q60 30 70 40 M44 46 Q60 38 76 46" fill="none" stroke="${K}" stroke-width="2"/>`;
      case 'can': return `<rect x="28" y="26" width="64" height="84" rx="12" ${s}/><ellipse cx="60" cy="28" rx="32" ry="8" ${s}/><path d="M54 24 q6 -6 12 0" fill="none" stroke="${K}" stroke-width="3"/><path d="M28 46 L92 46 M28 96 L92 96" stroke="${K}" stroke-width="2" opacity=".5"/>`;
      case 'bin': return `<path d="M26 40 L94 40 L86 110 L34 110 Z" ${s}/><rect x="20" y="28" width="80" height="14" rx="6" ${s}/><path d="M52 28 Q60 18 68 28" fill="none" stroke="${K}" stroke-width="4"/><path d="M48 96 l6 -10 l6 10 Z M66 96 l6 -10 l-12 0" fill="#fff" stroke="${K}" stroke-width="1.5" opacity=".9"/>`;
      case 'chop': return `<rect x="30" y="40" width="60" height="70" rx="26" ${s}/><path d="M40 44 L30 4 M80 44 L90 4" stroke="${K}" stroke-width="9" stroke-linecap="round"/><path d="M40 44 L31 8 M80 44 L89 8" stroke="#D9A066" stroke-width="4" stroke-linecap="round"/>`;
      case 'otter': return `<ellipse cx="60" cy="74" rx="44" ry="38" ${s}/><circle cx="26" cy="40" r="10" ${s}/><circle cx="94" cy="40" r="10" ${s}/><ellipse cx="60" cy="84" rx="22" ry="14" fill="#EBD7C2" stroke="${K}" stroke-width="2"/><path d="M38 86 L22 82 M38 90 L22 92 M82 86 L98 82 M82 90 L98 92" stroke="${K}" stroke-width="2" stroke-linecap="round"/>`;
      case 'durian': return `<path d="M60 18 L68 30 L82 24 L84 38 L98 40 L94 54 L106 62 L96 72 L104 86 L90 90 L88 104 L74 102 L64 112 L54 102 L40 106 L36 92 L22 88 L28 74 L16 64 L28 56 L22 42 L36 38 L38 24 L52 28 Z" ${s}/><path d="M56 18 L58 4 L66 6" fill="none" stroke="#6B8E23" stroke-width="5" stroke-linecap="round"/>`;
      case 'coral': return `<path d="M24 110 Q20 70 36 56 Q30 30 44 22 Q52 40 56 36 Q58 12 72 14 Q76 36 82 34 Q96 26 98 46 Q104 70 96 110 Z" ${s}/><circle cx="40" cy="30" r="4" fill="#fff"/><circle cx="90" cy="40" r="3" fill="#fff"/>`;
      case 'tree': return `<path d="M50 112 L54 80 L66 80 L70 112 Z" fill="#8B5E3C" stroke="${K}" stroke-width="3" stroke-linejoin="round"/><circle cx="32" cy="64" r="22" ${s}/><circle cx="88" cy="64" r="22" ${s}/><circle cx="60" cy="52" r="38" ${s}/><path d="M16 64 Q32 50 48 60 M72 60 Q88 50 104 64" fill="none" stroke="${c}" stroke-width="8"/><circle cx="34" cy="34" r="4" fill="#FFF4CF"/><circle cx="88" cy="40" r="3.5" fill="#FFF4CF"/><circle cx="24" cy="76" r="3" fill="#FFF4CF"/><circle cx="96" cy="78" r="3" fill="#FFF4CF"/>`;
      default: return `<path d="M60 22 C96 22 106 52 102 80 C98 106 22 106 18 80 C14 52 24 22 60 22Z" ${s}/>`;
    }
  }
  const FACE_Y = { cup: 70, bottle: 66, box: 80, bag: 74, straw: 70, bao: 74, blob: 64, can: 66, bin: 70, chop: 74, otter: 66, durian: 62, coral: 74, tree: 58 };
  function acc(a) {
    if (a === 'ears') return `<path d="M34 34 L40 16 L50 32 Z M70 32 L80 16 L86 34 Z" fill="#8B5E3C" stroke="${K}" stroke-width="3" stroke-linejoin="round"/>`;
    if (a === 'bubbles') return `<circle cx="22" cy="24" r="8" fill="#fff" stroke="${K}" stroke-width="2"/><circle cx="100" cy="18" r="6" fill="#fff" stroke="${K}" stroke-width="2"/><circle cx="96" cy="36" r="4" fill="#fff" stroke="${K}" stroke-width="2"/>`;
    if (a === 'shades') return `<rect x="36" y="58" width="20" height="12" rx="4" fill="${K}"/><rect x="64" y="58" width="20" height="12" rx="4" fill="${K}"/><path d="M56 63 L64 63" stroke="${K}" stroke-width="3"/>`;
    if (a === 'crown3') return `<path d="M40 26 L46 10 L54 22 L60 6 L66 22 L74 10 L80 26 Z" fill="#F6C945" stroke="${K}" stroke-width="3" stroke-linejoin="round"/>`;
    if (a === 'star') return `<path d="M60 2 L66 16 L81 17 L69 26 L73 40 L60 32 L47 40 L51 26 L39 17 L54 16 Z" fill="#F6C945" stroke="${K}" stroke-width="3" stroke-linejoin="round"/>`;
    if (a === 'cap') return `<rect x="44" y="6" width="32" height="10" rx="4" fill="#2F6FB3" stroke="${K}" stroke-width="3"/>`;
    if (a === 'antenna') return `<path d="M60 38 L60 20" stroke="${K}" stroke-width="3"/><circle cx="60" cy="16" r="6" fill="#F6C945" stroke="${K}" stroke-width="2.5"/>`;
    if (a === 'hat') return `<path d="M34 38 Q60 4 86 38 Z" fill="#8B5E3C" stroke="${K}" stroke-width="3" stroke-linejoin="round"/><path d="M26 38 L94 38" stroke="${K}" stroke-width="4" stroke-linecap="round"/>`;
    if (a === 'pearls') return `<circle cx="44" cy="98" r="5" fill="${K}"/><circle cx="56" cy="102" r="5" fill="${K}"/><circle cx="68" cy="99" r="5" fill="${K}"/><circle cx="78" cy="94" r="4" fill="${K}"/>`;
    if (a === 'coin') return `<circle cx="96" cy="24" r="12" fill="#F6C945" stroke="${K}" stroke-width="3"/><text x="96" y="29" text-anchor="middle" font-size="13" font-weight="800" fill="${K}" font-family="system-ui,sans-serif">10</text>`;
    return '';
  }
  // Evolution extras: stage 1 = leaf sprout + scarf, stage 2 = sparkles + gold halo
  function stageExtras(stage, shape) {
    let out = '';
    if (stage >= 1) {
      const y = shape === 'box' ? 104 : shape === 'bao' ? 100 : 98;
      out += `<path d="M34 ${y} Q60 ${y + 8} 86 ${y}" fill="none" stroke="#B23A5B" stroke-width="6" stroke-linecap="round"/><path d="M80 ${y + 1} l8 12" stroke="#B23A5B" stroke-width="5" stroke-linecap="round"/>`;
    }
    if (stage >= 2) {
      out += `<path d="M12 40 l3 -8 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 Z M100 54 l2 -6 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2 Z" fill="#F6C945" stroke="${K}" stroke-width="1.5"/>`;
    }
    return out;
  }
  function sprout(stage, shape) {
    if (stage < 1 || shape === 'bottle' || shape === 'straw') return '';
    if (['chop', 'durian', 'coral', 'tree'].includes(shape)) return '';
    const top = { cup: 32, box: 38, bag: 14, bao: 34, blob: 22, can: 20, bin: 28, otter: 36 }[shape] || 22, x = shape === 'cup' ? 46 : shape === 'bin' ? 40 : 60;
    return `<path d="M${x} ${top} q0 -10 0 -12" stroke="${K}" stroke-width="3" stroke-linecap="round"/><path d="M${x} ${top - 10} q-12 -6 -14 4 q10 4 14 -4 Z M${x} ${top - 10} q12 -8 15 2 q-10 5 -15 -2 Z" fill="#7BC67E" stroke="${K}" stroke-width="2"/>`;
  }
  function svgWrap(inner, size, label, cls, vb) {
    return `<svg xmlns="http://www.w3.org/2000/svg" class="sk${cls ? ' ' + cls : ''}" width="${size}" height="${size}" viewBox="${vb || '0 0 120 120'}" role="img" aria-label="${label}">${inner}</svg>`;
  }
  // Skippy (friendly reusable creature)
  function skippy(sp, o) {
    o = o || {}; const size = o.size || 96, locked = !!o.locked, stage = o.stage || 0, mood = o.mood || 'happy';
    const col = locked ? '#D9D2C2' : sp.color;
    let inner = '';
    if (o.frame && !locked) inner += `<circle cx="60" cy="62" r="62" fill="${o.frame}" opacity=".18"/>`;
    if (stage >= 2 && !locked) inner += `<circle cx="60" cy="64" r="56" fill="#FFF4CF" stroke="#F6C945" stroke-width="3"/>`;
    if (sp.shape === 'twins') {
      const one = (dx, cc) => `<g transform="translate(${dx} 18) scale(.62)">${body('blob', cc)}${locked ? '' : face(60, 68, mood)}</g>`;
      inner += one(-4, col) + one(42, locked ? col : '#F6C945');
    } else {
      inner += body(sp.shape, col);
      if (!locked) {
        if (sp.acc !== 'shades') inner += acc(sp.acc);
        inner += face(60, FACE_Y[sp.shape] || 66, mood);
        if (sp.acc === 'shades' && mood !== 'sleepy') inner += acc('shades');
      }
    }
    if (!locked) inner += sprout(stage, sp.shape) + stageExtras(stage, sp.shape);
    if (locked) inner += `<text x="60" y="82" text-anchor="middle" font-size="38" font-weight="800" fill="#6B776F" font-family="system-ui,sans-serif">?</text>`;
    const label = locked ? 'Locked Skippy' : (sp.stages ? sp.stages[stage] : sp.name);
    return svgWrap(inner, size, label, o.bob && !locked ? 'bob' : '', '-6 -6 132 132');
  }
  // Litterbug (grumpy single-use plastic monster)
  const LCOL = { drink: '#E8E4DA', water: '#D6E6EE', food: '#F2EFE8', carry: '#E3E8E3', cutlery: '#EBDDE1' };
  function litter(L, o) {
    o = o || {}; const size = o.size || 96, type = o.type || L.type;
    const col = L.shift ? '#8E9A93' : (LCOL[type] || '#DDD');
    let inner = '';
    if (L.boss) inner += `<path d="M10 60 L2 50 L14 48 L8 36 L22 40 L22 26 L34 34 L40 20 L48 32 L60 16 L72 32 L80 20 L86 34 L98 26 L98 40 L112 36 L106 48 L118 50 L110 60" fill="#B23A5B" stroke="${K}" stroke-width="2.5" stroke-linejoin="round"/>`;
    inner += body(L.shape, col);
    // grime + stink lines
    inner += `<circle cx="40" cy="96" r="4" fill="#B8B09A" opacity=".8"/><circle cx="78" cy="90" r="3" fill="#B8B09A" opacity=".8"/>`;
    inner += `<path d="M14 30 q-6 -8 0 -14 q6 -6 0 -12 M106 30 q6 -8 0 -14 q-6 -6 0 -12" fill="none" stroke="#7A8F5A" stroke-width="2.5" stroke-linecap="round"/>`;
    if (L.shift) inner += `<rect x="30" y="34" width="14" height="10" fill="#F6C945" stroke="${K}" stroke-width="1.5" transform="rotate(-12 37 39)"/><rect x="78" y="40" width="12" height="12" fill="#9CCBE8" stroke="${K}" stroke-width="1.5" transform="rotate(10 84 46)"/><rect x="70" y="96" width="14" height="8" fill="#F4A259" stroke="${K}" stroke-width="1.5"/>`;
    inner += angryFace(60, FACE_Y[L.shape] || 66);
    return svgWrap(inner, size, L.name, o.cls || '', '-6 -6 132 132');
  }
  function egg(size, opts) {
    opts = opts || {};
    return `<svg xmlns="http://www.w3.org/2000/svg" class="egg${opts.cls ? ' ' + opts.cls : ''}" width="${size}" height="${Math.round(size * 1.25)}" viewBox="0 0 150 190" role="img" aria-label="${opts.label || 'Egg'}"><ellipse cx="75" cy="100" rx="62" ry="82" fill="${opts.fill || '#FBF6EC'}" stroke="#F6C945" stroke-width="5"/>${opts.cracked ? '<path d="M20 95 L40 80 L55 98 L75 78 L95 98 L110 80 L130 95" fill="none" stroke="#1F2A24" stroke-width="4"/>' : '<circle cx="55" cy="80" r="9" fill="#F6C945"/><circle cx="92" cy="120" r="12" fill="#9CCBE8"/><circle cx="70" cy="140" r="7" fill="#F4A259"/>'}</svg>`;
  }
  root.Art = { skippy, litter, egg };
})(typeof window !== 'undefined' ? window : globalThis);
