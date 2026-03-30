"""Generate pre-recorded TTS audio files for all Red Alert announcements.

Produces WAV files (48kHz, 16-bit, stereo) ready for Snapcast playback.
Run once to populate the audio/ directory — these ship with the repo so
users get instant playback without waiting for TTS generation.

Usage:
    pip install edge-tts
    python generate_audio.py            # generate missing files
    python generate_audio.py --force    # regenerate everything
"""

import argparse
import asyncio
import shutil
import subprocess
import sys
from pathlib import Path

try:
    import edge_tts
except ImportError:
    print("Error: edge-tts not installed. Run: pip install edge-tts")
    sys.exit(1)

AUDIO_DIR = Path(__file__).parent / "audio"
VOICE = "en-US-GuyNeural"

# ── Messages ─────────────────────────────────────────────────────────────────
# Every key here becomes a .wav file in audio/

MESSAGES = {
    # Localized alerts
    "active": (
        "Red alert. Active threat detected in your area. "
        "Seek shelter immediately."
    ),
    "warning": (
        "Alerts expected. Alerts are expected shortly in your area. "
        "Move to a protected space and stay nearby."
    ),
    "clear": (
        "All clear. The event in your area has ended. "
        "You may leave the protected space."
    ),
    # Nationwide thresholds
    "threshold_50": (
        "Nationwide alert. Over 50 areas are under simultaneous "
        "active alert across Israel."
    ),
    "threshold_100": (
        "Nationwide alert. Over 100 areas are under simultaneous "
        "active alert across Israel."
    ),
    "threshold_200": (
        "Major attack in progress. Over 200 areas are under "
        "active alert across Israel."
    ),
    "threshold_300": (
        "Major attack in progress. Over 300 areas are under "
        "active alert across Israel."
    ),
    "threshold_400": (
        "Large scale attack. Over 400 areas are under "
        "active alert across Israel."
    ),
    "threshold_500": (
        "Large scale attack. Over 500 areas are under "
        "active alert across Israel."
    ),
    "threshold_600": (
        "Massive attack in progress. Over 600 areas are under "
        "active alert across Israel."
    ),
    "threshold_700": (
        "Massive attack in progress. Over 700 areas are under "
        "active alert across Israel."
    ),
    "threshold_800": (
        "Unprecedented attack. Over 800 areas are under "
        "active alert across Israel."
    ),
    "threshold_900": (
        "Unprecedented attack. Over 900 areas are under "
        "active alert across Israel."
    ),
    "threshold_1000": (
        "Unprecedented nationwide emergency. Over 1000 areas are under "
        "active alert across Israel."
    ),
    # Test / system
    "test": (
        "This is a test announcement from the Red Alert dashboard. "
        "If you can hear this, your Snapcast audio is working correctly."
    ),
    "test_active": (
        "This is a test. Red alert test in progress. "
        "This is only a test."
    ),
    "test_warning": (
        "This is a test. Alerts expected test in progress. "
        "This is only a test."
    ),
    "test_clear": (
        "This is a test. The test alert has ended."
    ),
}


def generate_chime(chime_path: Path):
    """Generate a soft 3-note ascending chime (C5 → E5 → G5)."""
    print("  gen   chime...")
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", "sine=frequency=523:duration=0.25",
            "-f", "lavfi", "-i", "sine=frequency=659:duration=0.25",
            "-f", "lavfi", "-i", "sine=frequency=784:duration=0.35",
            "-filter_complex",
            "[0:a]afade=t=in:d=0.03,afade=t=out:st=0.18:d=0.07,volume=0.4[a];"
            "[1:a]afade=t=in:d=0.03,afade=t=out:st=0.18:d=0.07,volume=0.4[b];"
            "[2:a]afade=t=in:d=0.03,afade=t=out:st=0.25:d=0.1,volume=0.45[c];"
            "[a][b][c]concat=n=3:v=0:a=1[out]",
            "-map", "[out]",
            "-ar", "48000", "-ac", "2", "-sample_fmt", "s16",
            str(chime_path),
        ],
        capture_output=True,
        check=True,
    )
    size = chime_path.stat().st_size
    print(f"        chime.wav  {size:,} bytes")


async def generate(force: bool = False):
    AUDIO_DIR.mkdir(exist_ok=True)

    if not shutil.which("ffmpeg"):
        print("ERROR: ffmpeg is required. Install with: apt install ffmpeg")
        sys.exit(1)

    # Step 1: Generate the chime tone
    chime_path = AUDIO_DIR / "chime.wav"
    if not chime_path.exists() or force:
        generate_chime(chime_path)
    else:
        print("  skip  chime (exists)")

    # Step 2: Generate each message as: chime + 0.5s pause + speech
    generated = 0
    skipped = 0

    for name, text in MESSAGES.items():
        wav_path = AUDIO_DIR / f"{name}.wav"

        if wav_path.exists() and not force:
            skipped += 1
            print(f"  skip  {name} (exists)")
            continue

        print(f"  gen   {name}...")
        try:
            # Generate speech MP3 via edge-tts
            mp3_path = AUDIO_DIR / f"_tmp_{name}.mp3"
            speech_wav = AUDIO_DIR / f"_tmp_{name}.wav"
            communicate = edge_tts.Communicate(text, VOICE)
            await communicate.save(str(mp3_path))

            # Convert speech to WAV
            subprocess.run(
                [
                    "ffmpeg", "-y", "-i", str(mp3_path),
                    "-ar", "48000", "-ac", "2", "-sample_fmt", "s16",
                    str(speech_wav),
                ],
                capture_output=True,
                check=True,
            )
            mp3_path.unlink()

            # Concatenate: chime + 0.5s silence + speech
            subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-i", str(chime_path),
                    "-f", "lavfi", "-t", "0.5", "-i", "anullsrc=r=48000:cl=stereo",
                    "-i", str(speech_wav),
                    "-filter_complex", "[0:a][1:a][2:a]concat=n=3:v=0:a=1[out]",
                    "-map", "[out]",
                    "-ar", "48000", "-ac", "2", "-sample_fmt", "s16",
                    str(wav_path),
                ],
                capture_output=True,
                check=True,
            )
            speech_wav.unlink()

            size = wav_path.stat().st_size
            duration = size / (48000 * 2 * 2)
            print(f"        {wav_path.name}  {size:,} bytes  ({duration:.1f}s)")
            generated += 1
        except Exception as e:
            print(f"        ERROR: {e}")
            # Clean up temp files on error
            for tmp in AUDIO_DIR.glob(f"_tmp_{name}.*"):
                tmp.unlink(missing_ok=True)

    print(f"\nDone: {generated} generated, {skipped} skipped, {len(MESSAGES)} total")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate TTS audio for Red Alert Snapcast")
    parser.add_argument("--force", action="store_true", help="Regenerate all files")
    args = parser.parse_args()
    asyncio.run(generate(force=args.force))
