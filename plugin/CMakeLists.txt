cmake_minimum_required(VERSION 3.22 FATAL_ERROR)

if(APPLE AND NOT CMAKE_OSX_ARCHITECTURES)
    # Default to Apple Silicon unless explicitly overridden at configure time.
    set(CMAKE_OSX_ARCHITECTURES "arm64" CACHE STRING "macOS build architectures" FORCE)
endif()

project(NodeFMWebView VERSION 0.1.0)

set(NODEFM_PLUGIN_NAME "NodeFMWebView")
set(NODEFM_BUNDLE_ID "com.FractalAudio.NodeFMWebView")

set(NODEFM_UI_USE_SOURCE_FILES_DEFAULT OFF)
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
    set(NODEFM_UI_USE_SOURCE_FILES_DEFAULT ON)
endif()

option(NODEFM_UI_USE_SOURCE_FILES "Load the UI directly from the source tree instead of bundle resources" ${NODEFM_UI_USE_SOURCE_FILES_DEFAULT})


juce_add_plugin(${PROJECT_NAME}
    COMPANY_NAME "FractalAudio"
    BUNDLE_ID ${NODEFM_BUNDLE_ID}
    PRODUCT_NAME ${NODEFM_PLUGIN_NAME}
    IS_SYNTH TRUE
    NEEDS_MIDI_INPUT TRUE
    NEEDS_MIDI_OUTPUT FALSE
    PLUGIN_MANUFACTURER_CODE FRAC
    PLUGIN_CODE NDFM
    IS_MIDI_EFFECT FALSE
    VST3_CATEGORIES Instrument|Synth
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

target_compile_definitions(${PROJECT_NAME}
PRIVATE
    NODEFM_UI_SOURCE_DIR="${CMAKE_CURRENT_SOURCE_DIR}/ui/public"
    NODEFM_UI_USE_SOURCE_FILES=$<BOOL:${NODEFM_UI_USE_SOURCE_FILES}>
)

if(APPLE)
    find_program(CODESIGN_EXECUTABLE codesign)

    foreach(fmtTarget IN ITEMS ${PROJECT_NAME}_VST3 ${PROJECT_NAME}_AU ${PROJECT_NAME}_Standalone)
        if(TARGET ${fmtTarget})
            add_custom_command(TARGET ${fmtTarget} POST_BUILD
                COMMAND ${CMAKE_COMMAND} -E copy_directory
                    "${CMAKE_CURRENT_SOURCE_DIR}/ui/public"
                    "$<TARGET_BUNDLE_CONTENT_DIR:${fmtTarget}>/Resources/ui/public"
            )

            if(CODESIGN_EXECUTABLE)
                add_custom_command(TARGET ${fmtTarget} POST_BUILD
                    COMMAND ${CODESIGN_EXECUTABLE} --force --deep --sign - --timestamp=none
                        "$<TARGET_BUNDLE_DIR:${fmtTarget}>"
                )
            endif()
        endif()
    endforeach()
endif()

file(COPY "${CMAKE_CURRENT_SOURCE_DIR}/../libs/juce/modules/juce_gui_extra/native/javascript/"
DESTINATION "${CMAKE_CURRENT_SOURCE_DIR}/ui/public/js/juce/"
)