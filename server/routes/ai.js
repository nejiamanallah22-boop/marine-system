// server/routes/ai.js
// ============================================================
// 🤖 REAL AI - GEMINI API - FIXED VERSION
// ============================================================

const express = require("express");
const router = express.Router();

// ============================================================
// 🔑 GEMINI API - REAL AI
// ============================================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyALT3OlkH6UsLefQbk7j_cgD8cZVJUyXvA";
const GEMINI_MODEL = "gemini-2.0-flash-exp";

// ============================================================
// 🧠 SYSTEM PROMPT - يجيب على أي سؤال
// ============================================================

const SYSTEM_PROMPT = `أنت "نظامي"، مساعد ذكي شامل ومتطور.

🌍 **مجالات معرفتك:**
- العلوم، التاريخ، الجغرافيا، الصحة، التكنولوجيا، الفلسفة
- الدين، الفنون، الرياضة، الطبخ، السفر، الاقتصاد
- السياسة، الثقافة، الأدب، الموسيقى، السينما
- وأي شيء آخر يسأل عنه المستخدم

📋 **تعليمات:**
- أجب على أي سؤال في أي مجال
- استخدم اللغة العربية الفصحى
- قدم معلومات دقيقة وشاملة
- كن ودوداً ومحترفاً
- إذا لم تعرف الإجابة، اذكر ذلك بصراحة

🌟 **أنت هنا لمساعدة المستخدم في أي شيء!**`;

// ============================================================
// 🚀 ASK AI
// ============================================================

router.post("/ask", async (req, res) => {
    try {
        const { message } = req.body;
        
        if (!message || message.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: "❌ الرسالة فارغة"
            });
        }

        console.log(`📤 السؤال: ${message}`);

        // ============================================================
        // 🔥 الاتصال بـ Gemini API
        // ============================================================
        
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{
                        role: "user",
                        parts: [{ text: message }]
                    }],
                    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                    generationConfig: {
                        temperature: 0.8,
                        maxOutputTokens: 2000,
                        topP: 0.95,
                        topK: 40
                    }
                })
            }
        );

        // ============================================================
        // 📥 معالجة الرد
        // ============================================================
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            console.error('❌ Gemini Error:', response.status, error);
            
            // رد بديل إذا فشل Gemini
            return res.json({
                success: true,
                response: `⚠️ **عذراً، حدث خطأ في الاتصال بـ Gemini**

📌 **الأسباب المحتملة:**
• مفتاح API غير صالح أو منتهي
• لا يوجد اتصال بالإنترنت
• الخدمة غير متاحة حالياً

💡 **يمكنك سؤالي عن:**
• أي سؤال في أي مجال
• سأجيبك بأفضل ما لدي!

🔄 **حاول مرة أخرى بعد دقائق**`,
                conversationId: 'fallback-' + Date.now(),
                version: "1.0.0-fallback"
            });
        }

        const data = await response.json();
        const result = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        console.log(`✅ الرد: ${result?.substring(0, 50)}...`);

        res.json({
            success: true,
            response: result || "⚠️ عذراً، لم أستطع معالجة طلبك.",
            conversationId: 'gemini-' + Date.now(),
            version: "1.0.0-gemini"
        });

    } catch (error) {
        console.error('❌ AI Error:', error);
        res.status(500).json({
            success: false,
            error: "❌ حدث خطأ في معالجة طلبك"
        });
    }
});

// ============================================================
// 🏥 HEALTH CHECK
// ============================================================

router.get("/health", (req, res) => {
    res.json({
        success: true,
        status: "healthy",
        version: "1.0.0-gemini",
        mode: "gemini-ai",
        gemini_key: GEMINI_API_KEY ? "✅ مفعل" : "❌ غير مفعل"
    });
});

module.exports = router;
