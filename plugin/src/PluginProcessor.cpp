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

    void AudioPluginAudioProcessor::addConnection(NodeID sourceId, NodeID destId, float amount)
    {
        synth.addConnection(sourceId, destId, amount);
    }

    void AudioPluginAudioProcessor::updateNodeParameter(NodeID nodeId, const juce::String& paramName, float value)
    {
        synth.updateNodeParameter(nodeId, paramName, value);
    }

    void AudioPluginAudioProcessor::updateConnectionAmount(NodeID sourceId, NodeID destId, float amount)
    {
        synth.updateConnectionAmount(sourceId, destId, amount);
    }

    void AudioPluginAudioProcessor::sendEventToUI(const juce::String& eventType, const juce::var& data)
    {
        if (auto* editor = getActiveEditor())
        {
            if (auto* editorCast = dynamic_cast<AudioPluginAudioProcessorEditor*>(editor))
            {
                editorCast->sendMessageToJS(eventType, data);
            }
        }
    }

    NodeID AudioPluginAudioProcessor::getOutputNodeID() const
    {
        return synth.getOutputNodeID();
    }
    
    NodeID AudioPluginAudioProcessor::clearGraph()
    {
        return synth.clearGraph();
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
        // You should use this method to store your parameters in the memory block.
        // You could do that either as raw data, or use the XML or ValueTree classes
        // as intermediaries to make it easy to save and load complex data.
        juce::ignoreUnused(destData);
    }

    void AudioPluginAudioProcessor::setStateInformation(const void *data, int sizeInBytes)
    {
        // You should use this method to restore your parameters from this memory block,
        // whose contents will have been created by the getStateInformation() call.
        juce::ignoreUnused(data, sizeInBytes);
    }
}

//==============================================================================
// This creates new instances of the plugin..
juce::AudioProcessor *JUCE_CALLTYPE createPluginFilter()
{
    return new nodefm_plugin::AudioPluginAudioProcessor();
}