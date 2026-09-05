# Cursor skills (any repo)

From the **workflow-skills** clone root:

```bash
chmod +x skills/install.sh
./skills/install.sh
```

That symlinks into `~/.cursor/skills/`. Start a new Cursor chat afterward.

| Folder | Invoke when |
|--------|-------------|
| [design-system-3-level](design-system-3-level/SKILL.md) | 3-level token system |
| [design-system-2-level](design-system-2-level/SKILL.md) | 2-level token system |
| [css-modules](css-modules/SKILL.md) | Per-component CSS |
| [token-inspect](token-inspect/SKILL.md) | Config + Push writer |
| [svg](svg/SKILL.md) | Paste path data; size xs/sm/md/lg (16/20/24/32px) |

Writer (from the **app** root, not this folder):

```bash
node ~/.cursor/skills/token-inspect/scripts/writer.mjs
```

Chrome: load unpacked `../extension/` from the clone. Full commands: [README.md](../README.md).
