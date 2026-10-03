"""Print the UDID of the newest available iPhone simulator.

Reads the JSON of `xcrun simctl list devices available -j` on stdin.
"""

import json
import re
import sys


def runtime_version(runtime: str) -> tuple[int, ...]:
    match = re.search(r"iOS-(\d+(?:-\d+)*)$", runtime)
    return tuple(int(part) for part in match.group(1).split("-")) if match else ()


def main() -> None:
    devices = json.load(sys.stdin)["devices"]
    candidates = [
        (runtime_version(runtime), device["name"], device["udid"])
        for runtime, entries in devices.items()
        for device in entries
        if device["name"].startswith("iPhone") and runtime_version(runtime)
    ]
    if not candidates:
        sys.exit("no available iPhone simulator")
    print(max(candidates)[2])


if __name__ == "__main__":
    main()
