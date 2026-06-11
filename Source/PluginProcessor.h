#pragma once
#include <juce_audio_processors/juce_audio_processors.h>
#include "../enkerli-juce/src/MidiClipScheduler.h"
#include "../enkerli-juce/src/TransportSnapshot.h"

// Progression Studio plugin — the corpus-driven generator as an aumi MIDI
// processor. The WebView UI (the same web bundle as the browser app, in
// plugin mode) generates and curates; this side schedules the voiced
// progression host-synced and persists the session state.
class ProgressionStudioProcessor : public juce::AudioProcessor
{
public:
    ProgressionStudioProcessor()
        : juce::AudioProcessor (BusesProperties()) // MIDI effect: no audio buses
    {
    }

    void prepareToPlay (double newSampleRate, int) override { sampleRate = newSampleRate; }
    void releaseResources() override {}

    void processBlock (juce::AudioBuffer<float>& audio, juce::MidiBuffer& midi) override
    {
        audio.clear();
        if (audio.getNumSamples() > 0)
            lastBlockSize = audio.getNumSamples();
        transport.capture (getPlayHead());
        scheduler.process (getPlayHead(), sampleRate, lastBlockSize, midi);
    }

    void processBlock (juce::AudioBuffer<double>& audio, juce::MidiBuffer& midi) override
    {
        if (audio.getNumSamples() > 0)
            lastBlockSize = audio.getNumSamples();
        transport.capture (getPlayHead());
        scheduler.process (getPlayHead(), sampleRate, lastBlockSize, midi);
    }

    bool isMidiEffect() const override { return true; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return true; }

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return "Progression Studio"; }
    double getTailLengthSeconds() const override { return 0.0; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int) override {}
    const juce::String getProgramName (int) override { return {}; }
    void changeProgramName (int, const juce::String&) override {}

    // Session state: the web UI's full state as JSON (key, engine, seed,
    // curation profile). The DAW session carries the curated vocabulary.
    void getStateInformation (juce::MemoryBlock& dest) override
    {
        const juce::ScopedLock sl (stateLock);
        dest.replaceAll (stateJson.toRawUTF8(), stateJson.getNumBytesAsUTF8());
    }

    void setStateInformation (const void* data, int size) override
    {
        const juce::ScopedLock sl (stateLock);
        stateJson = juce::String::fromUTF8 (static_cast<const char*> (data), size);
    }

    void storeUiState (const juce::String& json)
    {
        const juce::ScopedLock sl (stateLock);
        stateJson = json;
    }

    juce::String loadUiState() const
    {
        const juce::ScopedLock sl (stateLock);
        return stateJson;
    }

    enkerli::MidiClipScheduler scheduler;
    enkerli::TransportSnapshot transport;

private:
    double sampleRate = 44100.0;
    int lastBlockSize = 512;
    juce::String stateJson;
    juce::CriticalSection stateLock;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (ProgressionStudioProcessor)
};
