#pragma once
#include "../GraphTypes.h"
#include "DSPNode.h"
#include "Connection.h"
#include <unordered_map>
#include <vector>
#include <memory>

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

    private:
        void updateProcessingOrder(); // Kahn's algorithm for topological sort
        
        std::unordered_map<NodeID, std::unique_ptr<DSPNode>> nodes;
        std::vector<Connection> connections;
        NodeID nextNodeID = 1;
        ConnectionID nextConnectionID = 1;
        NodeID outputNodeID = 0;
        std::vector<NodeID> processingOrder;
    };
}