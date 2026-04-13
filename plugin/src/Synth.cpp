#include "NodeFMWebViewPlugin/Synth.h"
#include "NodeFMWebViewPlugin/Utils.h"
#include "NodeFMWebViewPlugin/dsp/Filter.h"
#include "NodeFMWebViewPlugin/dsp/Output.h"
#include "NodeFMWebViewPlugin/graph/GraphTypes.h"

namespace
{
    enum class ParamKey
    {
        unknown,
        frequencyRatio,
        amplitude,
        attack,
        decay,
        sustain,
        release,
        pitchEnvAmount,
        pitchAttack,
        pitchDecay,
        pitchSustain,
        pitchRelease,
        cutoff,
        resonance,
        envAmount,
        filterType,
        filterCurve,
        velocityAmount,
        outGain
    };

    ParamKey resolveParamKey(const juce::String &rawParamName)
    {
        const auto key = rawParamName.toLowerCase();

        if (key == "frequencyratio" || key == "ratio")
            return ParamKey::frequencyRatio;
        if (key == "amplitude" || key == "amp")
            return ParamKey::amplitude;
        if (key == "attack")
            return ParamKey::attack;
        if (key == "decay")
            return ParamKey::decay;
        if (key == "sustain")
            return ParamKey::sustain;
        if (key == "release")
            return ParamKey::release;
        if (key == "pitchenvamount" || key == "pitchamount" || key == "pitchmodamount")
            return ParamKey::pitchEnvAmount;
        if (key == "pitchattack" || key == "pitchenvelopeattack")
            return ParamKey::pitchAttack;
        if (key == "pitchdecay" || key == "pitchenvelopedecay")
            return ParamKey::pitchDecay;
        if (key == "pitchsustain" || key == "pitchenvelopesustain")
            return ParamKey::pitchSustain;
        if (key == "pitchrelease" || key == "pitchenveloperelease")
            return ParamKey::pitchRelease;
        if (key == "cutoff")
            return ParamKey::cutoff;
        if (key == "resonance" || key == "q")
            return ParamKey::resonance;
        if (key == "envamount" || key == "filterenvamount")
            return ParamKey::envAmount;
        if (key == "filtertype" || key == "mode")
            return ParamKey::filterType;
        if (key == "filtercurve" || key == "curve" || key == "slope")
            return ParamKey::filterCurve;
        if (key == "velocityamount" || key == "velocity" || key == "vel")
            return ParamKey::velocityAmount;
        if (key == "outgain")
            return ParamKey::outGain;

        return ParamKey::unknown;
    }
}

nodefm_plugin::Synth::Synth()
{
    sampleRate = 44100.0f;
}

void nodefm_plugin::Synth::allocateResources(double sampleRate_, int samplePerBlock)
{
    sampleRate = static_cast<float>(sampleRate_);
    voice.setSampleRate(sampleRate);
}
void nodefm_plugin::Synth::deAllocateResources()
{
}
void nodefm_plugin::Synth::reset()
{
    voice.reset();
}
void nodefm_plugin::Synth::render(float **outputBuffers, int sampleCount)
{
    float *outputBufferLeft = outputBuffers[0];
    float *outputBufferRight = outputBuffers[1];

    if (voice.note > 0 || voice.isEnvelopeActive())
    {
        // Process entire buffer at once for better performance
        voice.render(outputBufferLeft, sampleCount);

        // Copy to right channel if it exists
        if (outputBufferRight != nullptr)
        {
            for (int sample = 0; sample < sampleCount; ++sample)
            {
                outputBufferRight[sample] = outputBufferLeft[sample];
            }
        }

        // Clear the note once envelopes are done
        if (voice.note > 0 && !voice.isEnvelopeActive())
        {
            voice.note = 0;
        }
    }
    else
    {
        // Fill with silence
        for (int sample = 0; sample < sampleCount; ++sample)
        {
            outputBufferLeft[sample] = 0.0f;
            if (outputBufferRight != nullptr)
            {
                outputBufferRight[sample] = 0.0f;
            }
        }
    }

    protectYourEars(outputBufferLeft, sampleCount);
    protectYourEars(outputBufferRight, sampleCount);
}

void nodefm_plugin::Synth::midiMessage(u_int8_t data0, u_int8_t data1, u_int8_t data2)
{
    switch (data0 & 0xF0)
    {
    case 0x80:
        noteOff(data1 & 0x7F);
        break;

    case 0x90:
    {
        uint8_t note = data1 & 0x7F;
        uint8_t velo = data2 & 0x7F;
        if (velo > 0)
        {
            noteOn(note, velo);
        }
        else
        {
            noteOff(note);
        }
        break;
    }
    }
}

void nodefm_plugin::Synth::noteOn(int note, int velocity)
{
    voice.note = note;
    float freq = 440.0f * std::exp2(float(note - 69) / 12.0f);

    // Update all operators with the new note frequency
    voice.setNoteFrequency(freq);

    // Trigger ADSR envelopes
    const float normalizedVelocity = juce::jlimit(0.0f, 1.0f, static_cast<float>(velocity) / 127.0f);
    voice.noteOn(normalizedVelocity);

    DBG("Note On: " << note << " -> " << freq << " Hz (velocity: " << velocity << ")");
}

void nodefm_plugin::Synth::noteOff(int note)
{
    if (voice.note == note)
    {
        // Trigger ADSR release
        voice.noteOff();
        // Note: Don't set voice.note to 0 here to allow envelope release to complete
        // The voice will continue rendering while envelopes are active
    }
}

nodefm_plugin::NodeID nodefm_plugin::Synth::addNodeToGraph(const juce::String &nodeType, const juce::var &data)
{
    // Add node to the voice's graph
    if (!voice.graph)
    {
        voice.graph = std::make_shared<DSPGraph>();
    }

    // Create the node based on type
    std::unique_ptr<DSPNode> node;

    if (nodeType == "oscillator" || nodeType == "operator")
    {
        auto osc = std::make_unique<Oscillator>();
        osc->setSampleRate(sampleRate);

        // Set parameters from data
        if (auto *obj = data.getDynamicObject())
        {
            // Frequency ratio (default 1.0 for carrier frequency)
            if (obj->hasProperty("frequencyRatio"))
            {
                float ratio = obj->getProperty("frequencyRatio");
                osc->setFrequencyRatio(ratio);
                DBG("  Setting frequency ratio: " << ratio);
            }

            // Amplitude (default 0.5)
            if (obj->hasProperty("amplitude"))
            {
                float amp = obj->getProperty("amplitude");
                osc->setAmplitude(amp);
                DBG("  Setting amplitude: " << amp);
            }

            // ADSR Envelope parameters
            if (obj->hasProperty("attack"))
            {
                float attack = obj->getProperty("attack");
                osc->setAttack(attack);
                DBG("  Setting attack: " << attack << " seconds");
            }

            if (obj->hasProperty("decay"))
            {
                float decay = obj->getProperty("decay");
                osc->setDecay(decay);
                DBG("  Setting decay: " << decay << " seconds");
            }

            if (obj->hasProperty("sustain"))
            {
                float sustain = obj->getProperty("sustain");
                osc->setSustain(sustain);
                DBG("  Setting sustain: " << sustain);
            }

            if (obj->hasProperty("release"))
            {
                float release = obj->getProperty("release");
                osc->setRelease(release);
                DBG("  Setting release: " << release << " seconds");
            }

            if (obj->hasProperty("velocityAmount"))
            {
                float velocityAmount = obj->getProperty("velocityAmount");
                osc->setVelocityAmount(velocityAmount);
                DBG("  Setting velocity amount: " << velocityAmount);
            }

            if (obj->hasProperty("pitchEnvAmount"))
            {
                float pitchEnvAmount = obj->getProperty("pitchEnvAmount");
                osc->setPitchEnvAmount(pitchEnvAmount);
                DBG("  Setting pitch envelope amount: " << pitchEnvAmount << " semitones");
            }

            if (obj->hasProperty("pitchAttack"))
            {
                float pitchAttack = obj->getProperty("pitchAttack");
                osc->setPitchAttack(pitchAttack);
                DBG("  Setting pitch attack: " << pitchAttack << " seconds");
            }

            if (obj->hasProperty("pitchDecay"))
            {
                float pitchDecay = obj->getProperty("pitchDecay");
                osc->setPitchDecay(pitchDecay);
                DBG("  Setting pitch decay: " << pitchDecay << " seconds");
            }

            if (obj->hasProperty("pitchSustain"))
            {
                float pitchSustain = obj->getProperty("pitchSustain");
                osc->setPitchSustain(pitchSustain);
                DBG("  Setting pitch sustain: " << pitchSustain);
            }

            if (obj->hasProperty("pitchRelease"))
            {
                float pitchRelease = obj->getProperty("pitchRelease");
                osc->setPitchRelease(pitchRelease);
                DBG("  Setting pitch release: " << pitchRelease << " seconds");
            }
        }

        node = std::move(osc);
    }
    else if (nodeType == "output")
    {
        node = std::make_unique<Output>();
    }
    else if (nodeType == "filter")
    {
        auto filter = std::make_unique<Filter>();
        filter->setSampleRate(sampleRate);

        if (auto *obj = data.getDynamicObject())
        {
            if (obj->hasProperty("cutoff"))
            {
                const float cutoff = obj->getProperty("cutoff");
                filter->setCutoff(cutoff);
                DBG("  Setting cutoff: " << cutoff << " Hz");
            }

            if (obj->hasProperty("resonance"))
            {
                const float resonance = obj->getProperty("resonance");
                filter->setResonance(resonance);
                DBG("  Setting resonance: " << resonance);
            }

            if (obj->hasProperty("envAmount"))
            {
                const float envAmount = obj->getProperty("envAmount");
                filter->setEnvelopeAmount(envAmount);
                DBG("  Setting filter envelope amount: " << envAmount << " Hz");
            }

            const auto filterCurve = obj->getProperty("filterCurve").toString().toLowerCase();
            if (filterCurve.contains("24"))
            {
                filter->setFilterCurve(FilterCurve::db24);
            }
            else
            {
                filter->setFilterCurve(FilterCurve::db12);
            }

            const auto filterType = obj->getProperty("filterType").toString().toLowerCase();
            filter->setFilterMode(filterModeFromString(filterType));

            if (obj->hasProperty("attack"))
            {
                const float attack = obj->getProperty("attack");
                filter->setAttack(attack);
                DBG("  Setting filter attack: " << attack << " seconds");
            }

            if (obj->hasProperty("decay"))
            {
                const float decay = obj->getProperty("decay");
                filter->setDecay(decay);
                DBG("  Setting filter decay: " << decay << " seconds");
            }

            if (obj->hasProperty("sustain"))
            {
                const float sustain = obj->getProperty("sustain");
                filter->setSustain(sustain);
                DBG("  Setting filter sustain: " << sustain);
            }

            if (obj->hasProperty("release"))
            {
                const float release = obj->getProperty("release");
                filter->setRelease(release);
                DBG("  Setting filter release: " << release << " seconds");
            }
        }

        node = std::move(filter);
    }

    if (node)
    {
        // Add to voice's graph
        NodeID newNodeID = voice.graph->addNode(std::move(node));

        // Send ID back to UI
        DBG("Added " << nodeType << " node with ID: " << (int)newNodeID);

        return newNodeID;
    }

    return 0;
}

bool nodefm_plugin::Synth::removeNodeFromGraph(NodeID nodeId)
{
    if (!voice.graph || nodeId == 0)
        return false;

    if (nodeId == voice.outputNodeID)
    {
        DBG("Refusing to remove output node " << static_cast<int>(nodeId));
        return false;
    }

    if (voice.graph->getNode(nodeId) == nullptr)
        return false;

    voice.graph->removeNode(nodeId);

    if (voice.operatorNodeID == nodeId)
    {
        voice.operatorNodeID = 0;
        const auto snapshot = voice.graph->createSnapshotVar(voice.outputNodeID, 0);
        if (const auto *snapshotObj = snapshot.getDynamicObject())
        {
            const auto nodesVar = snapshotObj->getProperty("nodes");
            if (const auto *nodeArray = nodesVar.getArray())
            {
                for (const auto &nodeVar : *nodeArray)
                {
                    if (const auto *nodeObj = nodeVar.getDynamicObject())
                    {
                        const auto type = nodeObj->getProperty("type").toString().toLowerCase();
                        if (type == "operator" || type == "oscillator")
                        {
                            const int replacementOperatorId = nodeObj->getProperty("id").toString().getIntValue();
                            voice.operatorNodeID = static_cast<NodeID>(replacementOperatorId);
                            break;
                        }
                    }
                }
            }
        }
    }

    return true;
}

void nodefm_plugin::Synth::addConnection(NodeID sourceId, NodeID destId, float amount, ConnectionType type)
{
    if (voice.graph)
    {
        voice.graph->addConnection(sourceId, destId, amount, type);
        DBG("Added connection from node " << (int)sourceId << " to node " << (int)destId << " type=" << (type == ConnectionType::gain ? "gain" : "modulation"));
    }
}

bool nodefm_plugin::Synth::removeConnection(NodeID sourceId, NodeID destId, ConnectionType type)
{
    if (!voice.graph)
        return false;

    return voice.graph->removeConnection(sourceId, destId, type);
}

void nodefm_plugin::Synth::updateNodeParameter(NodeID nodeId, const juce::String &paramName, float value)
{
    if (!voice.graph)
        return;

    DSPNode *node = voice.graph->getNode(nodeId);
    if (!node)
    {
        DBG("WARNING: Node " << (int)nodeId << " not found");
        return;
    }

    const auto paramKey = resolveParamKey(paramName);

    if (auto *osc = dynamic_cast<Oscillator *>(node))
    {
        switch (paramKey)
        {
        case ParamKey::frequencyRatio:
            osc->setFrequencyRatio(value);
            DBG("Updated node " << (int)nodeId << " frequency ratio: " << value);
            break;
        case ParamKey::amplitude:
            osc->setAmplitude(value);
            DBG("Updated node " << (int)nodeId << " amplitude: " << value);
            break;
        case ParamKey::attack:
            osc->setAttack(value);
            DBG("Updated node " << (int)nodeId << " attack: " << value << " seconds");
            break;
        case ParamKey::decay:
            osc->setDecay(value);
            DBG("Updated node " << (int)nodeId << " decay: " << value << " seconds");
            break;
        case ParamKey::sustain:
            osc->setSustain(value);
            DBG("Updated node " << (int)nodeId << " sustain: " << value);
            break;
        case ParamKey::release:
            osc->setRelease(value);
            DBG("Updated node " << (int)nodeId << " release: " << value << " seconds");
            break;
        case ParamKey::velocityAmount:
            osc->setVelocityAmount(value);
            DBG("Updated node " << (int)nodeId << " velocity amount: " << value);
            break;
        case ParamKey::pitchEnvAmount:
            osc->setPitchEnvAmount(value);
            DBG("Updated node " << (int)nodeId << " pitch envelope amount: " << value << " semitones");
            break;
        case ParamKey::pitchAttack:
            osc->setPitchAttack(value);
            DBG("Updated node " << (int)nodeId << " pitch attack: " << value << " seconds");
            break;
        case ParamKey::pitchDecay:
            osc->setPitchDecay(value);
            DBG("Updated node " << (int)nodeId << " pitch decay: " << value << " seconds");
            break;
        case ParamKey::pitchSustain:
            osc->setPitchSustain(value);
            DBG("Updated node " << (int)nodeId << " pitch sustain: " << value);
            break;
        case ParamKey::pitchRelease:
            osc->setPitchRelease(value);
            DBG("Updated node " << (int)nodeId << " pitch release: " << value << " seconds");
            break;
        default:
            DBG("WARNING: Unknown parameter '" << paramName << "' for node " << (int)nodeId);
            break;
        }
    }
    if (auto *filter = dynamic_cast<Filter *>(node))
    {
        if (filter == nullptr)
        {
            DBG("WARNING: Node " << (int)nodeId << " is not an oscillator or filter");
            return;
        }

        switch (paramKey)
        {
        case ParamKey::cutoff:
            filter->setCutoff(value);
            DBG("Updated filter node " << (int)nodeId << " cutoff: " << value << " Hz");
            break;
        case ParamKey::resonance:
            filter->setResonance(value);
            DBG("Updated filter node " << (int)nodeId << " resonance: " << value);
            break;
        case ParamKey::envAmount:
            filter->setEnvelopeAmount(value);
            DBG("Updated filter node " << (int)nodeId << " envelope amount: " << value << " Hz");
            break;
        case ParamKey::filterType:
            if (value <= 0.5f)
                filter->setFilterMode(FilterMode::lowpass);
            else if (value <= 1.5f)
                filter->setFilterMode(FilterMode::bandpass);
            else
                filter->setFilterMode(FilterMode::highpass);
            DBG("Updated filter node " << (int)nodeId << " mode index: " << value);
            break;
        case ParamKey::filterCurve:
            filter->setFilterCurve(value <= 0.5f ? FilterCurve::db12 : FilterCurve::db24);
            DBG("Updated filter node " << (int)nodeId << " curve index: " << value);
            break;
        case ParamKey::attack:
            filter->setAttack(value);
            DBG("Updated filter node " << (int)nodeId << " attack: " << value << " seconds");
            break;
        case ParamKey::decay:
            filter->setDecay(value);
            DBG("Updated filter node " << (int)nodeId << " decay: " << value << " seconds");
            break;
        case ParamKey::sustain:
            filter->setSustain(value);
            DBG("Updated filter node " << (int)nodeId << " sustain: " << value);
            break;
        case ParamKey::release:
            filter->setRelease(value);
            DBG("Updated filter node " << (int)nodeId << " release: " << value << " seconds");
            break;
        default:
            DBG("WARNING: Unknown parameter '" << paramName << "' for filter node " << (int)nodeId);
            break;
        }
    }
    if (auto *output = dynamic_cast<Output *>(node))
    {
        switch (paramKey)
        {
        case ParamKey::outGain:
            output->setOutGain(value);
            DBG("Updated output node " << (int)nodeId << " out gain: " << value << " seconds");
        }
    }
}

void nodefm_plugin::Synth::updateNodePosition(NodeID nodeId, float x, float y)
{
    if (voice.graph)
        voice.graph->setNodePosition(nodeId, x, y);
}

void nodefm_plugin::Synth::updateConnectionAmount(NodeID sourceId, NodeID destId, float amount)
{
    if (voice.graph)
    {
        voice.graph->updateConnection(sourceId, destId, amount);
    }
}

nodefm_plugin::NodeID nodefm_plugin::Synth::getOutputNodeID() const
{
    return voice.outputNodeID;
}

nodefm_plugin::NodeID nodefm_plugin::Synth::getOperatorNodeID() const
{
    return voice.operatorNodeID;
}

nodefm_plugin::NodeID nodefm_plugin::Synth::clearGraph()
{
    DBG("Synth: Clearing graph");

    // Clear the graph
    if (voice.graph)
    {
        voice.graph->clearGraph();

        // Recreate output node
        auto outputNode = std::make_unique<Output>();
        voice.outputNodeID = voice.graph->addNode(std::move(outputNode));
        voice.graph->setOutputNode(voice.outputNodeID);

        auto operatorNode = std::make_unique<Oscillator>();
        operatorNode->setSampleRate(sampleRate);
        operatorNode->setFrequencyRatio(1.0f);
        operatorNode->setAmplitude(0.5f);
        operatorNode->setVelocityAmount(1.0f);
        operatorNode->setAttack(0.01f);
        operatorNode->setDecay(0.1f);
        operatorNode->setSustain(0.7f);
        operatorNode->setRelease(0.3f);
        operatorNode->setPitchEnvAmount(0.0f);
        operatorNode->setPitchAttack(0.01f);
        operatorNode->setPitchDecay(0.1f);
        operatorNode->setPitchSustain(0.7f);
        operatorNode->setPitchRelease(0.3f);
        voice.operatorNodeID = voice.graph->addNode(std::move(operatorNode));
        voice.graph->addConnection(voice.operatorNodeID, voice.outputNodeID, 1.0f, ConnectionType::gain);

        DBG("Synth: Graph cleared, new output node ID: " << (int)voice.outputNodeID);
    }

    // Reset voice state
    voice.note = 0;

    return voice.outputNodeID;
}

juce::XmlElement nodefm_plugin::Synth::createStateXml() const
{
    auto state = voice.graph->createStateXml();
    state.setAttribute("outputNodeId", static_cast<int>(voice.outputNodeID));
    state.setAttribute("operatorNodeId", static_cast<int>(voice.operatorNodeID));
    return state;
}

bool nodefm_plugin::Synth::loadStateXml(const juce::XmlElement &state)
{
    if (!voice.graph)
        voice.graph = std::make_shared<DSPGraph>();

    NodeID loadedOutputNodeId = 0;
    NodeID loadedOperatorNodeId = 0;

    const auto loaded = voice.graph->loadStateXml(state, loadedOutputNodeId, loadedOperatorNodeId);
    if (!loaded)
        return false;

    voice.outputNodeID = loadedOutputNodeId;
    voice.operatorNodeID = loadedOperatorNodeId;

    if (voice.operatorNodeID == 0)
        voice.operatorNodeID = static_cast<NodeID>(state.getIntAttribute("operatorNodeId", 0));

    voice.setSampleRate(sampleRate);
    voice.note = 0;
    return true;
}

juce::var nodefm_plugin::Synth::createGraphSnapshotForUI() const
{
    if (!voice.graph)
    {
        juce::var emptySnapshot = new juce::DynamicObject();
        auto *object = emptySnapshot.getDynamicObject();
        object->setProperty("nodes", juce::var(juce::Array<juce::var>()));
        object->setProperty("connections", juce::var(juce::Array<juce::var>()));
        object->setProperty("outputNodeId", 0);
        object->setProperty("operatorNodeId", 0);
        return emptySnapshot;
    }

    return voice.graph->createSnapshotVar(voice.outputNodeID, voice.operatorNodeID);
}