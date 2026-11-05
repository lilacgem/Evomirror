import data from './audioInfluence.json';
const { frames, ...provenance } = data;
export const audioInfluenceProvenance = provenance;
// Binary search/interpolation retains the measured chronology, not a fabricated BPM grid.
function at(t) {
 if (t <= frames[0][0]) return frames[0].slice(1);
 if (t >= frames.at(-1)[0]) return frames.at(-1).slice(1);
 let lo = 0, hi = frames.length - 1;
 while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (frames[mid][0] <= t) lo = mid; else hi = mid; }
 const blend = (t - frames[lo][0]) / (frames[hi][0] - frames[lo][0]);
 return frames[lo].slice(1).map((value,i) => value + (frames[hi][i+1] - value) * blend);
}
export function sampleAudioInfluence(seconds) {
 const duration = data.source.durationSeconds;
 const blendSeconds = Math.min(data.mapping.loopBlendSeconds, duration / 4);
 const cycle = duration - blendSeconds;
 const t = ((seconds % cycle) + cycle) % cycle;
 let values = at(t);
 if (t < blendSeconds) {
  const tail = at(cycle + t), weight = t / blendSeconds;
  const smooth = weight * weight * (3 - 2 * weight);
  values = values.map((value,i) => tail[i] + (value - tail[i]) * smooth);
 }
 const [energy, brightness, bass, mid, high, change] = values;
 return { positionSeconds: t, loopSeconds: cycle, energy, brightness, bass, mid, high, change };
}
