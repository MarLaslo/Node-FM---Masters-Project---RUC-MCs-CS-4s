juce_add_plugin(NodeFMWebViewPlugin
    COMPANY_NAME "FractalAudio"
    IS_SYNTH TRUE
    NEEDS_MIDI_INPUT TRUE
    NEEDS_MIDI_OUTPUT FALSE
    PLUGIN_MANUFACTURER_CODE FRAC
    PLUGIN_CODE NGFM
    IS_MIDI_EFFECT FALSE
    FORMATS VST3 AU Standalone
)

target_sources(NodeFMWebViewPlugin
PRIVATE
    src/PluginEditor.cpp
    src/PluginProcessor.cpp
)

target_include_directories(
    NodeFMWebViewPlugin PRIVATE include
)

target_link_libraries(NodeFMWebViewPlugin
PRIVATE
    juce::juce_audio_utils
PUBLIC
    juce::juce_recommended_config_flags
    juce::juce_recommended_lto_flags
    juce::juce_recommended_warning_flags)

target_compile_definitions(NodeFMWebViewPlugin 
PUBLIC 
    JUCE_WEB_BROWSER=1
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0
)

file(COPY "${CMAKE_CURRENT_SOURCE_DIR}/../libs/juce/modules/juce_gui_extra/native/javascript/"
DESTINATION "${CMAKE_CURRENT_SOURCE_DIR}/ui/public/js/juce/"
)