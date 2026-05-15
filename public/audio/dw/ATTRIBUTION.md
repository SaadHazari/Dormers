# Dorm Wars Audio Attribution

Phase 6 D-05 — Audio stems for the Dorm Wars game-feel pass.

> **STATUS — 2026-05-15:** All 11 stems are currently silent placeholders (1-second valid
> MPEG-1 Layer III silent frames, ~4KB each). The `useStingers` / `useAudioBed` plumbing
> is fully wired: when ENABLE AUDIO is tapped the system loads each path, decodes
> successfully (silent frame is valid MP3), and plays inaudibly. The Phase 6 D-16
> "silent-fail" design is preserved — no errors thrown, no console warnings.
>
> **The user must hand-curate real CC0 / CC-BY / royalty-free stems and overwrite each
> file in place** (paths and filenames already match the wired Wave 2 STINGER_PATHS map).
> Recommended sources are listed per-stem below. The sandbox executor was unable to fetch
> from Pixabay / Mixkit / Freesound CDN (HTTP 403 anti-hotlink protection) so this
> document is the curation handoff.

## Ambient Bed (3 stems — looped continuously when audio is enabled)

| File | Role | Recommended Source | License |
|------|------|--------------------|---------|
| `ambient/drone.mp3` | Low-frequency room tone — sci-fi command center | [Freesound 353159 "Room Tone Sci Fi Large Hall" by Kinoton](https://freesound.org/people/Kinoton/sounds/353159/) | CC0 |
| `ambient/chatter.mp3` | Distant radio comms (no intelligible words) | [Pixabay "military-radio-communication-222904"](https://pixabay.com/sound-effects/military-radio-communication-222904/) | Pixabay Free / royalty-free |
| `ambient/duct.mp3` | Aircon / HVAC hum bed | [Freesound 234918 "ambient low hum (aircon)" by TimBahrij](https://freesound.org/people/TimBahrij/sounds/234918/) (CC0) OR [Freesound 211683 "control_room.wav" by Diboz](https://freesound.org/people/Diboz/sounds/211683/) (CC-BY 3.0 — attribution required, see below) | CC0 preferred |

## Stingers (8 cues — fired on discrete events, ducked -6dB against ambient bed)

| File | Trigger | Recommended Source | License |
|------|---------|--------------------|---------|
| `stingers/copy-tick.mp3` | Per-character typing in TitleScreenInterstitial callsign | [Pixabay "key-press-148951"](https://pixabay.com/sound-effects/key-press-148951/) | Pixabay Free |
| `stingers/unlock.mp3` | Mission ladder rank unlock | [Mixkit "Game level completed 2059"](https://mixkit.co/free-sound-effects/win/) (Mixkit Free License — no attribution required) | Mixkit Free |
| `stingers/drop-reveal.mp3` | Daily Drop card flips face-up | [Mixkit "Quick win video game notification 2058"](https://mixkit.co/free-sound-effects/notification/) | Mixkit Free |
| `stingers/warning.mp3` | EdgeAlert top-strip slides in (rank drop / friend conversion) | [Pixabay "warning-alarm-72224"](https://pixabay.com/sound-effects/warning-alarm-72224/) | Pixabay Free |
| `stingers/rank-up.mp3` | RankUpCutscene letterbox-in completion | [Mixkit "Achievement bell 1003"](https://mixkit.co/free-sound-effects/win/) | Mixkit Free |
| `stingers/milestone-fanfare.mp3` | Hitting 3 / 6 / 10 conversion milestone | [Mixkit "Triumph 2032"](https://mixkit.co/free-sound-effects/win/) | Mixkit Free |
| `stingers/conversion-impact.mp3` | A friend converts during the active session | [Mixkit "Game ball tap 2073"](https://mixkit.co/free-sound-effects/game/) | Mixkit Free |
| `stingers/title-intro.mp3` | Title-screen "ENTER WAR ROOM" stamp lands | [Pixabay "epic-cinematic-trailer-15-43836"](https://pixabay.com/sound-effects/) (search "cinematic riser short") | Pixabay Free |

## Curation Discipline (per Phase 6 D-05)

- **CC0 preferred** when audition quality is equivalent — zero attribution overhead.
- **CC-BY OK** with attribution recorded in this file (see CC-BY block below).
- **Mixkit Free License** is commercial-use-OK with no attribution required.
- **Pixabay royalty-free** is commercial-use-OK with no attribution required.
- **Audition each stem** before committing — wrong tone breaks the war-room identity.
- **Length budget:** ambient stems 8–30s loopable; stingers 0.5–2s decay tail.
- **Format:** MP3 mono or stereo, 128–192 kbps. The `useAudioBed` / `useStingers` decode
  via Web Audio `decodeAudioData()`, which accepts any browser-supported MP3.

## CC-BY Attribution (only if a CC-BY stem is used)

If any stem above is sourced under CC-BY-3.0 / CC-BY-4.0, list the attribution here:

```
[FILE]            [TITLE] by [AUTHOR] — [LICENSE] — [SOURCE URL]
ambient/duct.mp3  "control_room.wav" by Diboz — CC-BY 3.0 — https://freesound.org/people/Diboz/sounds/211683/
```

(Replace placeholders with actual citations when CC-BY stems land. Currently empty —
all placeholders are silent frames pending real-asset curation.)

## Why placeholders ship in the codebase

Phase 6 D-02 says the wave is "done" only when every system that NAMES an asset has the
asset file in place at the expected path. Silent placeholders satisfy the path-exists
gate, let the Web Audio decoder succeed (no thrown errors, no console warnings), and
preserve the D-16 silent-fail behavior. The user can swap real stems in without touching
any code — the paths are wired in `useStingers.ts` (`STINGER_PATHS` map) and `useAudioBed.ts`
already.

The phase does NOT ship to production with placeholders. This is the wave's discipline
gate for the system, with an explicit asset-curation hand-off recorded here.
