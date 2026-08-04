// ============================================================
// المساعد الذكي - ai-assistant.js
// ============================================================

function askAI(userMessage) {
    const input = document.getElementById('chatInput');
    const chatBox = document.getElementById('chatBox');
    const sendBtn = document.getElementById('sendBtn');
    const typingIndicator = document.getElementById('typingIndicator');
    
    let message = userMessage || input?.value?.trim();
    if (!message) {
        showAlert('⚠️ الرجاء كتابة سؤال', 'warning');
        return;
    }

    addMessage('user', message);
    if (input) input.value = '';
    if (sendBtn) sendBtn.disabled = true;
    if (typingIndicator) typingIndicator.style.display = 'block';
    scrollChatToBottom();

    setTimeout(() => {
        const response = generateAIResponse(message);
        addMessage('ai', response);
        if (typingIndicator) typingIndicator.style.display = 'none';
        if (sendBtn) sendBtn.disabled = false;
        scrollChatToBottom();
    }, 500 + Math.random() * 1000);
}

function addMessage(type, content) {
    const chatBox = document.getElementById('chatBox');
    if (!chatBox) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${type}`;
    
    const sender = type === 'user' ? '👤 أنت' : '🤖 المساعد الذكي';
    const time = new Date().toLocaleTimeString('ar-TN');

    let contentHTML = content;
    if (type === 'ai') {
        contentHTML = `
            ${content}
            <br>
            <button class="audio-btn" onclick="speakText(this.parentElement.textContent.replace(/[🔊استماع]/g, '').trim())">
                🔊 استماع
            </button>
        `;
        lastResponseText = content.replace(/<[^>]*>/g, '').trim();
        
        // تشغيل الصوت تلقائياً للردود الطويلة
        const cleanText = content.replace(/<[^>]*>/g, '').trim();
        if (cleanText.length > 20) {
            setTimeout(() => speakText(cleanText), 300);
        }
    }

    messageDiv.innerHTML = `
        <div class="sender">${sender}</div>
        <div class="content">${contentHTML}</div>
        <div class="time">${time}</div>
    `;

    chatBox.appendChild(messageDiv);
}

function scrollChatToBottom() {
    const chatBox = document.getElementById('chatBox');
    if (chatBox) {
        chatBox.scrollTop = chatBox.scrollHeight;
    }
}

function generateAIResponse(message) {
    const msg = message.toLowerCase();
    
    const totalVessels = allVessels.length;
    const readyVessels = allVessels.filter(v => v.stat === 'صالح').length;
    const brokenVessels = allVessels.filter(v => v.stat === 'معطب').length;
    const maintenanceVessels = allVessels.filter(v => v.stat === 'صيانة').length;
    const totalMaintenance = allMaintenance.length;
    const totalCost = allMaintenance.reduce((sum, r) => sum + (r.cost || 0), 0);
    const readyPercent = totalVessels > 0 ? Math.round((readyVessels / totalVessels) * 100) : 0;

    const developerInfo = `المبدع والمحترف الوكيل بالحرس الوطني التونسي أمان الله ناجي`;

    // السؤال عن المطور
    if (msg.includes('من صنع') || msg.includes('صانع') || msg.includes('مطور') || 
        msg.includes('المبرمج') || msg.includes('الذي صنع') || msg.includes('صمم') ||
        msg.includes('من عمل') || msg.includes('المبدع') || msg.includes('الوكيل') ||
        msg.includes('الحرس') || msg.includes('أمان الله') || msg.includes('ناجي')) {
        return `🌟 <strong>تم تطوير هذا النظام بواسطة:</strong><br><br>
        👨‍💻 <strong>${developerInfo}</strong><br><br>
        🏆 هذا التطبيق هو نتاج خبرة وكفاءة عالية في مجال البرمجة وتطوير الأنظمة البحرية.<br>
        📌 يتميز النظام بالدقة والاحترافية والجودة العالية.<br><br>
        🔹 <em>${developerInfo} هو مبرمج محترف ومبدع في مجال تطوير الأنظمة الإدارية والبحرية.</em>`;
    }

    // الترحيب
    if (msg.includes('مرحبا') || msg.includes('السلام') || msg.includes('اهلاً') || msg.includes('هلو')) {
        return `👋 وعليكم السلام! كيف يمكنني مساعدتك اليوم؟<br><br>
        يمكنك أن تسألني عن:<br>
        • 📊 حالة المراكب<br>
        • 🔧 إحصائيات الصيانة<br>
        • 🔮 توقع الأعطال<br>
        • 💡 نصائح لتحسين الأداء<br>
        • 👨‍💻 من صنع هذا التطبيق`;
    }

    // المراكب الصالحة
    if (msg.includes('صالحة') || msg.includes('صالح') || msg.includes('جاهزة')) {
        return `🚢 عدد المراكب الصالحة: <strong>${readyVessels}</strong> من أصل ${totalVessels}<br>
        نسبة الجاهزية: <strong>${readyPercent}%</strong><br><br>
        ${readyPercent >= 70 ? '✅ الأداء جيد جداً' : '⚠️ هناك مجال للتحسين'}<br><br>
        📌 هذا النظام من تطوير <strong>${developerInfo}</strong>`;
    }

    // المراكب المعطبة
    if (msg.includes('معطبة') || msg.includes('معطب') || msg.includes('عطل')) {
        const brokenList = allVessels.filter(v => v.stat === 'معطب').map(v => v.name).join('، ');
        return `⚠️ عدد المراكب المعطبة: <strong>${brokenVessels}</strong><br>
        ${brokenVessels > 0 ? `المراكب المعطبة: ${brokenList}` : '✅ لا توجد مراكب معطبة حالياً'}<br><br>
        🔹 نظام متابعة الأسطول من تطوير <strong>${developerInfo}</strong>`;
    }

    // إحصائيات الصيانة
    if (msg.includes('صيانة') || msg.includes('تكاليف') || msg.includes('تكلفة')) {
        const completed = allMaintenance.filter(r => r.status === 'مكتملة').length;
        const inProgress = allMaintenance.filter(r => r.status === 'قيد الإنجاز').length;
        return `🔧 إحصائيات الصيانة:<br>
        • 📊 إجمالي السجلات: <strong>${totalMaintenance}</strong><br>
        • ✅ مكتملة: <strong>${completed}</strong><br>
        • 🔄 قيد الإنجاز: <strong>${inProgress}</strong><br>
        • 💰 التكلفة الإجمالية: <strong>${totalCost.toLocaleString()} د.ت</strong><br><br>
        🔹 هذا النظام من تطوير <strong>${developerInfo}</strong>`;
    }

    // توقع الأعطال
    if (msg.includes('توقع') || msg.includes('متوقع') || msg.includes('تنبؤ')) {
        const highRisk = allVessels.filter(v => {
            const age = v.fDate ? (new Date() - new Date(v.fDate)) / (1000 * 60 * 60 * 24 * 30) : 0;
            return age > 12 && v.stat === 'صالح';
        });
        
        const recommendations = highRisk.length > 0 
            ? `⚠️ هناك ${highRisk.length} مركب يحتاج إلى فحص:<br>${highRisk.map(v => `• ${v.name}`).join('<br>')}`
            : '✅ جميع المراكب في حالة جيدة';
        
        return `🔮 توقع الأعطال:<br><br>
        • المراكب المعطبة حالياً: ${brokenVessels}<br>
        • المراكب في الصيانة: ${maintenanceVessels}<br>
        • ${recommendations}<br><br>
        📌 نظام متابعة وتوقع الأعطال من تطوير <strong>${developerInfo}</strong>`;
    }

    // تقرير شامل
    if (msg.includes('تقرير') || msg.includes('ملخص') || msg.includes('شامل')) {
        return `📊 <strong>تقرير شامل عن الأسطول</strong><br><br>
        🚢 <strong>المراكب:</strong><br>
        • المجموع: ${totalVessels}<br>
        • صالح: ${readyVessels} (${readyPercent}%)<br>
        • معطب: ${brokenVessels}<br>
        • صيانة: ${maintenanceVessels}<br><br>
        🔧 <strong>الصيانة:</strong><br>
        • إجمالي السجلات: ${totalMaintenance}<br>
        • التكلفة الإجمالية: ${totalCost.toLocaleString()} د.ت<br><br>
        📌 <strong>التوصيات:</strong><br>
        ${readyPercent < 70 ? '• ⚠️ يوصى بتحسين نسبة الجاهزية' : '• ✅ الأداء جيد'}<br>
        ${brokenVessels > 0 ? '• ⚠️ يجب إصلاح المراكب المعطبة' : '• ✅ لا توجد مراكب معطبة'}<br><br>
        🔹 هذا التقرير من تطوير <strong>${developerInfo}</strong>`;
    }

    // الوحدات البحرية
    if (msg.includes('وحدة') || msg.includes('وحدات') || msg.includes('إسناد')) {
        const units = {};
        allVessels.forEach(v => {
            if (v.supp) {
                units[v.supp] = (units[v.supp] || 0) + 1;
            }
        });
        let unitText = Object.entries(units)
            .map(([unit, count]) => `• ${unit}: ${count} مركب`)
            .join('<br>');
        return `🏭 <strong>الوحدات البحرية</strong><br><br>
        ${unitText || 'لا توجد وحدات مسجلة'}<br><br>
        🔹 نظام متابعة الوحدات من تطوير <strong>${developerInfo}</strong>`;
    }

    // نصائح تحسين
    if (msg.includes('نصائح') || msg.includes('تحسين') || msg.includes('تطوير')) {
        const tips = [];
        if (readyPercent < 70) tips.push('• ⚠️ زيادة الصيانة الدورية لتحسين الجاهزية');
        if (brokenVessels > 3) tips.push('• 🔧 تخصيص فرق لإصلاح المراكب المعطبة');
        if (totalCost > 10000) tips.push('• 💰 مراجعة عقود الصيانة لتقليل التكاليف');
        if (tips.length === 0) tips.push('• ✅ الأداء ممتاز، استمر في الصيانة الدورية');
        tips.push('• 📊 استخدام الذكاء الاصطناعي لتحليل الأعطال المتكررة');
        
        return `💡 <strong>نصائح لتحسين الأداء</strong><br><br>
        ${tips.join('<br>')}<br><br>
        🔹 تم إعداد هذه النصائح بواسطة <strong>${developerInfo}</strong>`;
    }

    // مساعدة
    if (msg.includes('مساعدة') || msg.includes('كيف') || msg.includes('طريقة')) {
        return `❓ <strong>كيف يمكنني مساعدتك؟</strong><br><br>
        إليك بعض الأمثلة لما يمكنك سؤالي عنه:<br><br>
        • 🚢 "كم عدد المراكب الصالحة؟"<br>
        • ⚠️ "عرض المراكب المعطبة"<br>
        • 🔧 "إحصائيات الصيانة"<br>
        • 🔮 "توقع الأعطال القادمة"<br>
        • 📊 "تقرير شامل عن الأسطول"<br>
        • 💡 "نصائح لتحسين الأداء"<br>
        • 🏭 "الوحدات البحرية"<br>
        • 👨‍💻 "من صنع هذا التطبيق"<br><br>
        🔹 هذا النظام من تطوير <strong>${developerInfo}</strong>`;
    }

    // رد افتراضي
    return `🤔 لم أفهم سؤالك بالكامل.<br><br>
    يمكنك أن تسألني عن:<br>
    • 📊 حالة المراكب والجاهزية<br>
    • 🔧 إحصائيات الصيانة والتكاليف<br>
    • 🔮 توقع الأعطال<br>
    • 💡 نصائح لتحسين الأداء<br>
    • 🏭 معلومات عن الوحدات البحرية<br>
    • 👨‍💻 من صنع هذا التطبيق<br><br>
    أو اكتب "مساعدة" لعرض جميع الخيارات.<br><br>
    🔹 هذا النظام من تطوير <strong>${developerInfo}</strong>`;
}

console.log('✅ ai-assistant.js loaded');
