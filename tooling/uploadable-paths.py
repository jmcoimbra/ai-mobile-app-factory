"""Rename files and folders under a directory so upload-artifact accepts them.

Maestro names a flow's debug folder after the flow, and a name such as
"e2e: app launches" carries a colon, which upload-artifact refuses, failing
the whole upload. Each refused character becomes a dash.
"""

import os
import sys

REFUSED = str.maketrans({c: "-" for c in '":<>|*?\r\n'})


def main() -> None:
    root_dir = sys.argv[1]
    # Bottom up, so a folder is renamed after everything inside it.
    for root, dirs, files in os.walk(root_dir, topdown=False):
        for name in dirs + files:
            safe = name.translate(REFUSED)
            if safe != name:
                os.rename(os.path.join(root, name), os.path.join(root, safe))


if __name__ == "__main__":
    main()
