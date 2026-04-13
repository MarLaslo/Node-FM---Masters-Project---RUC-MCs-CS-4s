#pragma once
#include "../graph/DSPNode.h"

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
            float *output = outputBuffer.getWritePointer(0);

            // Pass through the audio input (single sample)
            output[0] = inputSignal * out_gain;
        }

        void reset() override
        {
            inputSignal = 0.0f;
            modulationInput = 0.0f;
            outputBuffer.clear();
        }

        void setOutGain(float gain)
        {
            out_gain = gain;
        }

    private:
        float out_gain{0.5f};
    };
}