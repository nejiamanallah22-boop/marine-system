// ============================================================
// الدعم - support.js
// ============================================================

function loadTickets() {
    const token = getToken();
    if (!token) return;
    fetch('/api/tickets', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        allTickets = data || [];
        renderTickets();
    })
    .catch(err => console.error('Load tickets error:', err));
}

function renderTickets() {
    const container = document.getElementById('ticketsList');
    if (!container) return;
    if (!allTickets || allTickets.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:rgba(255,255,255,0.2);">🚫 لا توجد تذاكر</div>';
        return;
    }
    container.innerHTML = allTickets.map(t => `
        <div style="background:rgba(255,255,255,0.02); padding:12px; margin:8px 0; border-radius:8px; border-right:3px solid ${t.status === 'مغلقة' ? '#4ade80' : '#fbbf24'};">
            <h4 style="color:rgba(255,255,255,0.8); margin:0;">${t.subject}</h4>
            <p style="color:rgba(255,255,255,0.5); margin:5px 0; font-size:13px;">${t.message}</p>
            <small style="color:rgba(255,255,255,0.3);">${t.date || ''} | ${t.userName || 'مجهول'}</small>
            <span style="background:rgba(251,191,36,0.1); color:#fbbf24; padding:2px 12px; border-radius:10px; font-size:11px; margin-right:10px;">${t.status || 'قيد المعالجة'}</span>
        </div>
    `).join('');
}

function sendTicket(event) {
    event.preventDefault();
    
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    
    const subject = document.getElementById('ticketSubject')?.value.trim();
    const message = document.getElementById('ticketMessage')?.value.trim();
    const priority = document.getElementById('ticketPriority')?.value || 'متوسطة';
    
    if (!subject || !message) {
        showAlert('⚠️ الرجاء ملء جميع الحقول', 'warning');
        return;
    }
    
    const btn = document.getElementById('sendTicketBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ جاري الإرسال...';
    }
    
    const data = {
        subject: subject,
        message: message,
        priority: priority,
        status: 'مفتوحة',
        userName: currentUser?.name || 'مجهول',
        date: new Date().toISOString().split('T')[0]
    };
    
    // إضافة محلياً أولاً
    const newTicket = {
        id: Date.now(),
        ...data
    };
    allTickets.push(newTicket);
    renderTickets();
    showAlert('✅ تم إرسال التذكرة بنجاح', 'success');
    document.getElementById('ticketSubject').value = '';
    document.getElementById('ticketMessage').value = '';
    
    fetch('/api/tickets', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            console.log('✅ Ticket saved to server');
        }
    })
    .catch(err => {
        console.warn('⚠️ Server not available, ticket saved locally');
    })
    .finally(() => {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '📨 إرسال التذكرة';
        }
    });
}

console.log('✅ support.js loaded');
