#pragma once
#include "Oscillator.h"

namespace nodefm_plugin
{
    struct Voice
    {
        int note;
        Oscillator osc;

        void reset()
        {
            note = 0;
            osc.reset();
        }
        float render()
        {
            return osc.nextSample();
        }
    };
}