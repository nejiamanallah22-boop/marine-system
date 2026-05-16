// ==================== دوال التذاكر (تم إصلاحها بالكامل) ====================

async function sendTicket() {
    if(!currentUser) { 
        showToast("الرجاء تسجيل الدخول أولاً", true); 
        return; 
    }
    
    const subject = document.getElementById('ticketSubject').value.trim();
    const message = document.getElementById('ticketMessage').value.trim();
    
    if(!subject || !message) { 
        showToast("يرجى إدخال عنوان ورسالة الطلب", true); 
        return; 
    }
    
    try {
        const newTicket = {
            userName: currentUser.name,
            userRole: currentUser.role,
            subject: subject,
            message: message,
            date: getCurrentDate(),
            time: getCurrentTime(),
            status: 'قيد المعالجة',
            replies: []
        };
        
        const response = await fetch('/api/tickets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newTicket)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'فشل في إرسال التذكرة');
        }
        
        document.getElementById('ticketSubject').value = "";
        document.getElementById('ticketMessage').value = "";
        document.getElementById('ticketResponse').innerHTML = "✅ تم إرسال طلبك بنجاح! سيتم الرد عليك قريباً.";
        setTimeout(() => { document.getElementById('ticketResponse').innerHTML = ""; }, 3000);
        
        await renderTickets();
        await logActivity("إرسال تذكرة", `قام بإرسال تذكرة دعم: ${subject}`);
        showToast("✅ تم إرسال طلبك بنجاح");
        
    } catch(error) {
        console.error('خطأ في الإرسال:', error);
        showToast("خطأ في الإرسال: " + error.message, true);
    }
}

async function replyToTicket(ticketId) {
    if(!canManageUsers()) { 
        showToast("غير مسموح - فقط للمسؤول", true); 
        return; 
    }
    
    if (!ticketId) {
        showToast("خطأ: معرف التذكرة غير صالح", true);
        return;
    }
    
    const replyText = prompt("✏️ أدخل ردك على هذه التذكرة:");
    if(!replyText) return;
    
    try {
        const response = await fetch(`/api/tickets/${ticketId}/reply`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                reply: {
                    adminName: currentUser.name,
                    reply: replyText,
                    date: getCurrentDate(),
                    time: getCurrentTime()
                }
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'فشل في حفظ الرد');
        }
        
        await renderTickets();
        await logActivity("رد على تذكرة", `قام بالرد على التذكرة`);
        showToast("✅ تم إرسال الرد بنجاح");
        
    } catch(error) {
        console.error('خطأ في الرد:', error);
        showToast("خطأ في الرد: " + error.message, true);
    }
}

async function closeTicket(ticketId) {
    if(!canManageUsers()) { 
        showToast("غير مسموح - فقط للمسؤول", true); 
        return; 
    }
    
    if (!ticketId) {
        showToast("خطأ: معرف التذكرة غير صالح", true);
        return;
    }
    
    if(!confirm("هل أنت متأكد من إغلاق هذه التذكرة؟")) return;
    
    try {
        const response = await fetch(`/api/tickets/${ticketId}/close`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'فشل في إغلاق التذكرة');
        }
        
        await renderTickets();
        await logActivity("إغلاق تذكرة", `قام بإغلاق التذكرة`);
        showToast("✅ تم إغلاق التذكرة");
        
    } catch(error) {
        showToast("خطأ في الإغلاق: " + error.message, true);
    }
}

async function renderTickets() {
    try {
        let tickets = await loadTickets();
        let html = '<div class="scrollable-table"><table class="region-table"><thead>';
        html += '<tr>';
        html += '<th>#</th>';
        html += '<th>التاريخ</th>';
        html += '<th>الوقت</th>';
        html += '<th>المستخدم</th>';
        html += '<th>العنوان</th>';
        html += '<th>الحالة</th>';
        html += '<th>الرسالة</th>';
        html += '<th>الردود</th>';
        if(canManageUsers()) html += '<th>إجراءات</th>';
        html += '<tr></thead><tbody>';
        
        if(tickets.length === 0) {
            html += ' hilab <td colspan="9">📭 لا توجد تذاكر</td> </tr>';
        } else {
            tickets.forEach((t, index) => {
                const statusColor = t.status === 'مغلقة' ? '#888' : (t.status === 'تم الرد' ? '#28a745' : '#f39c12');
                const statusText = t.status === 'مغلقة' ? '✅ مغلقة' : (t.status === 'تم الرد' ? '💬 تم الرد' : '⏳ قيد المعالجة');
                const ticketId = t._id;
                
                html += `<tr>
                    <td>${index + 1}</td>
                    <td>${t.date || '-'}</td>
                    <td>${t.time || '-'}</td>
                    <td><b>${t.userName}</b><br><small>${t.userRole || ''}</small></td>
                    <td><strong>${t.subject}</strong></td>
                    <td style="color:${statusColor}; font-weight:bold;">${statusText}</td>
                    <td style="max-width:250px; text-align:right;">${t.message || '-'}</td>
                    <td style="max-width:300px; text-align:right;">`;
                
                if(t.replies && t.replies.length > 0) {
                    t.replies.forEach(reply => {
                        html += `<div class="ticket-reply">
                            <small>👤 ${reply.adminName} - ${reply.date} ${reply.time}</small>
                            <p style="margin:5px 0 0 0;">📝 ${reply.reply}</p>
                        </div>`;
                    });
                } else {
                    html += '<span style="color:#999;">لا توجد ردود</span>';
                }
                
                html += `</td>`;
                
                if(canManageUsers()) {
                    if(t.status !== 'مغلقة') {
                        html += `<td style="text-align:center;">
                            <button class="btn-sm btn-cyan" onclick="replyToTicket('${ticketId}')" style="background:#17a2b8; color:white; border:none; padding:5px 10px; border-radius:3px; cursor:pointer; margin:2px;">💬 رد</button>
                            <button class="btn-sm btn-red" onclick="closeTicket('${ticketId}')" style="background:#d9534f; color:white; border:none; padding:5px 10px; border-radius:3px; cursor:pointer; margin:2px;">🔒 إغلاق</button>
                        </td>`;
                    } else {
                        html += `<td style="text-align:center;"><span style="color:green;">✅ مغلقة</span></td>`;
                    }
                } else {
                    html += `<td>-</td>`;
                }
                
                html += `</tr>`;
            });
        }
        
        html += `</tbody>点心</div>`;
        document.getElementById('ticketsList').innerHTML = html;
    } catch(error) {
        console.error('خطأ في renderTickets:', error);
        document.getElementById('ticketsList').innerHTML = '<div class="region-table-card"><div class="region-table-header">❌ خطأ في تحميل التذاكر</div></div>';
    }
}
