#include "NodeFMWebViewPlugin/PluginProcessor.h"
#include "NodeFMWebViewPlugin/PluginEditor.h"

namespace
{
    constexpr int slotNumberWidth = 2;
    constexpr const char* outputGainStateAttribute = "outputGain";

    juce::String canonicalizeParameterName(const juce::String& paramName)
    {
        const auto key = paramName.toLowerCase();

        if (key == "frequencyratio" || key == "ratio")
            return "frequencyRatio";
        if (key == "velocityamount" || key == "velocity" || key == "vel")
            return "velocityAmount";
        if (key == "pitchenvamount" || key == "pitchamount" || key == "pitchmodamount")
            return "pitchEnvAmount";
        if (key == "pitchattack" || key == "pitchenvelopeattack")
            return "pitchAttack";
        if (key == "pitchdecay" || key == "pitchenvelopedecay")
            return "pitchDecay";
        if (key == "pitchsustain" || key == "pitchenvelopesustain")
            return "pitchSustain";
        if (key == "pitchrelease" || key == "pitchenveloperelease")
            return "pitchRelease";
        if (key == "envamount" || key == "filterenvamount")
            return "envAmount";
        if (key == "filtertype" || key == "mode")
            return "filterType";
        if (key == "filtercurve" || key == "curve" || key == "slope")
            return "filterCurve";
        if (key == "outgain")
            return "outGain";
        if (key == "amp")
            return "amplitude";

        return paramName;
    }

    class LearnSlotParameter final : public juce::AudioParameterFloat
    {
    public:
        LearnSlotParameter(const juce::String& parameterId, const juce::String& fallbackName)
            : juce::AudioParameterFloat(
                juce::ParameterID(parameterId, 1),
                fallbackName,
                juce::NormalisableRange<float>(0.0f, 1.0f),
                0.0f,
                juce::AudioParameterFloatAttributes().withAutomatable(true).withMeta(false)),
              defaultName(fallbackName)
        {
        }

        void setAssignment(bool shouldBeAssigned, const juce::String& label)
        {
            juce::ignoreUnused(shouldBeAssigned);
            juce::SpinLock::ScopedLockType guard(nameLock);
            assignedName = label;
        }

        juce::String getName(int maximumStringLength) const override
        {
            juce::SpinLock::ScopedLockType guard(nameLock);
            const auto display = assignedName.isNotEmpty() ? assignedName : defaultName;
            return display.substring(0, maximumStringLength);
        }

    private:
        juce::String defaultName;
        juce::String assignedName;
        mutable juce::SpinLock nameLock;
    };
}

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
        initialiseAutomationParameters();
        initialiseSpectrumRanges();
        for (auto& bin : spectrumBins)
            bin.store(0.0f, std::memory_order_relaxed);
    }

    AudioPluginAudioProcessor::~AudioPluginAudioProcessor()
    {
        for (auto* parameter : automationParameters)
            if (parameter != nullptr)
                parameter->removeListener(this);

        if (auto* editor = dynamic_cast<AudioPluginAudioProcessorEditor*>(getActiveEditor()))
            editor->prepareForShutdown();
    }

    void AudioPluginAudioProcessor::initialiseAutomationParameters()
    {
        for (int slot = 0; slot < maxAutomationSlots; ++slot)
        {
            const auto slotName = juce::String(slot + 1).paddedLeft('0', slotNumberWidth);
            const auto parameterId = juce::String("learn_slot_") + slotName;
            const auto parameterName = juce::String("Learn Slot ") + slotName;

            auto* learnSlotParameter = new LearnSlotParameter(parameterId, parameterName);

            addParameter(learnSlotParameter);
            learnSlotParameter->addListener(this);

            automationParameters[(size_t)slot] = learnSlotParameter;
            learnedParameterTargets[(size_t)slot] = {};
        }
    }

    juce::NormalisableRange<float> AudioPluginAudioProcessor::getRangeForParameterName(const juce::String& paramName) const
    {
        const auto key = paramName.toLowerCase();

        if (key == "frequencyratio" || key == "ratio")
            return { 0.125f, 8.0f };
        if (key == "amplitude" || key == "amp")
            return { 0.0f, 1.0f };
        if (key == "velocityamount" || key == "velocity" || key == "vel")
            return { 0.0f, 1.0f };
        if (key == "pitchenvamount" || key == "pitchamount" || key == "pitchmodamount")
            return { -24.0f, 24.0f };
        if (key == "attack" || key == "decay" || key == "pitchattack" || key == "pitchdecay")
            return { 0.001f, 2.0f };
        if (key == "release" || key == "pitchrelease")
            return { 0.001f, 5.0f };
        if (key == "sustain" || key == "pitchsustain")
            return { 0.0f, 1.0f };
        if (key == "cutoff")
            return { 20.0f, 20000.0f };
        if (key == "resonance" || key == "q")
            return { 0.1f, 20.0f };
        if (key == "envamount" || key == "filterenvamount")
            return { -10000.0f, 10000.0f };
        if (key == "filtertype" || key == "mode")
            return { 0.0f, 2.0f, 1.0f };
        if (key == "filtercurve" || key == "curve" || key == "slope")
            return { 0.0f, 1.0f, 1.0f };
        if (key == "outgain")
            return { 0.0f, 1.0f };

        return { 0.0f, 1.0f };
    }

    juce::String AudioPluginAudioProcessor::buildAutomationLabel(NodeID nodeId, const juce::String& paramName) const
    {
        return "Node " + juce::String(static_cast<int>(nodeId)) + " - " + paramName;
    }

    int AudioPluginAudioProcessor::findOrAssignAutomationSlot(NodeID nodeId,
                                                               const juce::String& paramName,
                                                               const juce::NormalisableRange<float>& range)
    {
        const auto canonicalParamName = canonicalizeParameterName(paramName);
        juce::SpinLock::ScopedLockType guard(automationLock);

        for (int slot = 0; slot < maxAutomationSlots; ++slot)
        {
            const auto& target = learnedParameterTargets[(size_t)slot];
            if (target.assigned && target.nodeId == nodeId && target.paramName.equalsIgnoreCase(canonicalParamName))
                return slot;
        }

        for (int slot = 0; slot < maxAutomationSlots; ++slot)
        {
            auto& target = learnedParameterTargets[(size_t)slot];
            if (!target.assigned)
            {
                target.assigned = true;
                target.nodeId = nodeId;
                target.paramName = canonicalParamName;
                target.range = range;

                if (auto* learnSlotParameter = dynamic_cast<LearnSlotParameter*>(automationParameters[(size_t)slot]))
                    learnSlotParameter->setAssignment(true, buildAutomationLabel(nodeId, paramName));

                updateHostDisplay(juce::AudioProcessorListener::ChangeDetails().withParameterInfoChanged(true));

                DBG("Mapped " << buildAutomationLabel(nodeId, paramName)
                    << " to automation slot " << (slot + 1));
                return slot;
            }
        }

        return -1;
    }

    void AudioPluginAudioProcessor::pushNodeParameterToHost(NodeID nodeId, const juce::String& paramName, float value)
    {
        const auto range = getRangeForParameterName(paramName);
        const int slot = findOrAssignAutomationSlot(nodeId, paramName, range);
        if (slot < 0)
            return;

        auto* parameter = automationParameters[(size_t)slot];
        if (parameter == nullptr)
            return;

        const auto clampedValue = juce::jlimit(range.start, range.end, value);
        const auto normalized = range.convertTo0to1(clampedValue);

        suppressAutomationCallbacks.store(true, std::memory_order_relaxed);
        parameter->beginChangeGesture();
        parameter->setValueNotifyingHost(normalized);
        parameter->endChangeGesture();
        suppressAutomationCallbacks.store(false, std::memory_order_relaxed);
    }

    void AudioPluginAudioProcessor::applyAutomationSlotValue(int slotIndex, float normalizedValue)
    {
        if (slotIndex < 0 || slotIndex >= maxAutomationSlots)
            return;

        NodeID nodeId = 0;
        juce::String paramName;
        juce::NormalisableRange<float> range { 0.0f, 1.0f };

        {
            juce::SpinLock::ScopedLockType guard(automationLock);
            const auto& target = learnedParameterTargets[(size_t)slotIndex];
            if (!target.assigned)
                return;

            nodeId = target.nodeId;
            paramName = target.paramName;
            range = target.range;
        }

        const auto clampedNorm = juce::jlimit(0.0f, 1.0f, normalizedValue);
        const auto mappedValue = range.convertFrom0to1(clampedNorm);
        paramName = canonicalizeParameterName(paramName);
        synth.updateNodeParameter(nodeId, paramName, mappedValue);

        juce::SpinLock::ScopedTryLockType guard(pendingAutomationUpdatesLock);
        if (!guard.isLocked())
            return;

        pendingAutomationUiUpdates.push_back(PendingAutomationUiUpdate { nodeId, paramName, mappedValue });
    }

    std::vector<AudioPluginAudioProcessor::PendingAutomationUiUpdate>
    AudioPluginAudioProcessor::popPendingAutomationUiUpdates()
    {
        juce::SpinLock::ScopedLockType guard(pendingAutomationUpdatesLock);
        std::vector<PendingAutomationUiUpdate> result;
        result.swap(pendingAutomationUiUpdates);
        return result;
    }

    void AudioPluginAudioProcessor::releaseAutomationMappingsForNode(NodeID nodeId)
    {
        juce::SpinLock::ScopedLockType guard(automationLock);

        bool changed = false;
        for (int slot = 0; slot < maxAutomationSlots; ++slot)
        {
            auto& target = learnedParameterTargets[(size_t)slot];
            if (target.assigned && target.nodeId == nodeId)
            {
                target = {};
                changed = true;

                if (auto* learnSlotParameter = dynamic_cast<LearnSlotParameter*>(automationParameters[(size_t)slot]))
                    learnSlotParameter->setAssignment(false, {});

                if (auto* parameter = automationParameters[(size_t)slot])
                {
                    suppressAutomationCallbacks.store(true, std::memory_order_relaxed);
                    parameter->setValueNotifyingHost(0.0f);
                    suppressAutomationCallbacks.store(false, std::memory_order_relaxed);
                }
            }
        }

        if (changed)
            updateHostDisplay(juce::AudioProcessorListener::ChangeDetails().withParameterInfoChanged(true));
    }

    void AudioPluginAudioProcessor::resetAutomationMappings()
    {
        juce::SpinLock::ScopedLockType guard(automationLock);

        for (int slot = 0; slot < maxAutomationSlots; ++slot)
        {
            auto& target = learnedParameterTargets[(size_t)slot];
            target = {};

            if (auto* learnSlotParameter = dynamic_cast<LearnSlotParameter*>(automationParameters[(size_t)slot]))
                learnSlotParameter->setAssignment(false, {});

            if (auto* parameter = automationParameters[(size_t)slot])
            {
                suppressAutomationCallbacks.store(true, std::memory_order_relaxed);
                parameter->setValueNotifyingHost(0.0f);
                suppressAutomationCallbacks.store(false, std::memory_order_relaxed);
            }
        }

        updateHostDisplay(juce::AudioProcessorListener::ChangeDetails().withParameterInfoChanged(true));
    }

    std::unique_ptr<juce::XmlElement> AudioPluginAudioProcessor::createAutomationStateXml()
    {
        auto automationState = std::make_unique<juce::XmlElement>("AUTOMATION_LEARN_STATE");
        juce::SpinLock::ScopedLockType guard(automationLock);

        for (int slot = 0; slot < maxAutomationSlots; ++slot)
        {
            const auto& target = learnedParameterTargets[(size_t)slot];
            if (!target.assigned)
                continue;

            auto* mapping = new juce::XmlElement("MAPPING");
            mapping->setAttribute("slot", slot);
            mapping->setAttribute("nodeId", static_cast<int>(target.nodeId));
            mapping->setAttribute("param", target.paramName);
            mapping->setAttribute("min", target.range.start);
            mapping->setAttribute("max", target.range.end);
            mapping->setAttribute("step", target.range.interval);
            automationState->addChildElement(mapping);
        }

        return automationState;
    }

    void AudioPluginAudioProcessor::loadAutomationStateXml(const juce::XmlElement* automationState)
    {
        resetAutomationMappings();
        if (automationState == nullptr)
            return;

        juce::SpinLock::ScopedLockType guard(automationLock);

        for (const auto* mapping : automationState->getChildIterator())
        {
            if (mapping == nullptr || !mapping->hasTagName("MAPPING"))
                continue;

            const int slot = mapping->getIntAttribute("slot", -1);
            if (slot < 0 || slot >= maxAutomationSlots)
                continue;

            auto& target = learnedParameterTargets[(size_t)slot];
            target.assigned = true;
            target.nodeId = static_cast<NodeID>(mapping->getIntAttribute("nodeId", 0));
            target.paramName = canonicalizeParameterName(mapping->getStringAttribute("param"));
            target.range = juce::NormalisableRange<float>(
                static_cast<float>(mapping->getDoubleAttribute("min", 0.0)),
                static_cast<float>(mapping->getDoubleAttribute("max", 1.0)),
                static_cast<float>(mapping->getDoubleAttribute("step", 0.0)));

            if (auto* learnSlotParameter = dynamic_cast<LearnSlotParameter*>(automationParameters[(size_t)slot]))
                learnSlotParameter->setAssignment(true, buildAutomationLabel(target.nodeId, target.paramName));
        }

        updateHostDisplay(juce::AudioProcessorListener::ChangeDetails().withParameterInfoChanged(true));
    }

    void AudioPluginAudioProcessor::parameterValueChanged(int parameterIndex, float newValue)
    {
        if (suppressAutomationCallbacks.load(std::memory_order_relaxed))
            return;

        applyAutomationSlotValue(parameterIndex, newValue);
    }

    void AudioPluginAudioProcessor::parameterGestureChanged(int parameterIndex, bool gestureIsStarting)
    {
        juce::ignoreUnused(parameterIndex, gestureIsStarting);
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

        buffer.applyGain(outputGain.load());
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
        const bool removed = synth.removeNodeFromGraph(nodeId);
        if (removed)
            releaseAutomationMappingsForNode(nodeId);

        return removed;
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
        pushNodeParameterToHost(nodeId, paramName, value);
    }

    void AudioPluginAudioProcessor::updateNodePosition(NodeID nodeId, float x, float y)
    {
        synth.updateNodePosition(nodeId, x, y);
    }

    void AudioPluginAudioProcessor::updateConnectionAmount(NodeID sourceId, NodeID destId, float amount)
    {
        synth.updateConnectionAmount(sourceId, destId, amount);
    }

    void AudioPluginAudioProcessor::updateOutputGain(float gain)
    {
        const float clampedGain = juce::jlimit(0.0f, 1.0f, gain);
        outputGain.store(clampedGain, std::memory_order_relaxed);
    }

    float AudioPluginAudioProcessor::getOutputGain() const noexcept
    {
        return outputGain.load(std::memory_order_relaxed);
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
        resetAutomationMappings();
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
        pluginState->setAttribute(outputGainStateAttribute, static_cast<double>(getOutputGain()));
        auto graphState = std::make_unique<juce::XmlElement>(synth.createStateXml());
        pluginState->addChildElement(graphState.release());
        pluginState->addChildElement(createAutomationStateXml().release());
        copyXmlToBinary(*pluginState, destData);
    }

    void AudioPluginAudioProcessor::setStateInformation(const void *data, int sizeInBytes)
    {
        const auto pluginState = getXmlFromBinary(data, sizeInBytes);
        if (pluginState == nullptr || !pluginState->hasTagName("NODEFM_PLUGIN_STATE"))
            return;

        if (pluginState->hasAttribute(outputGainStateAttribute))
            updateOutputGain(static_cast<float>(pluginState->getDoubleAttribute(outputGainStateAttribute, 1.0)));

        loadAutomationStateXml(pluginState->getChildByName("AUTOMATION_LEARN_STATE"));

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