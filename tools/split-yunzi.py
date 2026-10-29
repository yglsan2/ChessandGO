"""Découpe le pack Yunzi CC0 (Freesound) en clics individuels."""
import os
import subprocess
import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
SRC = os.path.join("sounds", "go", "yunzi-pack.mp3")
OUT_DIR = os.path.join("sounds", "go", "stone")
os.makedirs(OUT_DIR, exist_ok=True)

# D'abord WAV mono 44.1k
wav = os.path.join(OUT_DIR, "_pack.wav")
subprocess.check_call([
    FFMPEG, "-y", "-i", SRC, "-ac", "1", "-ar", "44100", wav
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

import wave
import array
import struct

with wave.open(wav, "rb") as w:
    rate = w.getframerate()
    n = w.getnframes()
    raw = w.readframes(n)
    sampwidth = w.getsampwidth()

# int16 samples
samples = array.array("h")
samples.frombytes(raw)
# RMS par fenêtre 20ms
win = max(1, int(rate * 0.02))
energies = []
for i in range(0, len(samples) - win, win):
    chunk = samples[i : i + win]
    rms = (sum(int(x) * int(x) for x in chunk) / len(chunk)) ** 0.5
    energies.append((i, rms))

vals = sorted(e for _, e in energies)
thr = vals[int(len(vals) * 0.72)]
chunks = []
in_hit = False
start = 0
for i, e in energies:
    if e > thr and not in_hit:
        in_hit = True
        start = max(0, i - int(rate * 0.02))
    elif e <= thr and in_hit:
        in_hit = False
        end = min(len(samples), i + int(rate * 0.12))
        if end - start > int(rate * 0.05):
            chunks.append((start, end))
if in_hit:
    chunks.append((start, len(samples)))

# garder 5 meilleurs / plus longs
chunks = sorted(chunks, key=lambda c: c[1] - c[0], reverse=True)[:5]
chunks = sorted(chunks, key=lambda c: c[0])
print("hits", len(chunks), [(round(a / rate, 3), round(b / rate, 3)) for a, b in chunks])

def write_wav(path, start_i, end_i):
    data = samples[start_i:end_i]
    with wave.open(path, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(data.tobytes())

for i, (a, b) in enumerate(chunks):
    wav_path = os.path.join(OUT_DIR, f"stone{i + 1}.wav")
    mp3_path = os.path.join(OUT_DIR, f"stone{i + 1}.mp3")
    write_wav(wav_path, a, b)
    subprocess.check_call([
        FFMPEG, "-y", "-i", wav_path, "-codec:a", "libmp3lame", "-b:a", "192k", mp3_path
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print("wrote", wav_path, mp3_path, round((b - a) / rate, 3), "s")

os.remove(wav)
print("done")
