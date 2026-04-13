#pragma once
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_dsp/juce_dsp.h>
#include <array>
#include <atomic>
#include <vector>
#include "Synth.h"
#include "graph/GraphTypes.h"

namespace nodefm_plugin
{
    class AudioPluginAudioProcessor final : public juce::AudioProcessor,
                                            private juce::AudioProcessorParameter::Listener
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

        NodeID addNode(const juce::String& nodeType, const juce::var& data);
        bool removeNode(NodeID nodeId);
        void addConnection(NodeID sourceId, NodeID destId, float amount, ConnectionType type = ConnectionType::modulation);
        bool removeConnection(NodeID sourceId, NodeID destId, ConnectionType type = ConnectionType::modulation);
        void updateNodeParameter(NodeID nodeId, const juce::String& paramName, float value);
        void updateNodePosition(NodeID nodeId, float x, float y);
        void updateConnectionAmount(NodeID sourceId, NodeID destId, float amount);
        void sendEventToUI(const juce::String& eventType, const juce::var& data);
        NodeID getOutputNodeID() const;
        NodeID getOperatorNodeID() const;
        NodeID clearGraph();
        juce::var getGraphSnapshotForUI() const;
        juce::var getSpectrumForUI() const;
        void updateOutputGain(float gain);
        float getOutputGain() const noexcept;

        struct PendingAutomationUiUpdate
        {
            NodeID nodeId = 0;
            juce::String paramName;
            float value = 0.0f;
        };

        std::vector<PendingAutomationUiUpdate> popPendingAutomationUiUpdates();


    private:
        struct LearnedParameterTarget
        {
            bool assigned = false;
            NodeID nodeId = 0;
            juce::String paramName;
            juce::NormalisableRange<float> range { 0.0f, 1.0f };
        };

        static constexpr int maxAutomationSlots = 16;

        static constexpr int fftOrder = 10;
        static constexpr int fftSize = 1 << fftOrder;
        static constexpr int spectrumBinCount = 32;

        Synth synth;
        juce::dsp::FFT forwardFFT{fftOrder};
        juce::dsp::WindowingFunction<float> window{fftSize, juce::dsp::WindowingFunction<float>::hann};
        std::array<float, fftSize> analyserFifo{};
        std::array<float, fftSize * 2> analyserFftData{};
        int analyserFifoIndex = 0;
        std::array<std::atomic<float>, spectrumBinCount> spectrumBins{};
        std::array<int, spectrumBinCount> spectrumStartBins{};
        std::array<int, spectrumBinCount> spectrumEndBins{};
        std::atomic<float> outputGain { 1.0f };
        std::array<juce::AudioParameterFloat*, maxAutomationSlots> automationParameters{};
        std::array<LearnedParameterTarget, maxAutomationSlots> learnedParameterTargets{};
        juce::SpinLock automationLock;
        juce::SpinLock pendingAutomationUpdatesLock;
        std::vector<PendingAutomationUiUpdate> pendingAutomationUiUpdates;
        std::atomic<bool> suppressAutomationCallbacks { false };

        void splitBufferByEvents(juce::AudioBuffer<float> &buffer, juce::MidiBuffer &midiMessages);
        void handleMIDI(uint8_t data0, u_int8_t data1, u_int8_t data2);
        void render(juce::AudioBuffer<float> &buffer, int sampleCount, int bufferOffset);
        void pushNextSampleForAnalyser(float sample) noexcept;
        void initialiseSpectrumRanges() noexcept;
        void updateAnalyserSpectrum() noexcept;
        void initialiseAutomationParameters();
        int findOrAssignAutomationSlot(NodeID nodeId, const juce::String& paramName, const juce::NormalisableRange<float>& range);
        void pushNodeParameterToHost(NodeID nodeId, const juce::String& paramName, float value);
        void applyAutomationSlotValue(int slotIndex, float normalizedValue);
        void releaseAutomationMappingsForNode(NodeID nodeId);
        void resetAutomationMappings();
        juce::String buildAutomationLabel(NodeID nodeId, const juce::String& paramName) const;
        juce::NormalisableRange<float> getRangeForParameterName(const juce::String& paramName) const;
        std::unique_ptr<juce::XmlElement> createAutomationStateXml();
        void loadAutomationStateXml(const juce::XmlElement* automationState);

        void parameterValueChanged(int parameterIndex, float newValue) override;
        void parameterGestureChanged(int parameterIndex, bool gestureIsStarting) override;
        //==============================================================================
        JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(AudioPluginAudioProcessor)
    };
}