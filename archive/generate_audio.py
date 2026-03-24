"""Generate pre-recorded TTS audio files for Red Alert announcements.

Uses edge-tts (free, no API key required) to create WAV files for each alert state.
Run once to generate the audio, then the actuator plays them locally.

Usage:
  pip install edge-tts
  python generate_audio.py
  python generate_audio.py --force   # regenerate all files
"""

import argparse
import asyncio
import sys
from pathlib import Path

try:
    import edge_tts
except ImportError:
    print("Error: edge-tts not installed. Run: pip install edge-tts")
    sys.exit(1)

AUDIO_DIR = Path(__file__).parent / "audio"

# Voice: en-US-GuyNeural is a clear, authoritative male voice
VOICE = "en-US-GuyNeural"

# ── Alert Messages ────────────────────────────────────────────────────────────
# All messages use generic area references so they're evergreen across deployments.

MESSAGES = {
    # Local area alerts
    "red_alert": (
        "Red alert. Active threat detected in your area. Seek shelter immediately."
    ),
    "early_warning": (
        "Early warning. Alerts are expected shortly in your area. "
        "Move to a protected space and stay nearby."
    ),
    "all_clear": (
        "All clear. The event in your area has ended. You may leave the protected space."
    ),
    # Nationwide thresholds
    "threshold_50": (
        "Nationwide alert. Over 50 areas are under simultaneous active alert across the country."
    ),
    "threshold_100": (
        "Nationwide alert. Over 100 areas are under simultaneous active alert across the country."
    ),
    "threshold_200": (
        "Major attack in progress. Over 200 areas are under simultaneous active alert across the country."
    ),
    "threshold_300": (
        "Major attack in progress. Over 300 areas are under simultaneous active alert across the country."
    ),
    "threshold_400": (
        "Large scale attack. Over 400 areas are under simultaneous active alert across the country."
    ),
    "threshold_500": (
        "Large scale attack. Over 500 areas are under simultaneous active alert across the country."
    ),
    "threshold_600": (
        "Massive attack in progress. Over 600 areas are under simultaneous active alert across the country."
    ),
    "threshold_700": (
        "Massive attack in progress. Over 700 areas are under simultaneous active alert across the country."
    ),
    "threshold_800": (
        "Unprecedented attack. Over 800 areas are under simultaneous active alert across the country."
    ),
    "threshold_900": (
        "Unprecedented attack. Over 900 areas are under simultaneous active alert across the country."
    ),
    "threshold_1000": (
        "Unprecedented nationwide emergency. Over 1000 areas are under simultaneous active alert."
    ),
    # Test alert wrappers
    "test_begin": (
        "This is a test. A test alert is about to begin."
    ),
    "test_ended": (
        "This is a test. The test alert has ended."
    ),
}


async def generate(force: bool = False):
    AUDIO_DIR.mkdir(exist_ok=True)

    for name, text in MESSAGES.items():
        out_path = AUDIO_DIR / f"{name}.mp3"
        wav_path = AUDIO_DIR / f"{name}.wav"

        # Check both formats — actuator uses .wav
        if wav_path.exists() and not force:
            print(f"  Skipping {name} (already exists)")
            continue

        print(f"  Generating {name}...")
        try:
            communicate = edge_tts.Communicate(text, VOICE)
            await communicate.save(str(out_path))

            # Convert mp3 to wav using ffmpeg if available, otherwise keep mp3
            import shutil
            if shutil.which("ffmpeg"):
                import subprocess
                subprocess.run(
                    ["ffmpeg", "-y", "-i", str(out_path), "-ar", "48000", "-ac", "2",
                     "-sample_fmt", "s16", str(wav_path)],
                    capture_output=True,
                )
                out_path.unlink()  # remove mp3 after conversion
                size = wav_path.stat().st_size
                print(f"    Saved {wav_path} ({size:,} bytes)")
            else:
                print(f"    Saved {out_path} (install ffmpeg to convert to WAV)")

        except Exception as e:
            print(f"    Error generating {name}: {e}")

    print("Done.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate TTS audio files for Red Alert")
    parser.add_argument("--force", action="store_true", help="Regenerate all files even if they exist")
    args = parser.parse_args()
    asyncio.run(generate(force=args.force))
