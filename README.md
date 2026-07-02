# Progression Studio (plugin)

The corpus-driven jazz progression generator as an AUv3/AU/VST3 **MIDI
processor** (aumi): generate and curate progressions in the WebView UI —
the same code as the [music-suite webapp](https://github.com/Enkerli/music-suite)
in plugin mode — while the host plays them, strictly transport-synced
(the host's play button is the play button; tempo changes followed).
Session state (key, engine, seed, **curation profile**) persists in the
DAW session.

Built on [enkerli-juce](https://github.com/Enkerli/enkerli-juce)
(submodule): archetype settings, `BridgedWebView`, `MidiClipScheduler`,
`TransportSnapshot`.

## Build

```bash
git clone --recurse-submodules https://github.com/Enkerli/progression-studio-plugin
cmake -B build && cmake --build build      # macOS AU/VST3/Standalone
auval -v aumi Prst Enke                    # AU VALIDATION SUCCEEDED
cmake -B build-ios -G Xcode -DCMAKE_SYSTEM_NAME=iOS   # then run the
# ProgressionStudio_Standalone scheme to an iPad (launch once; the AUv3
# appears under AUM's MIDI Processor node picker — see enkerli-juce/TESTING.md)
```

`WebUI/index.html` is a committed single-file bundle generated from the
monorepo app by `node WebUI/build.mjs` — regenerate after app changes.

CC0-1.0 (transition statistics derived from Impro-Visor's imaginary-book
corpus, GPL — counts of chord changes only, attributed).

## Suite handoff

This repo is part of the Enkerli music suite. For the whole-suite picture —
repo map, conventions (leftmost-LSB bit order, structural spelling),
build/validation ladders, and open queues — start at the suite handoff:
<https://github.com/Enkerli/music-suite/blob/main/HANDOFF.md>.
