#include "NodeFMWebViewPlugin/Synth.h"
#include "NodeFMWebViewPlugin/Utils.h"
#include "NodeFMWebViewPlugin/dsp/Output.h"
#include "NodeFMWebViewPlugin/graph/GraphTypes.h"

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
    voice.noteOn();
    
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

nodefm_plugin::NodeID nodefm_plugin::Synth::addNodeToGraph(const juce::String& nodeType, const juce::var& data)
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
        if (auto* obj = data.getDynamicObject())
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
        }
        
        node = std::move(osc);
    }
    else if (nodeType == "output")
    {
        node = std::make_unique<Output>();
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

void nodefm_plugin::Synth::addConnection(NodeID sourceId, NodeID destId, float amount)
{
    if (voice.graph)
    {
        voice.graph->addConnection(sourceId, destId, amount);
        DBG("Added connection from node " << (int)sourceId << " to node " << (int)destId);
    }
}

void nodefm_plugin::Synth::updateNodeParameter(NodeID nodeId, const juce::String& paramName, float value)
{
    if (!voice.graph)
        return;
    
    DSPNode* node = voice.graph->getNode(nodeId);
    if (!node)
    {
        DBG("WARNING: Node " << (int)nodeId << " not found");
        return;
    }
    
    if (auto* osc = dynamic_cast<Oscillator*>(node))
    {
        if (paramName == "frequencyRatio" || paramName == "ratio")
        {
            osc->setFrequencyRatio(value);
            DBG("Updated node " << (int)nodeId << " frequency ratio: " << value);
        }
        else if (paramName == "amplitude" || paramName == "amp")
        {
            osc->setAmplitude(value);
            DBG("Updated node " << (int)nodeId << " amplitude: " << value);
        }
        else if (paramName == "attack")
        {
            osc->setAttack(value);
            DBG("Updated node " << (int)nodeId << " attack: " << value << " seconds");
        }
        else if (paramName == "decay")
        {
            osc->setDecay(value);
            DBG("Updated node " << (int)nodeId << " decay: " << value << " seconds");
        }
        else if (paramName == "sustain")
        {
            osc->setSustain(value);
            DBG("Updated node " << (int)nodeId << " sustain: " << value);
        }
        else if (paramName == "release")
        {
            osc->setRelease(value);
            DBG("Updated node " << (int)nodeId << " release: " << value << " seconds");
        }
        else
        {
            DBG("WARNING: Unknown parameter '" << paramName << "' for node " << (int)nodeId);
        }
    }
    else
    {
        DBG("WARNING: Node " << (int)nodeId << " is not an oscillator");
    }
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
        operatorNode->setAttack(0.01f);
        operatorNode->setDecay(0.1f);
        operatorNode->setSustain(0.7f);
        operatorNode->setRelease(0.3f);
        voice.operatorNodeID = voice.graph->addNode(std::move(operatorNode));
        voice.graph->addConnection(voice.operatorNodeID, voice.outputNodeID, 1.0f);
        
        DBG("Synth: Graph cleared, new output node ID: " << (int)voice.outputNodeID);
    }
    
    // Reset voice state
    voice.note = 0;
    
    return voice.outputNodeID;
}