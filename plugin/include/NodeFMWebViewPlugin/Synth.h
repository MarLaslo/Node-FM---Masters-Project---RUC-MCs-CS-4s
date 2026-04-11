#pragma once
#include "Voice.h"
#include <cstdint>
#include <juce_data_structures/juce_data_structures.h>

namespace nodefm_plugin
{
    class Synth
    {
    public:
        Synth();

        void allocateResources(double sampleRate, int samplePerBlock);
        void deAllocateResources();
        void reset();
        void render(float **outputBufferes, int sampleCount);
        void midiMessage(u_int8_t data0, u_int8_t data1, u_int8_t data2);
        NodeID addNodeToGraph(const juce::String& nodeType, const juce::var& data);
        bool removeNodeFromGraph(NodeID nodeId);
        void addConnection(NodeID sourceId, NodeID destId, float amount, ConnectionType type = ConnectionType::modulation);
        bool removeConnection(NodeID sourceId, NodeID destId, ConnectionType type = ConnectionType::modulation);
        void updateNodeParameter(NodeID nodeId, const juce::String& paramName, float value);
        void updateNodePosition(NodeID nodeId, float x, float y);
        void updateConnectionAmount(NodeID sourceId, NodeID destId, float amount);
        NodeID getOutputNodeID() const;
        NodeID getOperatorNodeID() const;
        NodeID clearGraph();
        juce::XmlElement createStateXml() const;
        bool loadStateXml(const juce::XmlElement& state);
        juce::var createGraphSnapshotForUI() const;

    private:
        float sampleRate;
        nodefm_plugin::Voice voice;
        void noteOn (int note, int velocity);
        void noteOff (int note);
    };
}