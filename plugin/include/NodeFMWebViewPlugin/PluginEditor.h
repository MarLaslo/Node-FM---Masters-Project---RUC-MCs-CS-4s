#pragma once

#include "NodeFMWebViewPlugin/PluginProcessor.h"
#include <juce_gui_extra/juce_gui_extra.h>
namespace nodefm_plugin
{
    class AudioPluginAudioProcessorEditor final : public juce::AudioProcessorEditor,
                                                  private juce::Timer
    {
    public:
        explicit AudioPluginAudioProcessorEditor(AudioPluginAudioProcessor &);
        ~AudioPluginAudioProcessorEditor() override;

        void prepareForShutdown();

        void resized() override;
        void sendMessageToJS(const juce::String& eventType, const juce::var& data);

    private:
        using Resource = juce::WebBrowserComponent::Resource;
        std::optional<Resource> getResource(const juce::String &url);
        juce::File findUIResourceRoot() const;
        void sendCurrentGraphToUI();
        // This reference is provided as a quick way for your editor to
        // access the processor object that created it.
        AudioPluginAudioProcessor &processorRef;

        void handleMessageFromJS(const juce::String& message);
        void timerCallback() override;
        juce::WebBrowserComponent webView;
        bool shuttingDown = false;

        JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(AudioPluginAudioProcessorEditor)
    };
}