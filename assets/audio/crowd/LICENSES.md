# assets/audio/crowd

The crowd: the bed (ambience), cheers, groans, "oohs", boos, murmurs.

Every file in this folder needs a row below before tools/audio/pack.js will pack it: the file, where it came
from (a link), who made it, and its license. Only licenses the game can ship are accepted: CC0 or public domain,
CC BY (credit the author in the row), the Pixabay Content License (the edited sound inside the game, never the
download on its own), or made by this project. CC BY-NC, BY-ND and BY-SA, "personal use", "royalty free but no
redistribution" (the Sonniss GDC bundles, the BBC archive) and anything unclear are out.

The beds (`bed.murmur`, `bed.cheer`) are loops cut from a download by tools/audio/cut.js following cuts.json (the
download itself is not in the repository). A crowd reaction's file is named for it (`roar_01`, `ooh_01`...), so a
bed's name must never be one of those.

| File | Source | Author | License |
| --- | --- | --- | --- |
| `bed.murmur_01.mp3` | Pixabay sound effect "fans at basketball game crowd" (https://pixabay.com/sound-effects/fans-at-basketball-game-crowd-5859/), a 20 s loop of the stretches 44.5-47.4, 48.2-54.0, 66.0-71.8, 92.4-102.4 s, made by tools/audio/cut.js | freesound_community (Pixabay) | Pixabay Content License (https://pixabay.com/service/license-summary/): free for commercial use, no credit needed; edited and inside the game, never the download on its own |
| `bed.cheer_01.mp3` | Pixabay sound effect "fans at basketball game crowd" (https://pixabay.com/sound-effects/fans-at-basketball-game-crowd-5859/), a 22 s loop of the stretches 0.5-16.5, 55.5-64.8 s, made by tools/audio/cut.js | freesound_community (Pixabay) | Pixabay Content License (https://pixabay.com/service/license-summary/): free for commercial use, no credit needed; edited and inside the game, never the download on its own |
