#pragma once
#include <algorithm>

namespace nodefm_plugin
{
    enum class EnvelopeStage
    {
        Idle,
        Attack,
        Decay,
        Sustain,
        Release
    };

    class ADSR
    {
    public:
        ADSR()
            : attack(0.01f)
            , decay(0.1f)
            , sustain(0.7f)
            , release(0.3f)
            , sampleRate(44100.0f)
            , stage(EnvelopeStage::Idle)
            , currentLevel(0.0f)
            , multiplier(0.0f)
        {
            calculateMultiplier();
        }

        void setSampleRate(float sr)
        {
            sampleRate = sr;
            calculateMultiplier();
        }

        void setAttack(float seconds)
        {
            attack = std::max(0.001f, seconds);
            if (stage == EnvelopeStage::Attack)
                calculateMultiplier();
        }

        void setDecay(float seconds)
        {
            decay = std::max(0.001f, seconds);
            if (stage == EnvelopeStage::Decay)
                calculateMultiplier();
        }

        void setSustain(float level)
        {
            sustain = std::clamp(level, 0.0f, 1.0f);
        }

        void setRelease(float seconds)
        {
            release = std::max(0.001f, seconds);
            if (stage == EnvelopeStage::Release)
                calculateMultiplier();
        }

        void noteOn()
        {
            stage = EnvelopeStage::Attack;
            calculateMultiplier();
        }

        void noteOff()
        {
            if (stage != EnvelopeStage::Idle)
            {
                stage = EnvelopeStage::Release;
                calculateMultiplier();
            }
        }

        void reset()
        {
            stage = EnvelopeStage::Idle;
            currentLevel = 0.0f;
            multiplier = 0.0f;
        }

        float nextSample()
        {
            switch (stage)
            {
            case EnvelopeStage::Idle:
                currentLevel = 0.0f;
                break;

            case EnvelopeStage::Attack:
                currentLevel += multiplier;
                if (currentLevel >= 1.0f)
                {
                    currentLevel = 1.0f;
                    stage = EnvelopeStage::Decay;
                    calculateMultiplier();
                }
                break;

            case EnvelopeStage::Decay:
                currentLevel += multiplier;
                if (currentLevel <= sustain)
                {
                    currentLevel = sustain;
                    stage = EnvelopeStage::Sustain;
                }
                break;

            case EnvelopeStage::Sustain:
                currentLevel = sustain;
                break;

            case EnvelopeStage::Release:
                currentLevel += multiplier;
                if (currentLevel <= 0.0f)
                {
                    currentLevel = 0.0f;
                    stage = EnvelopeStage::Idle;
                }
                break;
            }

            return currentLevel;
        }

        bool isActive() const
        {
            return stage != EnvelopeStage::Idle;
        }

        EnvelopeStage getStage() const
        {
            return stage;
        }

    private:
        float attack;
        float decay;
        float sustain;
        float release;
        float sampleRate;
        
        EnvelopeStage stage;
        float currentLevel;
        float multiplier;

        void calculateMultiplier()
        {
            switch (stage)
            {
            case EnvelopeStage::Attack:
                // Rise from currentLevel to 1.0
                multiplier = (1.0f - currentLevel) / (attack * sampleRate);
                break;

            case EnvelopeStage::Decay:
                // Fall from 1.0 to sustain
                multiplier = (sustain - 1.0f) / (decay * sampleRate);
                break;

            case EnvelopeStage::Release:
                // Fall from currentLevel to 0.0
                multiplier = -currentLevel / (release * sampleRate);
                break;

            default:
                multiplier = 0.0f;
                break;
            }
        }
    };
}
