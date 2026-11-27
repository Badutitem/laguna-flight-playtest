// Procedural sound: every noise is synthesized with WebAudio, so the game
// ships no audio files and makes no network request for sound.
//   - Engine drone follows throttle, wind hiss follows speed.
//   - Ambient music: a slow generative pad + soft plucks, a different mood
//     per time of day (day bright, dusk warm, night calm).
//   - Cockpit: gear thunk, flaps click, stall beeper, fuel-low warble,
//     ring chime, touchdown thud. Mute (M) silences everything; levels are
//     balanced so no layer drowns the others.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let windGain = null;
  let windFilter = null;
  let musicGain = null;
  let musicTimer = null;
  let padOscs = [];
  let muted = false;
  let stallTimer = null;
  let fuelTimer = null;
  let mood = 'day';
  let pluckStep = 0;

  // Chord tones (Hz) + pentatonic pluck scale per mood.
  const MOODS = {
    day: {
      chords: [
        [261.63, 329.63, 392.0, 493.88], // Cmaj7
        [220.0, 261.63, 329.63, 392.0], // Am7
        [174.61, 220.0, 261.63, 329.63], // Fmaj7
        [196.0, 246.94, 293.66, 392.0], // G6
      ],
      scale: [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5],
      gain: 0.045, pluckEvery: 3,
    },
    dusk: {
      chords: [
        [293.66, 369.99, 440.0, 554.37], // Dmaj7
        [246.94, 293.66, 369.99, 440.0], // Bm7
        [196.0, 246.94, 293.66, 369.99], // Gmaj7
        [220.0, 277.18, 329.63, 440.0], // A6
      ],
      scale: [587.33, 659.25, 739.99, 880.0, 987.77, 1174.66],
      gain: 0.05, pluckEvery: 3,
    },
    night: {
      chords: [
        [220.0, 261.63, 329.63, 415.3], // Am9
        [174.61, 220.0, 261.63, 329.63], // Fmaj7
        [130.81, 196.0, 261.63, 329.63], // Cmaj7 low
        [164.81, 196.0, 246.94, 329.63], // Em7
      ],
      scale: [440.0, 523.25, 587.33, 659.25, 783.99, 880.0],
      gain: 0.04, pluckEvery: 4,
    },
  };

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      // Engine: two detuned oscillators through a lowpass.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 900;
      engineOsc.connect(engineGain);
      engineOsc2.connect(engineGain);
      engineGain.connect(lowpass);
      lowpass.connect(master);
      engineOsc.start();
      engineOsc2.start();
      // Wind: looped noise through a bandpass.
      const noiseLen = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < noiseLen; i += 1) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 500;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      noise.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      noise.start();
      // Music bus.
      musicGain = ctx.createGain();
      musicGain.gain.value = 0;
      musicGain.connect(master);
      startMusic();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function tone(freq, dur, type, gainValue, when = 0, dest) {
    if (!ctx || muted) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + when);
      gain.gain.linearRampToValueAtTime(gainValue, ctx.currentTime + when + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + dur);
      osc.connect(gain);
      gain.connect(dest || master);
      osc.start(ctx.currentTime + when);
      osc.stop(ctx.currentTime + when + dur + 0.05);
    } catch { /* sound is decoration, never fatal */ }
  }

  function noiseBurst(dur, gainValue, freq, when = 0) {
    if (!ctx || muted) return;
    try {
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.value = gainValue;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(ctx.currentTime + when);
    } catch { /* ignore */ }
  }

  // Generative ambient music: a slow pad chord that changes every 8 s, plus
  // a soft plucked note wandering the mood's pentatonic scale.
  function startMusic() {
    if (!ctx || musicTimer !== null) return;
    let chordIndex = 0;
    const playChord = () => {
      if (!ctx) return;
      const m = MOODS[mood] || MOODS.day;
      // Fade the old pad out, then start the new chord.
      for (const osc of padOscs) {
        try {
          osc.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.8);
          osc.osc.stop(ctx.currentTime + 2.5);
        } catch { /* ignore */ }
      }
      padOscs = [];
      const chord = m.chords[chordIndex % m.chords.length];
      chordIndex += 1;
      musicGain.gain.setTargetAtTime(m.gain, ctx.currentTime, 1.5);
      for (const freq of chord) {
        try {
          const osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.value = freq;
          osc.detune.value = (Math.random() - 0.5) * 6;
          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0.24, ctx.currentTime + 2.5);
          osc.connect(gain);
          gain.connect(musicGain);
          osc.start();
          padOscs.push({ osc, gain });
        } catch { /* ignore */ }
      }
    };
    const pluck = () => {
      if (!ctx || muted) return;
      const m = MOODS[mood] || MOODS.day;
      pluckStep += 1;
      if (pluckStep % m.pluckEvery !== 0) return;
      const scale = m.scale;
      const idx = Math.max(0, Math.min(scale.length - 1,
        ((Math.random() * 3) | 0) + ((pluckStep / m.pluckEvery) | 0) % 3));
      tone(scale[idx], 1.6, 'sine', 0.05, 0, musicGain);
      tone(scale[idx] * 2, 0.9, 'sine', 0.02, 0, musicGain);
    };
    playChord();
    musicTimer = window.setInterval(() => { playChord(); pluck(); }, 4000);
  }

  function stopMusic() {
    if (musicTimer !== null) {
      window.clearInterval(musicTimer);
      musicTimer = null;
    }
    for (const osc of padOscs) {
      try { osc.osc.stop(); } catch { /* ignore */ }
    }
    padOscs = [];
  }

  return {
    unlock() { ensure(); },
    setMuted(value) {
      muted = value;
      if (engineGain) engineGain.gain.value = 0;
      if (windGain) windGain.gain.value = 0;
      if (musicGain) musicGain.gain.value = value ? 0 : (MOODS[mood] || MOODS.day).gain;
      if (value) {
        if (stallTimer !== null) { window.clearInterval(stallTimer); stallTimer = null; }
        if (fuelTimer !== null) { window.clearInterval(fuelTimer); fuelTimer = null; }
      }
    },
    isMuted() { return muted; },
    setTimeOfDay(tod) {
      mood = MOODS[tod] ? tod : 'day';
      if (musicGain && !muted) {
        musicGain.gain.setTargetAtTime((MOODS[mood] || MOODS.day).gain, ctx.currentTime, 1.5);
      }
    },
    getTimeOfDay() { return mood; },
    update(rpm01, speed01, airborne) {
      if (!ctx || muted) return;
      try {
        const t = ctx.currentTime;
        engineOsc.frequency.setTargetAtTime(55 + rpm01 * 95, t, 0.1);
        engineOsc2.frequency.setTargetAtTime(28 + rpm01 * 48, t, 0.1);
        engineGain.gain.setTargetAtTime(airborne ? 0.05 + rpm01 * 0.06 : 0.02 + rpm01 * 0.05, t, 0.1);
        windFilter.frequency.setTargetAtTime(300 + speed01 * 900, t, 0.15);
        windGain.gain.setTargetAtTime(airborne ? speed01 * speed01 * 0.12 : 0, t, 0.15);
      } catch { /* ignore */ }
    },
    ring(center) {
      tone(880, 0.35, 'sine', 0.16);
      tone(1318, 0.5, 'sine', 0.12, 0.08);
      if (center) tone(1760, 0.4, 'sine', 0.1, 0.16);
    },
    touchdown() {
      tone(90, 0.25, 'sine', 0.3);
      tone(60, 0.3, 'triangle', 0.2, 0.02);
      noiseBurst(0.18, 0.22, 500); // tyre chirp on the runway
    },
    click() { tone(660, 0.08, 'sine', 0.1); },
    gear() {
      tone(170, 0.16, 'triangle', 0.22);
      noiseBurst(0.12, 0.18, 350, 0.02); // hydraulic thunk
      tone(120, 0.12, 'sine', 0.14, 0.1);
    },
    flaps() {
      tone(520, 0.07, 'sine', 0.1);
      tone(390, 0.09, 'sine', 0.09, 0.07);
    },
    stall(on) {
      if (!ctx || muted) return;
      if (on && stallTimer === null) {
        stallTimer = window.setInterval(() => tone(440, 0.18, 'square', 0.05), 450);
      } else if (!on && stallTimer !== null) {
        window.clearInterval(stallTimer);
        stallTimer = null;
      }
    },
    fuelLow(on) {
      if (!ctx || muted) return;
      if (on && fuelTimer === null) {
        fuelTimer = window.setInterval(() => {
          tone(740, 0.12, 'square', 0.045);
          tone(587, 0.12, 'square', 0.045, 0.16);
        }, 900);
      } else if (!on && fuelTimer !== null) {
        window.clearInterval(fuelTimer);
        fuelTimer = null;
      }
    },
    gun() {
      noiseBurst(0.09, 0.16, 1800);
      tone(180, 0.07, 'square', 0.08);
    },
    missile() {
      tone(300, 0.5, 'sawtooth', 0.1);
      tone(600, 0.4, 'sawtooth', 0.08, 0.1);
      noiseBurst(0.4, 0.14, 900, 0.05);
    },
    explosion() {
      noiseBurst(0.5, 0.3, 400);
      tone(70, 0.4, 'sine', 0.25);
    },
    missileLock() {
      tone(980, 0.12, 'square', 0.06);
      tone(980, 0.12, 'square', 0.06, 0.18);
    },
    // Debug hook for the headless play-test: no DOM dependency.
    debug() {
      return {
        hasCtx: !!ctx,
        state: ctx ? ctx.state : 'none',
        muted,
        mood,
        musicOn: musicTimer !== null,
        padVoices: padOscs.length,
      };
    },
  };
}
