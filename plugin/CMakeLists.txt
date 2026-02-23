cmake_minimum_required(VERSION 3.22 FATAL_ERROR)

project(NodeFMWebView VERSION 0.1.0)


juce_add_plugin(${PROJECT_NAME}
    COMPANY_NAME "FractalAudio"
    IS_SYNTH TRUE
    NEEDS_MIDI_INPUT TRUE
    NEEDS_MIDI_OUTPUT FALSE
    PLUGIN_MANUFACTURER_CODE FRAC
    PLUGIN_CODE NGFM
    IS_MIDI_EFFECT FALSE
    FORMATS VST3 AU Standalone
)

get_target_property(PRODUCT_NAME NodeFMWebView JUCE_PRODUCT_NAME)

target_compile_definitions(${PROJECT_NAME}
    PRIVATE
        JUCE_PRODUCT_NAME="${PRODUCT_NAME}"
)

target_sources(${PROJECT_NAME}
PRIVATE
    src/PluginEditor.cpp
    src/PluginProcessor.cpp
    src/Synth.cpp
    src/DSPGraph.cpp
)

target_include_directories(
    ${PROJECT_NAME} PRIVATE include
)

target_link_libraries(${PROJECT_NAME}
PRIVATE
    juce::juce_audio_utils
PUBLIC
    juce::juce_recommended_config_flags
    juce::juce_recommended_lto_flags
    juce::juce_recommended_warning_flags)

target_compile_definitions(${PROJECT_NAME} 
PUBLIC 
    JUCE_WEB_BROWSER=1
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0
)

file(COPY "${CMAKE_CURRENT_SOURCE_DIR}/../libs/juce/modules/juce_gui_extra/native/javascript/"
DESTINATION "${CMAKE_CURRENT_SOURCE_DIR}/ui/public/js/juce/"
)