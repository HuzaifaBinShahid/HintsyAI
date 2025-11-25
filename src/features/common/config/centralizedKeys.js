const CENTRALIZED_API_KEYS = {
    openai: {
        api_key: process.env.OPENAI_API_KEY,
        provider: 'openai',
        models: ['gpt-4', 'gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo']
    },

    gemini: {
        api_key: process.env.GEMINI_API_KEY,
        provider: 'gemini',
        models: ['gemini-pro', 'gemini-flash']
    },

    deepgram: {
        api_key: process.env.DEEPGRAM_API_KEY,
        provider: 'deepgram',
        models: ['nova', 'nova-2', 'enhanced']
    },

    anthropic: {
        api_key: process.env.ANTHROPIC_API_KEY,
        provider: 'anthropic',
        models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku']
    },

    groq: {
        api_key: process.env.GROQ_API_KEY,
        provider: 'groq',
        models: ['openai/gpt-oss-120b', 'llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768']
    }
};

const SUBSCRIPTION_PLANS = {
    free: {
        name: 'Free',
        price: 0,
        models: ['groq', 'openai', 'gemini'],
        monthlyRequests: 15,
        features: ['Basic LLM Access', 'Standard STT', 'Community Support', 'Fast Groq Inference']
    },
    pro: {
        name: 'Pro',
        price: 10,
        models: ['groq', 'openai', 'gemini', 'anthropic'],
        monthlyRequests: -1,
        features: ['All LLM Models', 'Advanced STT', 'Priority Support', 'Custom Models', 'Unlimited Requests', 'Fast Groq Inference']
    }
};

const USAGE_CONFIG = {
    enableUsageTracking: true,
    trackPerUser: true,
    trackPerModel: true,
    billingCycle: 'monthly',
    overageRate: 0.01 
};

module.exports = {
    CENTRALIZED_API_KEYS,
    SUBSCRIPTION_PLANS,
    USAGE_CONFIG,
    
    getApiKey: (provider) => {
        return CENTRALIZED_API_KEYS[provider]?.api_key || null;
    },
    
    getModelsForPlan: (planName) => {
        const plan = SUBSCRIPTION_PLANS[planName];
        return plan ? plan.models : [];
    },
    isModelAvailableForPlan: (model, planName) => {
        const plan = SUBSCRIPTION_PLANS[planName];
        if (!plan) return false;
        return plan.models.includes(model);
    }
}; 