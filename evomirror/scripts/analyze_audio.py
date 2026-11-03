"""Read-only, local WAV inspection and reproducible spectral analysis."""
import argparse
import hashlib
import html
import json
import math
from pathlib import Path
import platform
import shutil
import tempfile

import numpy as np
import scipy
from scipy.signal import correlate, find_peaks
import soundfile as sf

BANDS = [("subBass", 20, 60), ("bass", 60, 250), ("lowMid", 250, 500),
         ("mid", 500, 2000), ("upperMid", 2000, 4000), ("presence", 4000, 6000),
         ("high", 6000, 20000)]


def sha256(path):
    hasher = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            hasher.update(block)
    return hasher.hexdigest()


def db(value):
    return None if value <= 0 else float(20 * np.log10(value))


def pulse_estimate(envelope, rate):
    """Experimental global pulse estimate; not validated beat tracking."""
    onset = np.asarray(envelope, dtype=float)
    if len(onset) < rate * 4 or np.max(onset, initial=0) <= 1e-12:
        return {'status': 'unavailable', 'tempoBpm': None, 'estimatedBeatsSeconds': [], 'onsetCandidatesSeconds': []}
    peaks, _ = find_peaks(onset, distance=max(1, int(.08 * rate)), prominence=max(1e-12, float(onset.std() * .5)))
    centered = onset - onset.mean()
    correlation = correlate(centered, centered, mode='full', method='fft')[len(onset) - 1:]
    lo, hi = max(1, int(rate * 60 / 200)), min(len(onset) - 1, int(rate * 60 / 60))
    if hi <= lo or len(peaks) < 3:
        return {'status': 'unavailable', 'tempoBpm': None, 'estimatedBeatsSeconds': [], 'onsetCandidatesSeconds': (peaks / rate).tolist()}
    lag = int(np.argmax(correlation[lo:hi + 1]) + lo)
    if correlation[lag] <= 0:
        return {'status': 'unavailable', 'tempoBpm': None, 'estimatedBeatsSeconds': [], 'onsetCandidatesSeconds': (peaks / rate).tolist()}
    phases = range(lag)
    phase = max(phases, key=lambda offset: float(onset[offset::lag].sum()))
    return {'status': 'experimental-estimate', 'tempoBpm': float(60 * rate / lag),
            'estimatedBeatsSeconds': (np.arange(phase, len(onset), lag) / rate).tolist(),
            'onsetCandidatesSeconds': (peaks / rate).tolist()}


def inspect_audio(path, *, fft_size=2048, hop_size=512, silence_db=-60):
    path = Path(path)
    if fft_size < 256 or fft_size > 32768 or fft_size & (fft_size - 1) or not 0 < hop_size <= fft_size:
        raise ValueError('FFT size must be a power of two from 256 to 32768; hop must be 1..FFT size.')
    if not math.isfinite(silence_db) or silence_db >= 0:
        raise ValueError('Silence threshold must be a finite negative dBFS value.')
    original_hash = sha256(path)
    info = sf.info(path)
    if info.format not in ('WAV', 'WAVEX', 'RF64'):
        raise ValueError('This first tool accepts WAV audio only; it does not silently convert other media.')
    if info.channels > 64:
        raise ValueError('This prototype supports up to 64 channels.')
    if info.frames < 1 or info.channels < 1:
        raise ValueError('Audio file has no samples.')
    sample_rate, channels = info.samplerate, info.channels
    frequencies = np.fft.rfftfreq(fft_size, 1 / sample_rate)
    window = np.hanning(fft_size)
    scale = sample_rate * float(np.sum(window ** 2))
    sum_power = np.zeros(len(frequencies))
    channel_sum = np.zeros(channels); channel_square = np.zeros(channels); channel_peak = np.zeros(channels)
    near_full = np.zeros(channels, dtype=np.int64)
    bits = {'PCM_U8': 8, 'PCM_16': 16, 'PCM_24': 24, 'PCM_32': 32, 'FLOAT': 32, 'DOUBLE': 64}.get(info.subtype)
    threshold = 1 - 2 ** (1 - bits) if info.subtype.startswith('PCM') and bits else 1.0
    frame_count = 0; silent_count = 0; previous_magnitude = np.zeros(len(frequencies))
    stride = max(1, math.ceil(max(1, (info.frames - fft_size) // hop_size + 1) / 2000))
    timeline = []; spectra = []; flux_chunks = []; envelope = []
    pending = np.empty((0, channels)); read_frames = 0; frame_start = 0

    def process(batch):
        nonlocal frame_count, silent_count, previous_magnitude
        frames = np.lib.stride_tricks.sliding_window_view(batch, fft_size, axis=0)[::hop_size][:max(1, 1000000 // (fft_size * channels))]
        # frame/channel/bin: average channel power, never mix opposite-phase channels to mono.
        centered = frames - frames.mean(axis=-1, keepdims=True)
        transformed = np.fft.rfft(centered * window, axis=-1)
        power = (np.abs(transformed) ** 2).mean(axis=1) / scale
        power[:, 1:-1] *= 2
        sum_power[:] += power.sum(axis=0)
        rms = np.sqrt(np.mean(frames ** 2, axis=(1, 2)))
        silent_count += int(np.sum(rms < 10 ** (silence_db / 20)))
        total = power.sum(axis=1)
        safe = np.maximum(total, np.finfo(float).tiny)
        centroids = (power * frequencies).sum(axis=1) / safe
        bandwidth = np.sqrt((power * (frequencies[None, :] - centroids[:, None]) ** 2).sum(axis=1) / safe)
        cumulative = np.cumsum(power, axis=1)
        rolloff = frequencies[np.argmax(cumulative >= total[:, None] * .85, axis=1)]
        flatness = np.exp(np.mean(np.log(np.maximum(power, 1e-30)), axis=1)) / np.maximum(power.mean(axis=1), 1e-30)
        magnitude = np.sqrt(power)
        differences = np.diff(np.vstack([previous_magnitude, magnitude]), axis=0)
        flux_chunks.append(np.maximum(differences, 0).sum(axis=1))
        previous_magnitude = magnitude[-1]
        for index in range(len(frames)):
            if (frame_count + index) % stride:
                continue
            audible = total[index] > 1e-20
            timeline.append({'timeSeconds': float(min(info.frames, frame_start + index * hop_size + fft_size / 2) / sample_rate),
                             'rmsLinear': float(rms[index]), 'rmsDbfs': db(rms[index]),
                             'spectralCentroidHz': float(centroids[index]) if audible else None,
                             'spectralBandwidthHz': float(bandwidth[index]) if audible else None,
                             'rolloff85Hz': float(rolloff[index]) if audible else None,
                             'spectralFlatness': float(flatness[index]) if audible else None,
                             'bandPower': {name: float(power[index, (frequencies >= low) & (frequencies < high)].sum() * sample_rate / fft_size)
                                           for name, low, high in BANDS}})
            spectra.append(power[index].copy())
        frame_count += len(frames)
        return len(frames) * hop_size

    with sf.SoundFile(path) as source:
        while True:
            block = source.read(65536, dtype='float64', always_2d=True)
            if not len(block): break
            if not np.all(np.isfinite(block)): raise ValueError('Audio contains non-finite samples.')
            channel_sum += block.sum(axis=0); channel_square += (block ** 2).sum(axis=0)
            channel_peak = np.maximum(channel_peak, np.abs(block).max(axis=0))
            near_full += np.sum(np.abs(block) >= threshold, axis=0)
            # True min/max waveform envelope, including samples between spectral windows.
            for offset in range(0, len(block), max(1, math.ceil(info.frames / 2000))):
                part = block[offset:offset + max(1, math.ceil(info.frames / 2000))]
                envelope.append([(read_frames + offset) / sample_rate, part.min(axis=0).tolist(), part.max(axis=0).tolist()])
            read_frames += len(block)
            pending = np.concatenate([pending, block])
            while len(pending) >= fft_size:
                consumed = process(pending)
                pending = pending[consumed:]
                frame_start += consumed
        if frame_count == 0:
            # Explicit one-frame padding for clips shorter than the analysis window.
            process(np.pad(pending, ((0, fft_size - len(pending)), (0, 0))))
    if sha256(path) != original_hash:
        raise ValueError('Source changed during analysis; no report will be published.')
    average_power = sum_power / frame_count
    df = sample_rate / fft_size
    overall_rms = np.sqrt(channel_square / read_frames)
    pulse = pulse_estimate(np.concatenate(flux_chunks), sample_rate / hop_size)
    for key in ('onsetCandidatesSeconds', 'estimatedBeatsSeconds'):
        pulse[key] = [value + min(fft_size / 2, info.frames / 2) / sample_rate for value in pulse[key] if value + min(fft_size / 2, info.frames / 2) / sample_rate <= info.frames / sample_rate]
    report = {
        'schema': 'AUEVO-AudioMeasurements/v0.1', 'evidenceClass': 'MEASURED',
        'source': {'filename': path.name, 'sha256': original_hash, 'unchangedAfterAnalysis': True,
                   'format': info.format, 'subtype': info.subtype, 'sampleRateHz': sample_rate,
                   'channels': channels, 'frames': read_frames, 'durationSeconds': read_frames / sample_rate,
                   'bitsPerSample': bits, 'bitDepthMeaning': 'container/subtype precision; not effective converter resolution',
                   'captureChain': 'UNKNOWN', 'rights': 'UNKNOWN'},
        'method': {'producer': 'AUEVO offline WAV analysis', 'version': '0.1.0', 'buildHash': sha256(__file__),
                   'python': platform.python_version(), 'numpy': np.__version__, 'scipy': scipy.__version__,
                   'soundfile': sf.__version__, 'libsndfile': sf.__libsndfile_version__,
                   'fftSize': fft_size, 'hopSize': hop_size, 'window': 'numpy symmetric Hann',
                   'frequencyBinSpacingHz': df, 'frameDurationSeconds': fft_size / sample_rate,
                   'spectralChannelCombination': 'mean channel power, not summed waveform',
                   'spectrumScaling': 'one-sided PSD, signal squared per Hz; per-frame DC removed',
                   'rolloffFraction': .85, 'timelineStrideFrames': stride,
                   'silenceThresholdDbfs': silence_db, 'resampled': False,
                   'paddedShortClip': read_frames < fft_size,
                   'pulseMethod': 'positive spectral flux autocorrelation, 60–200 BPM search; grid phase maximizes flux',
                   'pulseLimitations': 'Experimental periodicity estimate; not validated beat tracking. Half/double tempo and phase ambiguity possible; no meter or musical certainty claimed.',
                   'uncertainty': {'status': 'UNKNOWN', 'reason': 'No capture calibration; FFT/window and normalization affect estimates.'}},
        'levels': {'rmsLinearPerChannel': overall_rms.tolist(), 'rmsDbfsPerChannel': [db(x) for x in overall_rms],
                   'samplePeakPerChannel': channel_peak.tolist(), 'samplePeakDbfsPerChannel': [db(x) for x in channel_peak],
                   'dcOffsetPerChannel': (channel_sum / read_frames).tolist(),
                   'nearFullScaleSamplesPerChannel': near_full.tolist(), 'nearFullScaleThreshold': threshold,
                   'clippingNote': 'Near-full-scale samples are candidates, not proof of analogue clipping. Sample peak is not oversampled true peak.',
                   'silentFrameFraction': silent_count / frame_count},
        'spectrum': {'frequencyHz': frequencies.tolist(), 'meanPowerSpectralDensity': average_power.tolist(),
                     'bandPower': {name: {'lowerHz': low, 'upperHz': min(high, sample_rate / 2),
                                          'coverage': 'unavailable' if low >= sample_rate / 2 else 'partial' if high > sample_rate / 2 else 'full',
                                          'power': None if low >= sample_rate / 2 else float(average_power[(frequencies >= low) & (frequencies < high)].sum() * df)}
                                   for name, low, high in BANDS}},
        'timeline': timeline, 'pulseEstimate': pulse,
        'limitations': ['No sample-rate conversion or native-capture experiment performed.',
                        'No claim about emotion, health, identity, 369 significance or physical resonance.',
                        'Frequency resolution is limited by window length; bin spacing is not measurement accuracy.',
                        'Spectrogram/timeline are sampled for display on long files; aggregate PSD covers all full analysis frames.',
                        'Incomplete final window is excluded; source-wide levels and waveform include every sample.'],
    }
    report['researchPlan'] = {'candidateSampleRatesHz': [44100, 48000, 96000, 66666, 66369, 36369, 63369, 99369, 93369, 96369], 'status': 'not-executed', 'note': 'Resampling comparisons and native acquisition experiments are separate; this report analyses original-rate audio only.'}
    return report, envelope, np.asarray(spectra)


def write_plots(report, envelope, spectra, output):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    times = np.array([item[0] for item in envelope])
    lows = np.array([item[1] for item in envelope]); highs = np.array([item[2] for item in envelope])
    fig, axes = plt.subplots(lows.shape[1], 1, figsize=(12, min(20, 3 * lows.shape[1])), squeeze=False)
    for channel, axis in enumerate(axes[:, 0]):
        axis.fill_between(times, lows[:, channel], highs[:, channel], linewidth=.3)
        axis.set(title=f'Channel {channel + 1} waveform envelope', xlabel='Time (s)', ylabel='Sample amplitude')
    fig.tight_layout(); fig.savefig(output / 'waveform.png'); plt.close(fig)
    frequencies = np.asarray(report['spectrum']['frequencyHz']); power = np.asarray(report['spectrum']['meanPowerSpectralDensity'])
    fig, axis = plt.subplots(figsize=(12, 4)); axis.plot(frequencies, 10 * np.log10(np.maximum(power, 1e-20)))
    axis.set(title='Mean power spectrum — channel-power average', xlabel='Frequency (Hz)', ylabel='PSD (dB relative to sample unit²/Hz)', xlim=(0, frequencies[-1]))
    fig.tight_layout(); fig.savefig(output / 'spectrum.png'); plt.close(fig)
    fig, axis = plt.subplots(figsize=(12, 5))
    image = axis.pcolormesh([item['timeSeconds'] for item in report['timeline']], frequencies,
                            10 * np.log10(np.maximum(spectra.T, 1e-20)), shading='nearest', vmin=-100, vmax=0)
    axis.set(title='Sampled spectrogram — channel-power average', xlabel='Time (s)', ylabel='Frequency (Hz)')
    fig.colorbar(image, ax=axis, label='PSD (dB relative to sample unit²/Hz)')
    fig.tight_layout(); fig.savefig(output / 'spectrogram.png'); plt.close(fig)
    fig, axis = plt.subplots(figsize=(12, 4))
    axis.plot([item['timeSeconds'] for item in report['timeline']], [item['rmsDbfs'] if item['rmsDbfs'] is not None else np.nan for item in report['timeline']])
    axis.set(title='Window RMS levels — sampled timeline', xlabel='Time (s)', ylabel='RMS (dBFS)')
    fig.tight_layout(); fig.savefig(output / 'levels.png'); plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('audio', type=Path, nargs='?', help='WAV path; omit to select a file in a desktop dialog')
    parser.add_argument('--output', type=Path, help='New directory; existing output is never overwritten')
    parser.add_argument('--fft-size', type=int, default=2048)
    parser.add_argument('--hop-size', type=int, default=512)
    parser.add_argument('--silence-db', type=float, default=-60, help='Window-RMS silence threshold in dBFS')
    args = parser.parse_args()
    if args.audio is None:
        try:
            import tkinter as tk
            from tkinter import filedialog
            dialog = tk.Tk()
            dialog.withdraw()
            try:
                selected = filedialog.askopenfilename(title='Select original WAV for read-only analysis', filetypes=[('WAV audio', '*.wav'), ('All files', '*.*')])
            finally:
                dialog.destroy()
        except (ImportError, RuntimeError) as error:
            parser.exit(1, f'File dialog unavailable; supply the WAV path on the command line: {error}\n')
        except Exception as error:
            parser.exit(1, f'Unable to open file dialog; supply the WAV path instead: {error}\n')
        if not selected:
            print('No audio selected. Nothing analysed or changed.')
            return
        args.audio = Path(selected)
    output = args.output or Path('runtime') / ('audio-' + args.audio.stem)
    output = output.resolve()
    if output.exists(): parser.exit(1, 'Output already exists. Choose a new --output directory.\n')
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix='.audio-analysis-', dir=output.parent))
    try:
        print('Inspecting original WAV and analysing audio; no resampling...', flush=True)
        report, envelope, spectra = inspect_audio(args.audio, fft_size=args.fft_size, hop_size=args.hop_size, silence_db=args.silence_db)
        (staging / 'measurements.json').write_text(json.dumps(report, indent=2, allow_nan=False) + '\n', encoding='utf-8')
        write_plots(report, envelope, spectra, staging)
        source = report['source']; levels = report['levels']; pulse = report['pulseEstimate']
        summary = f'''# Audio inspection report

Source: {source['filename']}
SHA-256: {source['sha256']}
Original unchanged: verified before/after analysis.

- Sample rate: {source['sampleRateHz']} samples/second
- Format/subtype: {source['format']} / {source['subtype']}
- Channels: {source['channels']}
- Duration: {source['durationSeconds']:.3f} seconds
- Bits per sample: {source['bitsPerSample']} (format precision, not calibrated effective resolution)
- RMS dBFS per channel: {levels['rmsDbfsPerChannel']}
- Sample peak dBFS per channel: {levels['samplePeakDbfsPerChannel']}
- Near-full-scale sample candidates: {levels['nearFullScaleSamplesPerChannel']}
- Experimental tempo estimate: {pulse['tempoBpm']} BPM ({pulse['status']})

See measurements.json for frequency-band powers, spectral features, onset/pulse
estimates, analysis settings, software versions and explicit limitations. Plots
are waveform.png, spectrum.png and spectrogram.png. Beat estimates are experimental;
no tempo/beat certainty, true-peak, calibrated loudness or human-state inference.
No unconventional sample-rate or 369 mapping experiment has been performed yet.
'''
        (staging / 'report.md').write_text(summary, encoding='utf-8')
        heading = html.escape(source['filename'])
        webpage = f'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Audio analysis — {heading}</title><style>body{{font:16px system-ui;max-width:1100px;margin:30px auto;padding:20px;line-height:1.5}}img{{max-width:100%}}pre{{white-space:pre-wrap;overflow-wrap:anywhere}}</style><h1>Audio analysis: {heading}</h1><pre>{html.escape(summary)}</pre><p><a href="measurements.json">Full measurement JSON and methods</a></p>'
        for image, label in [('waveform.png', 'Waveform envelope'), ('levels.png', 'RMS levels'), ('spectrum.png', 'Mean spectrum'), ('spectrogram.png', 'Spectrogram')]:
            webpage += f'<h2>{label}</h2><img src="{image}" alt="{label}; numerical values and method details are in the measurement JSON">'
        webpage += '<h2>Research boundary</h2><p>Your proposed sample-rate and symbolic 369 experiments have not been executed by this inspection. The original audio is unchanged. No cloud upload is performed.</p></html>'
        (staging / 'report.html').write_text(webpage, encoding='utf-8')

        # Exclusive directory reservation prevents silently replacing another analysis.
        output.mkdir()
        try:
            for item in staging.iterdir(): shutil.move(str(item), output / item.name)
        except OSError:
            shutil.rmtree(output)
            raise
        print(f'Analysis saved to {output}', flush=True)
        print('Open report.html in that folder to view the plots.')
        print(f"Original rate: {source['sampleRateHz']} Hz; duration: {source['durationSeconds']:.2f}s; original unchanged.")
    except (OSError, ValueError, RuntimeError) as error:
        parser.exit(1, f'Analysis failed: {error}\n')
    finally:
        shutil.rmtree(staging, ignore_errors=True)


if __name__ == '__main__':
    main()
