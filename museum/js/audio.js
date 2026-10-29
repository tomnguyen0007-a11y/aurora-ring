// A calm piano piece, written as code. Every note is synthesized (no recordings,
// so nothing to license). Four slow chords repeat, with a low bass, a soft pad,
// and a sparse right-hand melody that wanders over a pentatonic scale. The
// random choices use a fixed seed, so the same piece plays every time.
const BPM = 52;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const VOLUME = 0.85;
const SEED = 20261028;

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Cmaj7, Am7, Fmaj7, G6, as MIDI note numbers.
const PROGRESSION = [
  { bass: [36, 43], chord: [60, 64, 67, 71] },
  { bass: [33, 40], chord: [57, 60, 64, 67] },
  { bass: [29, 36], chord: [53, 57, 60, 64] },
  { bass: [31, 38], chord: [55, 59, 62, 64] },
];

// C major pentatonic between E4 and C6, the melody's range.
const MELODY = [];
for (let m = 64; m <= 84; m++) if ([0, 2, 4, 7, 9].includes(m % 12)) MELODY.push(m);

function makeImpulse(ctx, seconds, rand) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] = (rand() * 2 - 1) * Math.pow(1 - i / length, 2.6);
  }
  return buffer;
}

// Builds the signal chain and returns where notes connect and the master gain.
function buildGraph(ctx) {
  const rand = mulberry32(SEED + 1);
  const master = ctx.createGain();
  master.gain.value = VOLUME;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -20;
  compressor.ratio.value = 3;
  master.connect(compressor);
  compressor.connect(ctx.destination);

  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 4800;
  const dry = ctx.createGain();
  dry.gain.value = 0.8;
  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse(ctx, 4.5, rand);
  const wet = ctx.createGain();
  wet.gain.value = 0.5;
  tone.connect(dry);
  tone.connect(reverb);
  reverb.connect(wet);
  dry.connect(master);
  wet.connect(master);

  const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.04), ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = rand() * 2 - 1;

  return { input: tone, master, noise };
}

// One piano-like note: a few decaying partials plus a soft hammer thump.
function pianoNote(ctx, graph, out, freq, when, velocity, hold) {
  const note = ctx.createGain();
  note.gain.setValueAtTime(0.0001, when);
  note.gain.exponentialRampToValueAtTime(velocity, when + 0.012);
  note.gain.exponentialRampToValueAtTime(0.0001, when + hold);
  note.connect(out);
  [[1, 1, 1], [2, 0.42, 0.7], [3, 0.2, 0.5], [4, 0.11, 0.35], [6, 0.05, 0.25]].forEach(([mult, amp, decay]) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * mult * (1 + 0.0003 * mult);
    const partial = ctx.createGain();
    partial.gain.setValueAtTime(amp, when);
    partial.gain.exponentialRampToValueAtTime(0.001, when + hold * decay);
    osc.connect(partial);
    partial.connect(note);
    osc.start(when);
    osc.stop(when + hold + 0.1);
  });
  const thump = ctx.createBufferSource();
  thump.buffer = graph.noise;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1400;
  const thumpGain = ctx.createGain();
  thumpGain.gain.setValueAtTime(velocity * 0.35, when);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
  thump.connect(band);
  band.connect(thumpGain);
  thumpGain.connect(out);
  thump.start(when);
}

// A slow pad under each chord, so the harmony never drops out.
function padChord(ctx, out, chord, when) {
  chord.slice(0, 3).forEach((m) => {
    [0, 1].forEach((voice) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = mtof(m - 12) * (voice ? 1.003 : 0.997);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(0.022, when + 1.6);
      g.gain.linearRampToValueAtTime(0.0001, when + BAR + 1.2);
      osc.connect(g);
      g.connect(out);
      osc.start(when);
      osc.stop(when + BAR + 1.3);
    });
  });
}

function scheduleBar(ctx, graph, rand, state, when) {
  const bar = PROGRESSION[state.bar % PROGRESSION.length];
  const out = graph.input;
  pianoNote(ctx, graph, out, mtof(bar.bass[0]), when, 0.34, BAR * 0.95);
  pianoNote(ctx, graph, out, mtof(bar.bass[1]), when + BEAT * 2, 0.2, BEAT * 3);
  padChord(ctx, out, bar.chord, when);

  const chordClasses = bar.chord.map((m) => m % 12);
  for (let i = 0; i < 8; i++) {
    const strong = i % 2 === 0;
    if (strong ? i > 0 && rand() < 0.15 : rand() < 0.4) continue;
    const moves = [-2, -1, -1, 0, 1, 1, 2];
    state.pos = Math.min(MELODY.length - 1, Math.max(0, state.pos + moves[Math.floor(rand() * moves.length)]));
    let pitch = MELODY[state.pos];
    // On strong beats, lean toward a note that belongs to the chord.
    if (strong && !chordClasses.includes(pitch % 12) && rand() < 0.5) {
      const near = MELODY.filter((m) => chordClasses.includes(m % 12)).sort((a, b) => Math.abs(a - pitch) - Math.abs(b - pitch))[0];
      if (near !== undefined) {
        pitch = near;
        state.pos = MELODY.indexOf(near);
      }
    }
    const at = when + i * (BEAT / 2) + (rand() - 0.5) * 0.02;
    pianoNote(ctx, graph, out, mtof(pitch), at, 0.1 + rand() * 0.09, 3.4 + rand() * 1.6);
    if (i === 0 && rand() < 0.25) pianoNote(ctx, graph, out, mtof(pitch - 5), at, 0.07, 3.0);
  }
  state.bar++;
}

// Realtime player with fade in and out.
export function createAmbient() {
  let ctx = null;
  let graph = null;
  let rand = null;
  let state = null;
  let nextBar = 0;
  let timer = null;

  function pump() {
    while (nextBar < ctx.currentTime + 2.5) {
      scheduleBar(ctx, graph, rand, state, nextBar);
      nextBar += BAR;
    }
  }

  return {
    async on() {
      if (!ctx) {
        ctx = new AudioContext();
        graph = buildGraph(ctx);
        rand = mulberry32(SEED);
        state = { bar: 0, pos: 6 };
      }
      await ctx.resume();
      nextBar = Math.max(nextBar, ctx.currentTime + 0.3);
      graph.master.gain.cancelScheduledValues(ctx.currentTime);
      graph.master.gain.setValueAtTime(0.0001, ctx.currentTime);
      graph.master.gain.linearRampToValueAtTime(VOLUME, ctx.currentTime + 3);
      pump();
      if (!timer) timer = setInterval(pump, 500);
    },
    off() {
      if (!ctx) return;
      graph.master.gain.cancelScheduledValues(ctx.currentTime);
      graph.master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.35);
      clearInterval(timer);
      timer = null;
      setTimeout(() => ctx.suspend(), 1500);
    },
  };
}

// Renders the piece offline, for tests and for exporting a listening sample.
export async function renderOffline(seconds, sampleRate = 44100) {
  const ctx = new OfflineAudioContext(2, Math.floor(seconds * sampleRate), sampleRate);
  const graph = buildGraph(ctx);
  const rand = mulberry32(SEED);
  const state = { bar: 0, pos: 6 };
  for (let t = 0.2; t < seconds; t += BAR) scheduleBar(ctx, graph, rand, state, t);
  return ctx.startRendering();
}
