// ============================================================
// 🤖 AI PROVIDERS CONFIGURATION
// ============================================================

class AIProvidersConfig {
    constructor() {
        // جميع المفاتيح من متغيرات البيئة
        this.providers = this.loadProviders();
        this.strategy = process.env.AI_STRATEGY || 'failover';
        this.maxTokens = parseInt(process.env.MAX_TOKENS) || 4000;
        this.temperature = parseFloat(process.env.TEMPERATURE) || 0.7;
        this.timeout = parseInt(process.env.AI_TIMEOUT) || 30000;
        this.retryAttempts = parseInt(process.env.AI_RETRY_ATTEMPTS) || 3;
        this.retryDelay = parseInt(process.env.AI_RETRY_DELAY) || 1000;
    }

    loadProviders() {
        const providers = [];

        // 1. Gemini Flash
        if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
            providers.push({
                name: 'gemini',
                type: 'gemini',
                apiKey: process.env.GEMINI_API_KEY,
                model: process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp',
                maxTokens: parseInt(process.env.GEMINI_MAX_TOKENS) || 4000,
                temperature: parseFloat(process.env.GEMINI_TEMPERATURE) || 0.7,
                priority: 1
            });
        }

        // 2. Gemini Pro
        if (process.env.GEMINI_PRO_API_KEY && process.env.GEMINI_PRO_API_KEY !== 'your_gemini_pro_api_key_here') {
            providers.push({
                name: 'gemini-pro',
                type: 'gemini',
                apiKey: process.env.GEMINI_PRO_API_KEY,
                model: process.env.GEMINI_PRO_MODEL || 'gemini-1.5-pro',
                maxTokens: parseInt(process.env.GEMINI_PRO_MAX_TOKENS) || 8000,
                priority: 2
            });
        }

        // 3. OpenAI
        if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here') {
            providers.push({
                name: 'openai',
                type: 'openai',
                apiKey: process.env.OPENAI_API_KEY,
                model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 4000,
                temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7,
                organization: process.env.OPENAI_ORG_ID,
                priority: 3
            });
        }

        // 4. OpenAI GPT-4
        if (process.env.OPENAI_GPT4_API_KEY && process.env.OPENAI_GPT4_API_KEY !== 'your_openai_gpt4_api_key_here') {
            providers.push({
                name: 'openai-gpt4',
                type: 'openai',
                apiKey: process.env.OPENAI_GPT4_API_KEY,
                model: process.env.OPENAI_GPT4_MODEL || 'gpt-4-turbo-preview',
                maxTokens: parseInt(process.env.OPENAI_GPT4_MAX_TOKENS) || 8000,
                priority: 4
            });
        }

        // 5. DeepSeek
        if (process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY !== 'your_deepseek_api_key_here') {
            providers.push({
                name: 'deepseek',
                type: 'deepseek',
                apiKey: process.env.DEEPSEEK_API_KEY,
                model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
                maxTokens: parseInt(process.env.DEEPSEEK_MAX_TOKENS) || 4000,
                temperature: parseFloat(process.env.DEEPSEEK_TEMPERATURE) || 0.7,
                priority: 5
            });
        }

        // 6. Claude
        if (process.env.CLAUDE_API_KEY && process.env.CLAUDE_API_KEY !== 'your_claude_api_key_here') {
            providers.push({
                name: 'claude',
                type: 'claude',
                apiKey: process.env.CLAUDE_API_KEY,
                model: process.env.CLAUDE_MODEL || 'claude-3-opus-20240229',
                maxTokens: parseInt(process.env.CLAUDE_MAX_TOKENS) || 10000,
                priority: 6
            });
        }

        // ترتيب حسب الأولوية
        providers.sort((a, b) => (a.priority || 0) - (b.priority || 0));

        return providers;
    }

    getActiveProviders() {
        return this.providers;
    }

    getProvider(name) {
        return this.providers.find(p => p.name === name);
    }

    getDefaultProvider() {
        return this.providers[0] || null;
    }

    hasProvider(name) {
        return this.providers.some(p => p.name === name);
    }

    getProviderCount() {
        return this.providers.length;
    }

    // التحقق من صحة المفاتيح
    validateKeys() {
        const issues = [];
        
        for (const provider of this.providers) {
            if (!provider.apiKey || provider.apiKey.startsWith('your_')) {
                issues.push(`⚠️ ${provider.name}: API key not configured properly`);
            }
        }

        if (issues.length > 0) {
            console.warn('⚠️ AI Provider Issues:');
            issues.forEach(issue => console.warn(issue));
        }

        return issues;
    }
}

module.exports = new AIProvidersConfig();
