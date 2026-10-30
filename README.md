# Os Labirintos da Matemática

Browser restoration of **Equações do 1º grau, versão 2003**, originally by
**Roque Anderson — Softwares Educativos**.

The launcher offers two modes:

- **Recreation:** recovered maps, graphics, sound effects and MIDI music. Optional
  2×/3×/4× game speed and always `1 + 1` arithmetic; both default off.
- **Original EXE:** the unchanged executable runs inside Boxedwine WebAssembly
  with Wine 1.7.55. No game hacks. Startup may take about a minute and downloads
  roughly 62 MiB. Original MIDI output remains unverified.

After choosing a mode, the game occupies the canvas without external controls.
Enter starts, F1 opens instructions, arrow keys move, and Space fires magic.
Browser Back returns to the picker. P pauses the recreation.

## Rediscovery and original download

This project began with a childhood memory: recovering a game that seemed to
have disappeared, especially its music, and making it playable again in a browser.
During the preservation work, a surviving download was found on Só Matemática.

- [Original game ZIP on Só Matemática](https://www.somatematica.com.br/softw/labirintos.zip).
  Downloaded and verified on **2026-10-30**: the 1,035,012-byte ZIP contains a
  single `Labirintos.exe` (2,731,035 bytes), identical byte for byte to the copy
  used for this restoration.
- [Sidrêmat's article dated January 24, 2011](https://sidremat.blogspot.com/2011/01/software-labirintos-da-matematica.html)
  includes screenshots and a description, credits Roque Anderson, identifies
  the game as a 2003 release, and describes it as freeware distributed through
  Só Matemática. This is a historical third-party reference, not the author's
  own website.
- [Roque Anderson Saldanha Teixeira's 2015 UFMG dissertation, *Jogos digitais como artifício pedagógico na escola atual*](https://repositorio.ufmg.br/bitstreams/83f147af-76b0-4e3a-9783-57e05c493a42/download)
  discusses *Labirintos da Matemática* in section 6.1.2 (printed pages 46–47),
  describing its inspiration in Atari 2600's *Entombed*, equation-based doors,
  and seven stages. This documents the game's history; it does not establish
  that the dissertation's version is byte-identical to the recovered executable.

SHA-256 of both verified executable copies:

```text
f9d80e450356039c42060389120ba4ff2cbf7f320896db149c39edaa869f3a53
```

The original download was therefore still available on the verification date.
This restoration preserves that provenance alongside the browser adaptation.

Searches on **2026-10-30** for the title, executable filename, and remembered
gameplay descriptions did not identify a confirmed request to find this specific
game in indexed Reddit or lost-media forum results. Similar educational-game
requests exist, but none examined could be confidently linked to this title.
This is a limited search finding, not evidence that nobody is looking for it;
private, deleted, and unindexed discussions may not appear in search results.

## Run locally

Requires Python 3 and Node.js 24 for preparation and tests. No npm dependencies.

```sh
python3 scripts/prepare-runtime.py
npm test
npm run build
python3 serve.py
```

The runtime preparation script downloads the official emulator files and checks
all SHA-256 hashes against `emulator/manifest.json`. It packages the unchanged
`original/Labirintos.exe` for the emulator. Downloads and build output are ignored
by Git. The local server binds only to `127.0.0.1`.

## GitHub Pages

Select **Settings → Pages → Source → GitHub Actions**. The included workflow
runs the tests, verifies the emulator downloads, builds `dist/`, and deploys it
on pushes to `main`. Actions are pinned to commit hashes. The project uses
relative asset paths, including under `/labirinto-matematico/`.

## Preservation and limitations

The recreation includes seven original maze maps, the bonus, menus, and ending.
Its engine implements the action types used by this game; it is not a general
Game Maker emulator. Collision ordering, fonts, random sequences and transitions
may differ from the original. MIDI notes and tempos are preserved but the
recreation uses a Web Audio synthesizer rather than the Windows sample bank.

24 automated tests cover gameplay and optional hacks. Chrome smoke tests verified
the original executable's menu, maze startup and movement. A full seven-stage
emulator playthrough and its MIDI soundtrack have not been verified.

The site has no account system, analytics or upload service. Recreation records
stay in local browser storage. Emulated files stay in tab memory and reset on
reload. No persistence or save export is provided for EXE mode.

## Credits and licensing

This restoration does not claim authorship of the original game, artwork, music
or recovered game logic. Public availability is not a blanket open-source license
for these materials. Original rights remain with their respective owners.

The emulator dependencies retain their own licenses and notices. See
[third-party notices](emulator/THIRD_PARTY.txt), [license copies](emulator/licenses/)
and the [runtime manifest](emulator/manifest.json). The official legacy binaries
are hash-pinned; their exact source commit is not identified by the upstream
binary distribution. The historical source reference is not represented as a
verified binary/source match.
