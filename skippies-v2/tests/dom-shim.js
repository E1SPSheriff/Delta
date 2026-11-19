// Minimal DOM shim (no deps) for UI flow tests
// ---------- tiny HTML parser ----------
const VOID = new Set(['input', 'br', 'img', 'meta', 'link', 'hr']);
function decode(s) { return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'); }
class Node_ {
  constructor(tag) { this.tagName = (tag || '').toUpperCase(); this.attrs = {}; this.children = []; this.parent = null; this._text = ''; this.style = {}; this.dataset = {}; this.onclick = null; this.value = ''; this.disabled = false; this.checked = false;
    const self = this; this.classList = { add(c) { self.setAttribute('class', (self.getAttribute('class') || '') + ' ' + c); }, remove(c) { self.setAttribute('class', (self.getAttribute('class') || '').split(/\s+/).filter(x => x !== c).join(' ')); }, toggle(c, f) { f ? this.add(c) : this.remove(c); }, contains(c) { return (self.getAttribute('class') || '').split(/\s+/).includes(c); } }; }
  setAttribute(k, v) { v = String(v); this.attrs[k] = v; if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = v; if (k === 'disabled') this.disabled = true; if (k === 'value') this.value = v; if (k === 'checked') this.checked = true; }
  getAttribute(k) { if (k === 'disabled') return this.disabled ? '' : null; return k in this.attrs ? this.attrs[k] : null; }
  hasAttribute(k) { if (k === 'disabled') return this.disabled; return k in this.attrs; }
  removeAttribute(k) { delete this.attrs[k]; }
  get id() { return this.attrs.id; }
  get className() { return this.attrs.class || ''; } set className(v) { this.attrs.class = v; }
  appendChild(n) { n.parent = this; this.children.push(n); return n; }
  append(...ns) { ns.forEach(n => this.appendChild(n)); }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null; } }
  get textContent() { return this.tagName === '#TEXT' ? this._text : this.children.map(c => c.textContent).join(''); }
  set textContent(v) { this.children = []; const t = new Node_('#text'); t._text = String(v); this.appendChild(t); }
  set innerHTML(h) { this.children = []; parseInto(this, h); }
  get innerHTML() { return this.textContent; }
  focus() { global.document.activeElement = this; }
  click() { if (this.disabled) return; if (this.onclick) this.onclick({ stopPropagation() { }, preventDefault() { } }); }
  setAttributeNS() { }
  querySelectorAll(sel) { const out = []; const sels = sel.split(',').map(s => s.trim()); walk(this, n => { if (n !== this && sels.some(s => match(n, s))) out.push(n); }); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  getContext() { return null; }
  toBlob(cb) { cb(null); }
}
function walk(n, f) { for (const c of n.children) { if (c.tagName !== '#TEXT') { f(c); walk(c, f); } } }
function match(n, s) {
  // supports: tag, #id, .class, [attr], [attr=val], [attr="val"], combos like button:not([disabled]), .scene .res (descendant)
  if (s.includes(' ')) { const parts = s.split(/\s+/); if (!match(n, parts[parts.length - 1])) return false; let p = n.parent; const rest = parts.slice(0, -1).join(' '); while (p) { if (p.tagName && match(p, rest)) return true; p = p.parent; } return false; }
  let notDisabled = false; if (s.includes(':not([disabled])')) { notDisabled = true; s = s.replace(':not([disabled])', ''); }
  if (notDisabled && n.disabled) return false;
  const re = /([a-zA-Z0-9]+)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:=["']?([^"'\]]+)["']?)?\]/g; let m;
  while ((m = re.exec(s))) {
    if (m[1] && m.index === 0) { if (n.tagName !== m[1].toUpperCase()) return false; }
    else if (m[2]) { if (n.attrs.id !== m[2]) return false; }
    else if (m[3]) { if (!(n.attrs.class || '').split(/\s+/).includes(m[3])) return false; }
    else if (m[4]) { if (m[4] === 'disabled') { if (!n.disabled) return false; } else { if (!(m[4] in n.attrs)) return false; if (m[5] !== undefined && n.attrs[m[4]] !== m[5]) return false; } }
  }
  return true;
}
function parseInto(root, h) {
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9]+)\s*>|<([a-zA-Z0-9]+)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>|([^<]+)/g;
  let cur = root, m;
  while ((m = re.exec(h))) {
    if (m[0].startsWith('<!--')) continue;
    if (m[1]) { let p = cur; while (p && p !== root && p.tagName !== m[1].toUpperCase()) p = p.parent; if (p && p !== root) cur = p.parent; continue; }
    if (m[2]) { const n = new Node_(m[2]); const ar = /([^\s=>\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g; let a; while ((a = ar.exec(m[3] || ''))) { n.setAttribute(a[1], decode(a[2] ?? a[3] ?? a[4] ?? '')); } cur.appendChild(n); if (!VOID.has(m[2].toLowerCase()) && !m[0].endsWith('/>')) cur = n; continue; }
    if (m[4]) { const t = new Node_('#text'); t._text = decode(m[4]); cur.appendChild(t); }
  }
}

module.exports = { Node_, walk, match, parseInto };
