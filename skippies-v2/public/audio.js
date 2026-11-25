(function (root) {
  'use strict';
  const SK = root.SK = root.SK || {};
  const KEY = 'skippies2.muted';
  let ctx = null;
  let muted = false;
  try { muted = root.localStorage.getItem(KEY) === '1'; } catch (e) { }
  const SOUNDS = {
    tap: [660], hatch: [523, 659, 784], rare: [523, 659, 784, 1047], win: [392, 523, 659, 784],
    lose: [330, 262], reward: [659, 784, 988], error: [220, 185]
  };
  function ensure() {
    if (muted) return null;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) { try { ctx = new AC(); } catch (e) { return null; } }
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(() => { });
    return ctx;
  }
  SK.audio = {
    muted: () => muted,
    setMuted: v => { muted = !!v; try { root.localStorage.setItem(KEY, muted ? '1' : '0'); } catch (e) { } return muted; },
    toggle: () => SK.audio.setMuted(!muted),
    play(name) {
      const c = ensure(), notes = SOUNDS[name] || SOUNDS.tap;
      if (!c || !notes) return;
      notes.forEach((hz, i) => {
        const osc = c.createOscillator(), gain = c.createGain(), at = c.currentTime + i * 0.07;
        osc.type = name === 'error' || name === 'lose' ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(hz, at);
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.045, at + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
        osc.connect(gain); gain.connect(c.destination); osc.start(at); osc.stop(at + 0.16);
      });
    }
  };
  if (root.addEventListener) root.addEventListener('pointerdown', () => { ensure(); }, { once: true });
})(typeof window !== 'undefined' ? window : globalThis);
