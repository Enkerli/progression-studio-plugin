#pragma once
#include "PluginProcessor.h"
#include "../enkerli-juce/src/EnkerliWebView.h"
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
              })
    {
        addAndMakeVisible (web);
        web.start();
        setSize (900, 700);
        setResizable (true, true);
        startTimerHz (4);
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
        web.emit ("transport", juce::var (obj));

        if (++runtimeTick % 8 == 0) // every ~2 s at 4 Hz
            web.emit ("runtime", enkerli::RuntimeInfo::snapshot (proc));
    }

    ProgressionStudioProcessor& proc;
    enkerli::BridgedWebView web;
    bool pageReady = false;
    int runtimeTick = 0;
};

inline juce::AudioProcessorEditor* ProgressionStudioProcessor::createEditor()
{
    return new ProgressionStudioEditor (*this);
}
