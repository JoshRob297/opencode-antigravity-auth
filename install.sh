#!/usr/bin/env bash
# Install Antigravity Auth - Reloaded into OpenCode without npm and without git.
#
#   curl -fsSL https://raw.githubusercontent.com/JoshRob297/opencode-antigravity-auth/main/install.sh | bash
#   curl -fsSL .../install.sh | bash -s -- v2.8.1     # pin a version
#   ./install.sh v2.8.1                               # or run it from a clone
#
# OpenCode's own installer cannot prepare git dependencies (`git dep preparation
# failed`), and this plugin does not live on npm, so the release tarball is the
# way in. Nothing here needs node, npm or git: curl and tar are enough.
set -euo pipefail

REPO="JoshRob297/opencode-antigravity-auth"
VERSION="${1:-}"
DEST="${OPENCODE_ANTIGRAVITY_HOME:-$HOME/.local/share/opencode-antigravity-auth}"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
CONFIG="$CONFIG_DIR/opencode.json"

say() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || die "curl is required"
command -v tar >/dev/null 2>&1 || die "tar is required"

if [ -z "$VERSION" ]; then
    VERSION=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null \
        | sed -n 's/.*"tag_name": *"v\{0,1\}\([^"]*\)".*/\1/p' | head -1)
    [ -n "$VERSION" ] || die "could not read the latest release — pass one: install.sh v2.8.1"
fi
VERSION="${VERSION#v}"

URL="https://github.com/$REPO/releases/download/v$VERSION/opencode-antigravity-auth-$VERSION.tgz"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

say "Antigravity Auth $VERSION"
say "  downloading $URL"
curl -fsSL -o "$TMP/plugin.tgz" "$URL" || die "download failed — does v$VERSION exist?"

tar -xzf "$TMP/plugin.tgz" -C "$TMP" 2>/dev/null || die "the archive did not unpack"
[ -f "$TMP/package/dist/index.js" ] || die "the archive has no dist/index.js — is that a release tarball?"

rm -rf "$DEST"
mkdir -p "$DEST"
cp -a "$TMP/package" "$DEST/package"
PLUGIN_PATH="$DEST/package"
say "  files       $PLUGIN_PATH"

mkdir -p "$CONFIG_DIR"

MAJOR=""
if command -v opencode >/dev/null 2>&1; then
    MAJOR=$(opencode --version 2>/dev/null | sed -n 's/^\([0-9]*\)\..*/\1/p' | head -1)
fi

if command -v python3 >/dev/null 2>&1; then
    OPENCODE_MAJOR="$MAJOR" python3 - "$CONFIG" "$PLUGIN_PATH" <<'PY'
import json, os, sys

path, plugin = sys.argv[1], sys.argv[2]
data = {}
if os.path.exists(path):
    try:
        with open(path) as fh:
            data = json.load(fh) or {}
    except Exception:
        sys.exit("error: %s is not valid JSON — fix it and run again" % path)
    if not isinstance(data, dict):
        sys.exit("error: %s does not hold a JSON object" % path)

# OpenCode v1 reads "plugin", v2 reads "plugins". An existing key wins so the
# installer never turns a working config into one the running version ignores.
if "plugins" in data:
    key = "plugins"
elif "plugin" in data:
    key = "plugin"
elif (os.environ.get("OPENCODE_MAJOR") or "").isdigit() and int(os.environ["OPENCODE_MAJOR"]) >= 2:
    key = "plugins"
else:
    key = "plugin"

entries = data.get(key) or []
if isinstance(entries, str):
    entries = [entries]
entries = [
    e for e in entries
    if not (isinstance(e, str) and ("opencode-antigravity-auth" in e or "antigravity" in e))
]
entries.append(plugin)
data[key] = entries

with open(path, "w") as fh:
    json.dump(data, fh, indent=2)
    fh.write("\n")
print("  config      %s (%s)" % (path, key))

stale = [e for e in entries[:-1] if isinstance(e, str) and e.startswith("/")]
if stale:
    print("  note        these entries load another copy — remove them if they point to it:")
    for e in stale:
        print("                %s" % e)
PY
else
    say ""
    say "python3 is not available, so add this by hand to $CONFIG:"
    say "  \"plugin\": [\"$PLUGIN_PATH\"]"
fi

say ""
say "Done. Next:"
say "  1. opencode auth login     # choose Antigravity, finish the browser flow"
say "  2. opencode models         # the antigravity models should now be listed"
say ""
say "Re-run this script to upgrade; it replaces $DEST."
