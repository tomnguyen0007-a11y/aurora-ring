// Generative ambient bed, built with Web Audio so there are no audio files to license.
// Four slow voices move through a small chord cycle, passed through a low-pass
// filter with a slow breathing cutoff and a generated room reverb.
const CHORDS = [
  [110.0, 164.81, 220.0, 261.63],
  [98.0, 146.83, 196.0, 293.66],
  [130.81, 196.0, 261.63, 329.63],
  [146.83, 220.0, 293.66, 329.63],
];
const CHORD_MS = 9000;
const VOLUME = 0.5;

function makeImpulse(ctx, seconds = 4) {
  const length = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
    }
  }
  return buffer;
}

export function createAmbient() {
  let ctx = null;
  let master = null;
  let voices = [];
  let chordIndex = 0;
  let timer = null;

  function build() {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;
    filter.Q.value = 0.4;

    const reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.35;

    filter.connect(master);
    filter.connect(reverb);
    reverb.connect(wet);
    wet.connect(master);

    voices = CHORDS[0].map((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = i % 2 ? 'triangle' : 'sine';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.value = 0.05;
      osc.connect(gain);
      gain.connect(filter);
      osc.start();
      return { osc, gain };
    });

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 500;
    lfo.connect(lfoDepth);
    lfoDepth.connect(filter.frequency);
    lfo.start();
  }

  function setChord(index) {
    const now = ctx.currentTime;
    voices.forEach((v, i) => {
      v.osc.frequency.setTargetAtTime(CHORDS[index][i], now, 1.2);
    });
  }

  return {
    async on() {
      if (!ctx) build();
      await ctx.resume();
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(VOLUME, ctx.currentTime, 1.5);
      if (!timer) {
        timer = setInterval(() => {
          chordIndex = (chordIndex + 1) % CHORDS.length;
          setChord(chordIndex);
        }, CHORD_MS);
      }
    },
    off() {
      if (!ctx) return;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
      clearInterval(timer);
      timer = null;
      setTimeout(() => ctx.suspend(), 1500);
    },
  };
}
