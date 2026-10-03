#!/usr/bin/env bash
# Remove the JAR signature from an Android App Bundle, so the upload job can
# sign it with the upload key and nothing else ever has.
#   usage: tooling/strip-signature.sh <bundle.aab>
set -euo pipefail

bundle="${1:?usage: tooling/strip-signature.sh <bundle.aab>}"
test -f "$bundle"

# zip exits 12 when there was nothing to delete, which is fine for an
# unsigned bundle. Any other failure is real.
set +e
zip -q -d "$bundle" 'META-INF/*.SF' 'META-INF/*.RSA' 'META-INF/*.DSA' 'META-INF/*.EC' 'META-INF/MANIFEST.MF'
status=$?
set -e
if [ "$status" -ne 0 ] && [ "$status" -ne 12 ]; then
  echo "zip failed with status $status" >&2
  exit "$status"
fi

if unzip -l "$bundle" | grep -q 'META-INF/.*\.\(SF\|RSA\|DSA\|EC\)$'; then
  echo "a signature is still present in $bundle" >&2
  exit 1
fi
echo "unsigned: $bundle"
