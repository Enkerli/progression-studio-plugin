#pragma once
#include "PluginProcessor.h"
#include "../enkerli-juce/src/EnkerliWebView.h"
#include "../enkerli-juce/src/FileExport.h"
#include "../enkerli-juce/src/RuntimeInfo.h"
#include "BinaryDataWebUI.h"

class ProgressionStudioEditor : public juce::AudioProcessorEditor,
                                private juce::Timer
{
public:
    explicit ProgressionStudioEditor (ProgressionStudioProcessor& p)
        : juce::AudioProcessorEditor (p),
          proc (p),
          web (
              { { "/index.html", { BinaryData::index_html, BinaryData::index_htmlSize, "text/html; charset=utf-8" } } },
              {
                  { "uiReady", [this] (const juce::var&) { pageReady = true; sendSavedState(); } },
                  { "enkerliSetClip", [this] (const juce::var& v) { applyClip (v); } },
                  { "enkerliClearClip", [this] (const juce::var&) { proc.scheduler.clear(); } },
                  { "enkerliState", [this] (const juce::var& v) { proc.storeUiState (juce::JSON::toString (v)); } },
                  { "enkerliSaveFile", [this] (const juce::var& v) { saveFile (v); } },
              })
    {
        addAndMakeVisible (web);
        web.start();
        setSize (900, 700);
        setResizable (true, true);
        startTimerHz (10); // chord-follow wants snappier than the old 4 Hz
    }

    void resized() override { web.setBounds (getLocalBounds()); }

private:
    void sendSavedState()
    {
        const auto json = proc.loadUiState();
        if (json.isEmpty())
            return;
        const auto state = juce::JSON::parse (json);
        if (! state.isVoid())
            web.emit ("state", state);
    }

    // WKWebView can't download (TESTING.md: "Frame load interrupted") —
    // the UI sends bytes over the bridge and we save them natively.
    void saveFile (const juce::var& v)
    {
        const auto name = v.getProperty ("name", "export.bin").toString()
                              .replaceCharacters ("/\\:", "---");
        juce::MemoryOutputStream decoded;
        if (! juce::Base64::convertFromBase64 (decoded, v.getProperty ("b64", "").toString()))
            return;
        enkerli::exportBytes (*this, name, decoded.getMemoryBlock());
    }

    void applyClip (const juce::var& v)
    {
        enkerli::MidiClipScheduler::Clip clip;
        clip.lengthBeats = static_cast<double> (v.getProperty ("lengthBeats", 0.0));
        clip.loop = static_cast<bool> (v.getProperty ("loop", true));
        if (auto* arr = v.getProperty ("notes", juce::var()).getArray())
        {
            for (const auto& n : *arr)
            {
                enkerli::ClipNote note;
                note.startBeat = static_cast<double> (n.getProperty ("startBeat", 0.0));
                note.lengthBeats = static_cast<double> (n.getProperty ("lengthBeats", 1.0));
                note.pitch = static_cast<int> (n.getProperty ("pitch", 60));
                note.velocity = static_cast<int> (n.getProperty ("velocity", 96));
                note.channel = juce::jlimit (1, 16, static_cast<int> (n.getProperty ("channel", 1)));
                clip.notes.push_back (note);
            }
        }
        // Strict host sync: the host's play button is the play button.
        proc.scheduler.setClip (std::move (clip));
    }

    void timerCallback() override
    {
        if (! pageReady)
            return;
        auto* obj = new juce::DynamicObject();
        obj->setProperty ("bpm", proc.transport.getBpm());
        obj->setProperty ("playing", proc.transport.isPlaying());
        obj->setProperty ("beat", proc.scheduler.getClipBeat()); // chord-follow
        web.emit ("transport", juce::var (obj));

        if (++runtimeTick % 20 == 0) // every ~2 s at 10 Hz
            web.emit ("runtime", enkerli::RuntimeInfo::snapshot (proc));

        // Forward any incoming MIDI note events (chord input) as a batch.
        proc.midiIn.drain (midiInBuf);
        if (! midiInBuf.empty())
        {
            juce::Array<juce::var> arr;
            for (const auto& e : midiInBuf)
            {
                auto* n = new juce::DynamicObject();
                n->setProperty ("note", e.note);
                n->setProperty ("velocity", e.velocity);
                n->setProperty ("on", e.isOn);
                arr.add (juce::var (n));
            }
            auto* obj = new juce::DynamicObject();
            obj->setProperty ("notes", arr);
            web.emit ("midiNotes", juce::var (obj));
        }
    }

    ProgressionStudioProcessor& proc;
    enkerli::BridgedWebView web;
    bool pageReady = false;
    int runtimeTick = 0;
    std::vector<enkerli::MidiNoteEvent> midiInBuf;
};

inline juce::AudioProcessorEditor* ProgressionStudioProcessor::createEditor()
{
    return new ProgressionStudioEditor (*this);
}
