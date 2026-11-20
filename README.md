# Haengju 1593 (Game Off 2026 entry)

How long can you hold Haengju Fortress?

1593, Imjin War. With General Gwon Yul, hold the castle walls against waves of
spearmen, gunners, cavalry and samurai that grow stronger every minute.
Recruit random packs of Joseon troops and tactics with the coins you earn,
call arrow volleys, and use your commanders' ultimates. One run lasts up to
15 minutes. Plays in the browser on phone or desktop (English / Korean).

**Play:** https://bugholegames.itch.io/haengju-1593

## How this game was made

This survival mode was made in November 2026 on top of the code of our
earlier game, [History War: Imjin 1592](https://bugholegames.itch.io/history-war-imjin-1592).
It is not a game started from scratch during the jam: the survival mode
itself was built in November 2026 on that existing code base.

AI tools were used as a teammate for art, code and text (also disclosed on
the itch.io page).

This repository is a snapshot of the game source for Game Off 2026. Its git
history starts fresh here; development continues in a separate repository.
Internal QA evidence and developer machine scripts were left out of this
snapshot.

## Build

Requires [Bun](https://bun.sh).

```sh
bun install
bun run dev     # local dev server
bun run build   # type check and production build into dist/
```

Korean notes: [README.ko.md](README.ko.md)
