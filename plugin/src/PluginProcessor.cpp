#include "NodeFMWebViewPlugin/PluginProcessor.h"
#include "NodeFMWebViewPlugin/PluginEditor.h"

namespace nodefm_plugin
{
    AudioPluginAudioProcessor::AudioPluginAudioProcessor()
        : AudioProcessor(BusesProperties()
#if !JucePlugin_IsMidiEffect
#if !JucePlugin_IsSynth
                             .withInput("Input", juce::AudioChannelSet::stereo(), true)
#endif
                             .withOutput("Output", juce::AudioChannelSet::stereo(), true)
#endif
          )
    {
        initialiseSpectrumRanges();
        for (auto& bin : spectrumBins)
            bin.store(0.0f, std::memory_order_relaxed);
    }

    AudioPluginAudioProcessor::~AudioPluginAudioProcessor()
    {
    }

    //==============================================================================
    const juce::String AudioPluginAudioProcessor::getName() const
    {
        return "NodeFMWebView";
    }

    bool AudioPluginAudioProcessor::acceptsMidi() const
    {
#if JucePlugin_WantsMidiInput
        return true;
#else
        return false;
#endif
    }

    bool AudioPluginAudioProcessor::producesMidi() const
    {
#if JucePlugin_ProducesMidiOutput
        return true;
#else
        return false;
#endif
    }

    bool AudioPluginAudioProcessor::isMidiEffect() const
    {
#if JucePlugin_IsMidiEffect
        return true;
#else
        return false;
#endif
    }

    double AudioPluginAudioProcessor::getTailLengthSeconds() const
    {
        return 0.0;
    }

    int AudioPluginAudioProcessor::getNumPrograms()
    {
        return 1; // NB: some hosts don't cope very well if you tell them there are 0 programs,
                  // so this should be at least 1, even if you're not really implementing programs.
    }

    int AudioPluginAudioProcessor::getCurrentProgram()
    {
        return 0;
    }

    void AudioPluginAudioProcessor::setCurrentProgram(int index)
    {
        juce::ignoreUnused(index);
    }

    const juce::String AudioPluginAudioProcessor::getProgramName(int index)
    {
        juce::ignoreUnused(index);
        return {};
    }

    void AudioPluginAudioProcessor::changeProgramName(int index, const juce::String &newName)
    {
        juce::ignoreUnused(index, newName);
    }

    //==============================================================================
    void AudioPluginAudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
    {
        synth.allocateResources(sampleRate, samplesPerBlock);
        analyserFifoIndex = 0;
        analyserFifo.fill(0.0f);
        analyserFftData.fill(0.0f);
        for (auto& bin : spectrumBins)
            bin.store(0.0f, std::memory_order_relaxed);
        reset();
    }

    void AudioPluginAudioProcessor::releaseResources()
    {
        // When playback stops, you can use this as an opportunity to free up any
        // spare memory, etc.

        synth.deAllocateResources();
    }

    void AudioPluginAudioProcessor::reset()
    {
        synth.reset();
    }

    bool AudioPluginAudioProcessor::isBusesLayoutSupported(const BusesLayout &layouts) const
    {
#if JucePlugin_IsMidiEffect
        juce::ignoreUnused(layouts);
        return true;
#else
        // This is the place where you check if the layout is supported.
        // In this template code we only support mono or stereo.
        // Some plugin hosts, such as certain GarageBand versions, will only
        // load plugins that support stereo bus layouts.
        if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono() && layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo())
            return false;

        // This checks if the input layout matches the output layout
#if !JucePlugin_IsSynth
        if (layouts.getMainOutputChannelSet() != layouts.getMainInputChannelSet())
            return false;
#endif

        return true;
#endif
    }

    void AudioPluginAudioProcessor::processBlock(juce::AudioBuffer<float> &buffer,
                                                 juce::MidiBuffer &midiMessages)
    {
        juce::ScopedNoDenormals noDenormals;
        auto totalNumInputChannels = getTotalNumInputChannels();
        auto totalNumOutputChannels = getTotalNumOutputChannels();

        for (auto i = totalNumInputChannels; i < totalNumOutputChannels; ++i)
            buffer.clear(i, 0, buffer.getNumSamples());

        splitBufferByEvents(buffer, midiMessages);

        if (buffer.getNumChannels() > 0)
        {
            const auto* output = buffer.getReadPointer(0);
            const int sampleCount = buffer.getNumSamples();
            for (int i = 0; i < sampleCount; ++i)
                pushNextSampleForAnalyser(output[i]);
        }
    }

    void AudioPluginAudioProcessor::splitBufferByEvents(juce::AudioBuffer<float> &buffer, juce::MidiBuffer &midiMessages)
    {
        int bufferOffset = 0;

        for (const auto metadata : midiMessages)
        {
            int samplesThisSegment = metadata.samplePosition - bufferOffset;
            if (samplesThisSegment > 0)
            {
                render(buffer, samplesThisSegment, bufferOffset);
                bufferOffset += samplesThisSegment;
            }
            if (metadata.numBytes <= 3)
            {
                uint8_t data1 = (metadata.numBytes >= 2) ? metadata.data[1] : 0;
                uint8_t data2 = (metadata.numBytes >= 3) ? metadata.data[2] : 0;
                handleMIDI(metadata.data[0], data1, data2);
            }
        }

        int samplesLastSegment = buffer.getNumSamples() - bufferOffset;

        if (samplesLastSegment > 0)
        {
            render(buffer, samplesLastSegment, bufferOffset);
        }

        midiMessages.clear();
    }

    void AudioPluginAudioProcessor::handleMIDI(u_int8_t data0, u_int8_t data1, u_int8_t data2)
    {

        synth.midiMessage(data0, data1, data2);
    }

    void AudioPluginAudioProcessor::render(juce::AudioBuffer<float> &buffer, int sampleCount, int bufferOffset)
    {
        float *outputBuffers[2] = {nullptr, nullptr};
        outputBuffers[0] = buffer.getWritePointer(0) + bufferOffset;
        if (getTotalNumOutputChannels() > 1)
        {
            outputBuffers[1] = buffer.getWritePointer(1) + bufferOffset;
        }

        synth.render(outputBuffers, sampleCount);
    }

    NodeID AudioPluginAudioProcessor::addNode(const juce::String &nodeType, const juce::var &data)
    {
        return synth.addNodeToGraph(nodeType, data);
    }

    bool AudioPluginAudioProcessor::removeNode(NodeID nodeId)
    {
        return synth.removeNodeFromGraph(nodeId);
    }

    void AudioPluginAudioProcessor::addConnection(NodeID sourceId, NodeID destId, float amount, ConnectionType type)
    {
        synth.addConnection(sourceId, destId, amount, type);
    }

    bool AudioPluginAudioProcessor::removeConnection(NodeID sourceId, NodeID destId, ConnectionType type)
    {
        return synth.removeConnection(sourceId, destId, type);
    }

    void AudioPluginAudioProcessor::updateNodeParameter(NodeID nodeId, const juce::String &paramName, float value)
    {
        synth.updateNodeParameter(nodeId, paramName, value);
    }

    void AudioPluginAudioProcessor::updateNodePosition(NodeID nodeId, float x, float y)
    {
        synth.updateNodePosition(nodeId, x, y);
    }

    void AudioPluginAudioProcessor::updateConnectionAmount(NodeID sourceId, NodeID destId, float amount)
    {
        synth.updateConnectionAmount(sourceId, destId, amount);
    }

    void AudioPluginAudioProcessor::sendEventToUI(const juce::String &eventType, const juce::var &data)
    {
        if (auto *editor = getActiveEditor())
        {
            if (auto *editorCast = dynamic_cast<AudioPluginAudioProcessorEditor *>(editor))
            {
                editorCast->sendMessageToJS(eventType, data);
            }
        }
    }

    NodeID AudioPluginAudioProcessor::getOutputNodeID() const
    {
        return synth.getOutputNodeID();
    }

    NodeID AudioPluginAudioProcessor::getOperatorNodeID() const
    {
        return synth.getOperatorNodeID();
    }

    NodeID AudioPluginAudioProcessor::clearGraph()
    {
        return synth.clearGraph();
    }
    
    juce::var AudioPluginAudioProcessor::getGraphSnapshotForUI() const
    {
        return synth.createGraphSnapshotForUI();
    }

    juce::var AudioPluginAudioProcessor::getSpectrumForUI() const
    {
        juce::Array<juce::var> bins;
        bins.ensureStorageAllocated(spectrumBinCount);
        for (const auto& bin : spectrumBins)
            bins.add(bin.load(std::memory_order_relaxed));

        return juce::var(bins);
    }

    void AudioPluginAudioProcessor::initialiseSpectrumRanges() noexcept
    {
        const int nyquistBin = fftSize / 2;

        for (int i = 0; i < spectrumBinCount; ++i)
        {
            const float startNorm = static_cast<float>(i) / static_cast<float>(spectrumBinCount);
            const float endNorm = static_cast<float>(i + 1) / static_cast<float>(spectrumBinCount);

            const int startBin = juce::jlimit(
                1,
                nyquistBin - 1,
                static_cast<int>((startNorm * startNorm) * static_cast<float>(nyquistBin - 1))
            );

            const int endBin = juce::jlimit(
                startBin + 1,
                nyquistBin,
                static_cast<int>((endNorm * endNorm) * static_cast<float>(nyquistBin))
            );

            spectrumStartBins[(size_t)i] = startBin;
            spectrumEndBins[(size_t)i] = endBin;
        }
    }

    void AudioPluginAudioProcessor::pushNextSampleForAnalyser(float sample) noexcept
    {
        analyserFifo[analyserFifoIndex++] = sample;

        if (analyserFifoIndex >= fftSize)
        {
            analyserFifoIndex = 0;
            updateAnalyserSpectrum();
        }
    }

    void AudioPluginAudioProcessor::updateAnalyserSpectrum() noexcept
    {
        for (int i = 0; i < fftSize; ++i)
            analyserFftData[i] = analyserFifo[(size_t)i];

        for (int i = fftSize; i < fftSize * 2; ++i)
            analyserFftData[i] = 0.0f;

        window.multiplyWithWindowingTable(analyserFftData.data(), fftSize);
        forwardFFT.performFrequencyOnlyForwardTransform(analyserFftData.data());

        constexpr float minDb = -90.0f;
        constexpr float maxDb = 0.0f;
        constexpr float smoothKeep = 0.82f;
        constexpr float smoothAdd = 0.18f;

        for (int i = 0; i < spectrumBinCount; ++i)
        {
            const int startBin = spectrumStartBins[(size_t)i];
            const int endBin = spectrumEndBins[(size_t)i];

            float peak = 0.0f;
            for (int bin = startBin; bin < endBin; ++bin)
                peak = juce::jmax(peak, analyserFftData[(size_t)bin]);

            const float db = juce::Decibels::gainToDecibels(peak / static_cast<float>(fftSize), minDb);
            const float normalized = juce::jlimit(0.0f, 1.0f, juce::jmap(db, minDb, maxDb, 0.0f, 1.0f));

            const float previous = spectrumBins[(size_t)i].load(std::memory_order_relaxed);
            spectrumBins[(size_t)i].store(previous * smoothKeep + normalized * smoothAdd, std::memory_order_relaxed);
        }
    }

    //==============================================================================
    bool AudioPluginAudioProcessor::hasEditor() const
    {
        return true; // (change this to false if you choose to not supply an editor)
    }

    juce::AudioProcessorEditor *AudioPluginAudioProcessor::createEditor()
    {
        return new AudioPluginAudioProcessorEditor(*this);
    }

    //==============================================================================
    void AudioPluginAudioProcessor::getStateInformation(juce::MemoryBlock &destData)
    {
        auto pluginState = std::make_unique<juce::XmlElement>("NODEFM_PLUGIN_STATE");
        auto graphState = std::make_unique<juce::XmlElement>(synth.createStateXml());
        pluginState->addChildElement(graphState.release());
        copyXmlToBinary(*pluginState, destData);
    }

    void AudioPluginAudioProcessor::setStateInformation(const void *data, int sizeInBytes)
    {
        const auto pluginState = getXmlFromBinary(data, sizeInBytes);
        if (pluginState == nullptr || !pluginState->hasTagName("NODEFM_PLUGIN_STATE"))
            return;

        if (const auto* graphState = pluginState->getChildByName("DSP_GRAPH_STATE"))
        {
            if (synth.loadStateXml(*graphState))
            {
                sendEventToUI("GRAPH_STATE_SYNC", synth.createGraphSnapshotForUI());
            }
        }
    }

} // namespace nodefm_plugin

//==============================================================================
// This creates new instances of the plugin..
juce::AudioProcessor *JUCE_CALLTYPE createPluginFilter()
{
    return new nodefm_plugin::AudioPluginAudioProcessor();
}