#pragma once
#include "Voice.h"
#include <cstdint>

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

    private:
        float sampleRate;
        nodefm_plugin::Voice voice;
        void noteOn (int note, int velocity);
        void noteOff (int note);
    };
}