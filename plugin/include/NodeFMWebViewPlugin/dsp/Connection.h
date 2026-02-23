#pragma once
#include "../GraphTypes.h"

namespace nodefm_plugin
{
    class Connection{
        public:
        ConnectionID id;
        NodeID source;
        NodeID destination;
        float ammount;
        
        private:

    };
}