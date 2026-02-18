#pragma once
#include <juce_audio_processors/juce_audio_processors.h>
#include "Synth.h"

namespace nodefm_plugin
{
    class AudioPluginAudioProcessor final : public juce::AudioProcessor
    {
    public:
        //==============================================================================
        AudioPluginAudioProcessor();
        ~AudioPluginAudioProcessor() override;

        //==============================================================================
        void prepareToPlay(double sampleRate, int samplesPerBlock) override;
        void releaseResources() override;
        void reset() override;
        bool isBusesLayoutSupported(const BusesLayout &layouts) const override;

        void processBlock(juce::AudioBuffer<float> &, juce::MidiBuffer &) override;
        using AudioProcessor::processBlock;

        //==============================================================================
        juce::AudioProcessorEditor *createEditor() override;
        bool hasEditor() const override;

        //==============================================================================
        const juce::String getName() const override;

        bool acceptsMidi() const override;
        bool producesMidi() const override;
        bool isMidiEffect() const override;
        double getTailLengthSeconds() const override;

        //==============================================================================
        int getNumPrograms() override;
        int getCurrentProgram() override;
        void setCurrentProgram(int index) override;
        const juce::String getProgramName(int index) override;
        void changeProgramName(int index, const juce::String &newName) override;

        //==============================================================================
        void getStateInformation(juce::MemoryBlock &destData) override;
        void setStateInformation(const void *data, int sizeInBytes) override;

    private:
        Synth synth;
        void splitBufferByEvents(juce::AudioBuffer<float> &buffer, juce::MidiBuffer &midiMessages);
        void handleMIDI(uint8_t data0, u_int8_t data1, u_int8_t data2);
        void render(juce::AudioBuffer<float> &buffer, int sampleCount, int bufferOffset);
        //==============================================================================
        JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(AudioPluginAudioProcessor)
    };
}