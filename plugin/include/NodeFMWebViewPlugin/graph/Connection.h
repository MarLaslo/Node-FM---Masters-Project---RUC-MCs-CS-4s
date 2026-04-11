#pragma once
#include "GraphTypes.h"

namespace nodefm_plugin
{
    enum class ConnectionType
    {
        modulation,
        gain
    };

    class Connection{
        public:
        ConnectionID id;
        NodeID source;
        NodeID destination;
        float ammount;
        ConnectionType type = ConnectionType::modulation;
        
        private:

    };
}