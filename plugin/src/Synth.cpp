#include "NodeFMWebViewPlugin/Synth.h"
#include "NodeFMWebViewPlugin/Utils.h"

nodefm_plugin::Synth::Synth()
{
    sampleRate = 44100.0f;
}

void nodefm_plugin::Synth::allocateResources(double sampleRate_, int samplePerBlock)
{
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
    for (int sample = 0; sample < sampleCount; ++sample)
    {
        float noise = 0;
        float output = 0.0f;
        if (voice.note > 0)
        {
            output = voice.render();
        }
        outputBufferLeft[sample] = output;
        if (outputBufferRight != nullptr)
        {
            outputBufferRight[sample] = output;
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
    
    voice.osc.amplitude = (velocity / 127.0f) * 0.5f;
    voice.osc.inc = freq / sampleRate;
    voice.osc.reset();
    voice.osc.reset();
}

void nodefm_plugin::Synth::noteOff(int note)
{
    if (voice.note == note)
    {
        voice.note = 0;
    }
}