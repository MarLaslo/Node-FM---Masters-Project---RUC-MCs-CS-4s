#pragma once
#include "GraphTypes.h"
#include "DSPNode.h"
#include "Connection.h"
#include <juce_core/juce_core.h>
#include <unordered_map>
#include <vector>
#include <memory>
#include <utility>

namespace nodefm_plugin
{
    class DSPGraph
    {
    public:
        NodeID addNode(std::unique_ptr<DSPNode> node);
        void removeNode(NodeID id);
        ConnectionID addConnection(NodeID source, NodeID dest, float amount);
        void removeConnection(ConnectionID id);
        void updateConnection(NodeID source, NodeID dest, float newAmount);
        DSPNode* getNode(NodeID id);
        void process(float* outputBuffer, int numSamples);
        void setOutputNode(NodeID id);
        void setSampleRate(float sr);
        void setNoteFrequency(float freq);
        void noteOn();
        void noteOff();
        bool isAnyEnvelopeActive() const;
        void reset();
        void clearGraph();
        void setNodePosition(NodeID id, float x, float y);
        juce::XmlElement createStateXml() const;
        bool loadStateXml(const juce::XmlElement& state, NodeID& outputNodeId, NodeID& operatorNodeId);
        juce::var createSnapshotVar(NodeID outputNodeId, NodeID operatorNodeId) const;

    private:
        void updateProcessingOrder(); // Kahn's algorithm for topological sort
        
        std::unordered_map<NodeID, std::unique_ptr<DSPNode>> nodes;
        std::vector<Connection> connections;
        NodeID nextNodeID = 1;
        ConnectionID nextConnectionID = 1;
        NodeID outputNodeID = 0;
        std::vector<NodeID> processingOrder;
        std::unordered_map<NodeID, std::pair<float, float>> nodePositions;
    };
}