#!/usr/bin/env python3
"""Emit bounded, one-second macOS memory pressure and swap page deltas as JSONL."""

import argparse
import json
import re
import subprocess
import time


def read_command(*args):
    return subprocess.check_output(args, text=True, timeout=0.4)


def sample():
    pressure = int(read_command("/usr/sbin/sysctl", "-n", "kern.memorystatus_vm_pressure_level"))
    vm = read_command("/usr/bin/vm_stat")
    page_size = re.search(r"page size of (\d+) bytes", vm)
    swapins = re.search(r"^Swapins:\s+(\d+)", vm, re.MULTILINE)
    swapouts = re.search(r"^Swapouts:\s+(\d+)", vm, re.MULTILINE)
    if not (page_size and swapins and swapouts):
        raise ValueError("vm_stat did not report the page size and swap counters")
    return pressure, int(page_size[1]), int(swapins[1]), int(swapouts[1])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seconds", type=int, default=180)
    args = parser.parse_args()
    if not 1 <= args.seconds <= 180:
        parser.error("--seconds must be between 1 and 180")

    start = time.monotonic()
    deadline = start + args.seconds
    previous = None
    next_at = start
    try:
        for _ in range(args.seconds):
            time.sleep(max(0, next_at - time.monotonic()))
            if time.monotonic() >= deadline:
                break
            pressure, page_bytes, ins, outs = sample()
            current = (page_bytes, ins, outs)
            comparable = previous is not None and previous[0] == page_bytes and ins >= previous[1] and outs >= previous[2]
            print(json.dumps({
                "epochMs": time.time_ns() // 1_000_000,
                "memoryPressureLevel": pressure,
                "pageSizeBytes": page_bytes,
                "swapinPagesDelta": ins - previous[1] if comparable else None,
                "swapoutPagesDelta": outs - previous[2] if comparable else None,
            }), flush=True)
            previous = current
            next_at += 1
            # Skip a missed tick rather than sampling a burst.
            if next_at < time.monotonic():
                next_at = time.monotonic() + 1
    except KeyboardInterrupt:
        return 130
    except (OSError, subprocess.SubprocessError, ValueError) as exc:
        parser.exit(1, f"Memory sample failed: {exc}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
