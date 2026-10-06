"""Rename files and folders under a directory so upload-artifact accepts them.

Maestro names a flow's debug folder after the flow, and a name such as
"e2e: app launches" carries a colon, which upload-artifact refuses, failing
the whole upload. Each refused character becomes a dash.
"""

import os
import sys

REFUSED = str.maketrans({c: "-" for c in '":<>|*?\r\n'})


def free_name(root: str, name: str) -> str:
    """`name`, or `name-2`, `name-3`... when two names map to the same one."""
    stem, ext = os.path.splitext(name)
    candidate, n = name, 1
    while os.path.lexists(os.path.join(root, candidate)):
        n += 1
        candidate = f"{stem}-{n}{ext}"
    return candidate


def main() -> None:
    root_dir = sys.argv[1]
    # Bottom up, so a folder is renamed after everything inside it.
    for root, dirs, files in os.walk(root_dir, topdown=False):
        for name in dirs + files:
            safe = name.translate(REFUSED)
            if safe != name:
                target = free_name(root, safe)
                os.rename(os.path.join(root, name), os.path.join(root, target))


if __name__ == "__main__":
    main()
