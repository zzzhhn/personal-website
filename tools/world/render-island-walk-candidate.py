#!/usr/bin/env python3
"""Original, deterministic Island Walk 01 candidate. No samples, model, network or runtime edits.

Requires the existing NumPy and FFmpeg installations and an owned shared heavy-task lock.
Produces five 48-second PCM WAVs, an explicit score and measurement/provenance reports.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import wave

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "1")
import numpy as np

RATE, BPM, SECONDS, SEED = 24000, 80, 48, 20261028
BEAT, BAR = 60 / BPM, 4 * 60 / BPM
FRAMES = RATE * SECONDS
PARTS = ("mallet", "pad", "bass", "wood")
SECTIONS = (("A", 1, 4, .35), ("B", 5, 4, .50), ("C", 9, 2, .15),
            ("D", 11, 4, .50), ("E", 15, 2, .20))
CHORDS = (
    ("Cmaj7", [48, 52, 55, 59]), ("Fmaj7", [52, 53, 57, 60]),
    ("Cmaj7", [48, 52, 55, 59]), ("Fmaj7", [52, 53, 57, 60]),
    ("Am7", [48, 52, 55, 57]), ("Dm7", [48, 50, 53, 57]),
    ("Fm", [48, 53, 56]), ("G7", [50, 53, 55, 59]),
    ("Cmaj7", []), ("Cmaj7", []),
    ("Cmaj7", [48, 52, 55, 59]), ("Fmaj7", [52, 53, 57, 60]),
    ("Dm7", [48, 50, 53, 57]), ("G7", [50, 53, 55, 59]),
    ("Cmaj7", [48, 52, 55, 59]), ("Cmaj7", []),
)


def section_for(bar):
    return next(s for s in SECTIONS if s[1] <= bar < s[1] + s[2])


def score():
    events = []

    def add(part, bar, beat, notes, beats, velocity, offset=0):
        events.append(dict(part=part, section=section_for(bar)[0], bar=bar, beat=beat,
                           midi=notes, beats=beats, velocity=velocity, offset_ms=offset,
                           seconds=(bar - 1) * BAR + beat * BEAT + offset / 1000))

    # Original motif, six notes over two bars: E G A G / D C, then rests.
    for first in (1, 3, 5, 7, 11, 13):
        notes = [64, 67, 69, 67] if first != 7 else [65, 67, 68, 67]
        for beat, note, length, velocity in zip((0, 1, 1.5, 2), notes, (1, .5, .5, 1), (.84, .66, .74, .62)):
            add("mallet", first, beat, [note], length, velocity)
        answer = [62, 59] if first in (5, 7) else [62, 60]
        for beat, note, velocity in zip((0, 1), answer, (.68, .57)):
            add("mallet", first + 1, beat, [note], 1, velocity)
    add("mallet", 9, 0, [64], .5, .56)
    add("mallet", 9, 2, [67], .5, .48)
    add("mallet", 15, 0, [62], 1, .62)
    add("mallet", 15, 1, [60], 1, .49)
    for bar, (_, notes) in enumerate(CHORDS, 1):
        if notes:
            add("pad", bar, .45, notes, 2.25, .62 if bar < 5 or bar == 15 else .76)
    # First Am7 uses E2, an inversion that respects the specified C2-G2 bass register.
    for bar, note in ((5, 40), (6, 38), (7, 41), (8, 43), (11, 36), (12, 41), (13, 38), (14, 43)):
        for beat, velocity in ((.25, .78), (2.75, .56)):
            add("bass", bar, beat, [note], .65, velocity)
    for bar in (5, 6, 7, 8):
        beats = (.75, 2.5) if bar % 2 else (1.75, 3.1)
        if bar == 8:
            beats = (1.75, 3.25, 3.6)  # The only fill; no percussion returns in D.
        for i, beat in enumerate(beats):
            add("wood", bar, beat, [72 + i % 2 * 3], .13, .48 if i == 0 else .34, 12)
    return sorted(events, key=lambda e: (e["seconds"], e["part"]))


def frequency(midi):
    return 440 * 2 ** ((midi - 69) / 12)


def edges(count, attack, release):
    t = np.arange(count) / RATE
    return np.sin(np.minimum(1, t / attack) * math.pi / 2) ** 2 * np.sin(
        np.minimum(1, (count - 1 - np.arange(count)) / RATE / release) * math.pi / 2) ** 2


def voice(event, rng):
    part, gate = event["part"], event["beats"] * BEAT
    duration = gate + {"mallet": .30, "pad": .44, "bass": .16, "wood": .035}[part]
    count = math.ceil(duration * RATE)
    t = np.arange(count) / RATE
    f = frequency(event["midi"][0])
    if part == "mallet":
        # Modal wood-bar resonance, not a sustained single-frequency UI oscillator.
        y = (np.sin(2 * math.pi * f * t) * np.exp(-t / .27)
             + .27 * np.sin(2 * math.pi * f * 3.98 * t) * np.exp(-t / .08)
             + .065 * np.sin(2 * math.pi * f * 8.91 * t) * np.exp(-t / .022))
        contact = np.convolve(rng.uniform(-1, 1, count), np.ones(9) / 9, "same")
        y = .29 * (y + .24 * contact * np.exp(-t / .009)) * edges(count, .0035, .10)
    elif part == "pad":
        y = np.zeros(count)
        for i, note in enumerate(event["midi"]):
            nf = frequency(note)
            phase = 2 * math.pi * nf * t + .045 * np.sin(2 * math.pi * (.19 + i * .023) * t)
            y += np.sin(phase) - np.sin(3 * phase) / 13 + np.sin(5 * phase) / 65
        y *= .045 * edges(count, .40, .44) * (.97 + .03 * np.cos(2 * math.pi * .31 * t))
    elif part == "bass":
        phase = 2 * math.pi * f * t
        y = .21 * (np.sin(phase) + .24 * np.sin(2 * phase) + .045 * np.sin(3 * phase))
        y *= np.exp(-t / .25) * edges(count, .011, .12)
    else:
        grain = np.convolve(rng.uniform(-1, 1, count), np.ones(5) / 5, "same")
        y = .16 * (grain * np.exp(-t / .016) + .62 * np.sin(2 * math.pi * f * t) * np.exp(-t / .028)
                   + .22 * np.sin(2 * math.pi * 1.72 * f * t) * np.exp(-t / .012))
        y *= edges(count, .0018, .025)
    return y * event["velocity"]


def arrange(events):
    tracks = {part: np.zeros((FRAMES, 2), np.float32) for part in PARTS}
    rng = np.random.default_rng(SEED)
    pans = {"mallet": -.10, "pad": 0, "bass": 0, "wood": .15}
    for event in events:
        mono = voice(event, rng)
        pan = pans[event["part"]]
        stereo = np.column_stack((mono * math.cos((pan + 1) * math.pi / 4),
                                  mono * math.sin((pan + 1) * math.pi / 4)))
        # Two quiet finite room reflections; no reverb plugin or long wash between sections.
        if event["part"] in ("pad", "mallet"):
            stereo = np.pad(stereo, ((0, round(.037 * RATE)), (0, 0)))
            for delay, channel, gain in ((.019, 1, .10), (.037, 0, .075)):
                offset = round(delay * RATE)
                stereo[offset:offset + len(mono), channel] += mono * gain
        start = round(event["seconds"] * RATE)
        end = min(FRAMES, start + len(stereo))
        tracks[event["part"]][start:end] += stereo[:end - start].astype(np.float32)
    for track in tracks.values():
        for _, bar, bars, width in SECTIONS:
            block = track[round((bar - 1) * BAR * RATE):round((bar - 1 + bars) * BAR * RATE)]
            mid, side = block.mean(axis=1), (block[:, 0] - block[:, 1]) * .5 * width
            block[:, 0], block[:, 1] = mid + side, mid - side
    return tracks


def loudness(ffmpeg, *, audio=None, path=None):
    cmd = [ffmpeg, "-hide_banner", "-nostats", "-threads", "1", "-filter_threads", "1"]
    if path is not None:
        cmd += ["-i", str(path)]
        raw = None
    else:
        cmd += ["-f", "f32le", "-ar", str(RATE), "-ac", "2", "-i", "pipe:0"]
        raw = audio.astype("<f4").tobytes()
    result = subprocess.run(cmd + ["-af", "ebur128=peak=true", "-f", "null", "-"],
                            input=raw, capture_output=True, check=True)
    summary = result.stderr.decode().rsplit("Summary:", 1)[-1]

    def number(label):
        found = re.search(label + r"\s*:\s*(-?(?:\d+(?:\.\d+)?|inf))", summary)
        if not found:
            raise RuntimeError("Missing FFmpeg loudness field: " + label)
        return float(found.group(1))
    return {"integrated_lufs": number(r"\bI"), "loudness_range_lu": number("LRA"),
            "true_peak_dbtp": number("Peak")}


def db(value):
    return round(20 * math.log10(value), 4) if value > 0 else None


def pcm_stats(pcm):
    audio = pcm.astype(np.float64) / 32768
    rms = float(np.sqrt(np.mean(audio * audio)))
    peak = float(np.max(np.abs(audio)))
    return {"rms": round(rms, 7), "rms_dbfs": db(rms), "sample_peak_dbfs": db(peak),
            "crest_factor_db": db(peak / rms) if rms else None,
            "clipped_samples": int(np.count_nonzero((pcm == 32767) | (pcm == -32768)))}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_wav(path, audio, seed):
    if float(np.max(np.abs(audio))) >= .999:
        raise RuntimeError("Headroom failure before PCM conversion")
    rng = np.random.default_rng(seed)
    # TPDF dither on active samples only; intentional silence remains exactly zero.
    dither = (rng.random(audio.shape) - rng.random(audio.shape)) * (np.abs(audio) > 1e-12)
    pcm = np.rint(audio.astype(np.float64) * 32768 + dither).astype("<i2")
    with wave.open(str(path), "wb") as file:
        file.setnchannels(2)
        file.setsampwidth(2)
        file.setframerate(RATE)
        file.writeframes(pcm.tobytes())
    with wave.open(str(path), "rb") as file:
        assert (file.getnframes(), file.getframerate(), file.getnchannels(), file.getsampwidth()) == (FRAMES, RATE, 2, 2)
        assert file.readframes(FRAMES) == pcm.tobytes()
    return pcm


def run(output, owner):
    lock = Path("/tmp/bobby-world-phase2-heavy.lock/owner.json")
    if not lock.exists() or json.loads(lock.read_text()).get("owner") != owner:
        raise RuntimeError("Shared heavy-task lock is not owned by this rendering run")
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("Use the existing FFmpeg installation; do not install automatically")
    if output.exists() and any(output.iterdir()):
        raise RuntimeError("Candidate output directory must be empty")
    output.mkdir(parents=True, exist_ok=True)
    events = score()
    assert max(e["bar"] for e in events) == 15
    assert all(e["part"] == "mallet" for e in events if e["section"] == "C")
    assert all(e["section"] == "B" for e in events if e["part"] == "wood")
    tracks = arrange(events)
    mix = sum(tracks.values())
    before = loudness(ffmpeg, audio=mix)
    gain_db = min(-20 - before["integrated_lufs"], -2.1 - before["true_peak_dbtp"])
    gain = 10 ** (gain_db / 20)
    pcm = {"mix": write_wav(output / "island-walk-01-mix.wav", mix * gain, SEED + 100)}
    files = {"mix": "island-walk-01-mix.wav"}
    for index, part in enumerate(PARTS, 1):
        files[part] = f"{index:02d}-{part}.wav"
        pcm[part] = write_wav(output / files[part], tracks[part] * gain, SEED + 100 + index)
    measurements = {}
    for part, name in files.items():
        path = output / name
        measurements[part] = {"file": name, "frames": FRAMES, "duration_seconds": SECONDS,
                              "bytes": path.stat().st_size, "sha256": sha(path),
                              **pcm_stats(pcm[part]), **loudness(ffmpeg, path=path)}
        assert measurements[part]["clipped_samples"] == 0
    assert measurements["mix"]["true_peak_dbtp"] <= -2
    assert abs(measurements["mix"]["integrated_lufs"] + 20) <= .4
    error = int(np.max(np.abs(sum(pcm[p].astype(np.int32) for p in PARTS) - pcm["mix"].astype(np.int32))))
    assert error <= 8, "Stem sum differs by more than independent PCM quantization/dither"
    assert not np.any(pcm["mix"][45 * RATE:]), "Last bar must contain actual silence"
    sections = []
    for name, bar, bars, width in SECTIONS:
        start, stop = round((bar - 1) * BAR * RATE), round((bar - 1 + bars) * BAR * RATE)
        stats = {part: pcm_stats(value[start:stop]) for part, value in pcm.items()}
        sections.append({"id": name, "start_seconds": start / RATE, "end_seconds": stop / RATE,
                         "width": width, "parts": stats})
    assert sections[2]["parts"]["mix"]["rms_dbfs"] < sections[1]["parts"]["mix"]["rms_dbfs"] - 6
    assert all(sections[2]["parts"][part]["rms"] == 0 for part in ("pad", "bass", "wood"))
    root = Path(__file__).resolve().parents[2]
    spec = root / "docs/world/phase-2-playground/audio-overhaul-20261028.md"
    provenance = {
        "status": "candidate_not_integrated_not_listened", "date": "2026-10-28",
        "source": "Original note arrangement and procedural synthesis written for this project",
        "external_audio_samples": [], "external_models": [], "paid_services": [],
        "script": str(Path(__file__).resolve().relative_to(root)), "script_sha256": sha(Path(__file__)),
        "arr_spec": str(spec.relative_to(root)), "arr_spec_sha256": sha(spec),
        "seed": SEED, "numpy_version": np.__version__,
        "ffmpeg_version": subprocess.run([ffmpeg, "-version"], capture_output=True, text=True, check=True).stdout.splitlines()[0],
        "third_party_music_used": False,
        "rights_note": "No Club recording, licensed sample pack or model output was used. This records process provenance, not a legal originality certification.",
    }
    analysis = {"provenance": provenance, "pcm": {"rate": RATE, "channels": 2, "bits": 16, "frames": FRAMES},
                "meter": "4/4", "bpm": BPM, "bars": 16, "fixed_gain_db": round(gain_db, 4),
                "premaster": before, "files": measurements, "sections": sections,
                "stem_sum_max_error_lsb": error, "last_bar_exact_silence": True,
                "limiting_or_compression": False,
                "analysis_note": "RMS and sample peak measured from read-back PCM; LUFS/LRA/true peak from FFmpeg ebur128. Crest factor is peak/RMS, not an undefined DR score."}
    score_data = {"title": "Island Walk 01 candidate", "bpm": BPM, "meter": "4/4", "seconds": SECONDS,
                  "midi_convention": "C4=60", "beat_convention": "zero-based within each one-based bar",
                  "harmony": [{"bar": i, "chord": chord, "pad_voicing_midi": notes} for i, (chord, notes) in enumerate(CHORDS, 1)],
                  "events": events,
                  "decisions": ["Bar 7 motif becomes F4 G4 Ab4 G4 to avoid E4 against Fm, retaining rhythm and contour.",
                                "Bar 5 Am7/E uses E2 bass to stay in C2-G2; harmonic identity remains Am7.",
                                "Bars 9-10 keep only E4 and G4; wood never returns after B.",
                                "Bar 16 has no new notes or tails; final three seconds are exact silence.",
                                "No runtime interaction ducking is applied to this standalone music candidate."]}
    (output / "score.json").write_text(json.dumps(score_data, ensure_ascii=False, indent=2) + "\n")
    (output / "analysis.json").write_text(json.dumps(analysis, ensure_ascii=False, indent=2) + "\n")
    m = measurements["mix"]
    file_rows = "\n".join(f"| [{v['file']}]({v['file']}) | {v['integrated_lufs']:.1f} | {v['true_peak_dbtp']:.1f} | {v['rms_dbfs']:.2f} |"
                          for v in measurements.values())
    section_rows = "\n".join(f"| {s['id']} | {s['start_seconds']:g}～{s['end_seconds']:g} | {s['parts']['mix']['rms_dbfs']:.2f} |"
                             for s in sections)
    report = f"""# Island Walk 01：原创离线音乐候选

2026-10-28。**已生成实际可播放 WAV，候选、未集成、未试听。** 不改现有 Club 音乐、运行代码或全局音量。本报告中的音色描述是设计意图，不是听感认可。

## 成品

一个 mix 和四个分轨均为 **48.000 秒、24 kHz、16-bit PCM、双声道、1,152,000 帧**。四分音符 80 BPM，4/4，16 小节。四轨采用相同固定增益 {gain_db:.2f} dB，未分别归一化，无压缩或限制器。含低电平 TPDF 量化抖动，明确休止区仍保持数字静音。

| 文件 | LUFS-I | true peak，dBTP | RMS，dBFS |
| --- | ---: | ---: | ---: |
{file_rows}

分轨相加与 mix 的最大差值为 {error} 个 16-bit LSB，来自独立量化／抖动；听混音请从 mix 开始，不必把五个文件一起播放。

## 乐谱与音色

[score.json](score.json) 逐事件记录小节、拍位、实际秒数、MIDI 音符、时值和力度；C4=60。A 原始 E4-G4-A4-G4／D4-C4 动机；B 用 D4-B3 回答，第 7 小节在 Fm 上改为 F4-G4-Ab4-G4；C 仅留两个短音；D 再现，木触点不返回；E 只保留回答并收束。第 16 小节无新音，最后 3 秒已经逐样本确认完全静音。

木槌由有衰减的非整数倍共鸣和短噪声起音构成；暗色和声用低泛音、缓起音和很浅的相位变化；圆低音含二次谐波；木触点有短颗粒起音与迅速衰减。只用有限的 19／37 ms 低电平早反射，不用长混响填满留白。木触点后移 12 ms，只有第 8 小节有短 fill。Am7 的低音采用 E2 转位以满足原谱 C2-G2 音区。

## 段落能量与验证

| 段 | 秒区间 | mix RMS，dBFS |
| --- | --- | ---: |
{section_rows}

C 段的 pad／bass／wood 分轨逐样本为零，mix RMS 比 B 低 {sections[1]['parts']['mix']['rms_dbfs'] - sections[2]['parts']['mix']['rms_dbfs']:.2f} dB。五个文件均已写回读取比对帧数和 PCM，无满幅削波。mix crest factor 为 {m['crest_factor_db']:.2f} dB，EBU loudness range 为 {m['loudness_range_lu']:.1f} LU。原规格 target_DR_dB=8 没有明确测量算法，本报告分别给出 crest factor 与 LRA，不冒称已满足该项。

[analysis.json](analysis.json) 保存所有文件 SHA-256、逐轨／逐段 PCM 指标、FFmpeg EBU R128 测量、脚本和规格来源哈希、工具版本与固定随机种子。响度及真峰值来自实际输出 WAV，不是输入增益推算。当前 mix 为 {m['integrated_lufs']:.1f} LUFS-I，{m['true_peak_dbtp']:.1f} dBTP。

源码：`tools/world/render-island-walk-candidate.py`，只用本机已安装 NumPy／FFmpeg 和本项目新写的确定性合成。没有下载音源、模型、采样、调用付费服务，也没有使用 Kevin MacLeod 或旧 Club 音频；此为制作来源记录，不是法律意义的原创性鉴定。

复现需先检查资源、按共享约定取得 `/tmp/bobby-world-phase2-heavy.lock`，再运行脚本并传入匹配的 `--lock-owner` 和一个空的 `--output` 目录。脚本不自动抢锁、不覆盖已有候选、不启动播放或浏览器。

待验收：等响试听木槌是否过硬、和声是否像风琴、低音在笔记本上的可辨认度、B→C 留白是否自然，以及反复游玩时是否疲劳。本候选不包含运行时交互 ducking；没有完成跨设备、浏览器播放或用户听感认可。
"""
    (output / "README.md").write_text(report)
    total = sum(p.stat().st_size for p in output.iterdir() if p.is_file())
    assert total < 30_000_000, "Candidate output must remain below 30 MB"
    print(json.dumps({"status": "rendered_not_listened", "output": str(output), "files": list(files.values()),
                      "total_bytes": total, "mix_lufs": m["integrated_lufs"], "mix_true_peak_dbtp": m["true_peak_dbtp"],
                      "stem_sum_max_error_lsb": error}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--lock-owner", required=True)
    args = parser.parse_args()
    run(args.output.resolve(), args.lock_owner)
