#pragma once
#include "dsp/DSPNode.h"

namespace nodefm_plugin
{
    class Output : public DSPNode
    {
    public:
        Output()
        {
            outputBuffer.setSize(1, 1, false, false, true);
            outputBuffer.clear();
        }

        void process(int numSamples) override
        {
            outputBuffer.setSize(1, numSamples, false, false, true);
            float* output = outputBuffer.getWritePointer(0);
            
            // Just pass through the modulation input
            for (int i = 0; i < numSamples; ++i)
            {
                output[i] = modulationInput;
            }
        }

        void reset() override
        {
            modulationInput = 0.0f;
            outputBuffer.clear();
        }

        void setModulation(float value) override
        {
            // Accumulate inputs (in case multiple nodes connect)
            modulationInput += value;
        }
    };
}