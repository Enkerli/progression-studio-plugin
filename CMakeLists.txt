cmake_minimum_required(VERSION 3.22)
project(ProgressionStudio VERSION 0.1.0)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED YES)

include("${CMAKE_CURRENT_SOURCE_DIR}/enkerli-juce/cmake/EnkerliPlugin.cmake")
enkerli_resolve_juce()

enkerli_add_midi_effect_plugin(ProgressionStudio
    PRODUCT_NAME "Progression Studio"
    PLUGIN_CODE  Prst
    DESCRIPTION  "Corpus-driven jazz progression generator: 2,611 lead sheets, ear-driven curation, host-synced MIDI"
)

target_sources(ProgressionStudio PRIVATE Source/Plugin.cpp)

# The web UI: a single-file bundle generated from the music-suite monorepo
# app (apps/progression-studio) by WebUI/build.mjs. The generated file is
# committed so the plugin builds without node; regenerate after app changes.
juce_add_binary_data(ProgressionStudioWebUI
    HEADER_NAME BinaryDataWebUI.h
    NAMESPACE   BinaryData
    SOURCES     WebUI/index.html)

target_link_libraries(ProgressionStudio PRIVATE
    ProgressionStudioWebUI
    juce::juce_audio_utils
    juce::juce_gui_extra
    PUBLIC
    juce::juce_recommended_config_flags
    juce::juce_recommended_warning_flags)
