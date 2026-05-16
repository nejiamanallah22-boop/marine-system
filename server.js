// ==================== Helpers ====================
const escapeHTML = (str) =>
    String(str || '').replace(/[&<>"']/g, m => ({
        '&':'&amp;',
        '<':'&lt;',
        '>':'&gt;',
        '"':'&quot;',
        "'":'&#039;'
    }[m]));

const getTicketId = (t) => t._id || t.id;

// ==================== إرسال تذكرة ====================
async function sendTicket() {
    if (!currentUser) {
        showToast("الرجاء تسجيل الدخول أولاً", true);
        return;
    }

    const subject = document.getElementById('ticketSubject').value.trim();
    const message = document.getElementById('ticketMessage').value.trim();

    if (!subject || !message) {
        showToast("يرجى إدخال عنوان ورسالة الطلب", true);
        return;
    }

    try {
        const newTicket = {
            userName: currentUser.name,
            userRole: currentUser.role,
            subject,
            message,
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

        document.getElementById('ticketResponse').innerHTML =
            "✅ تم إرسال طلبك بنجاح! سيتم الرد عليك قريباً.";

        setTimeout(() => {
            document.getElementById('ticketResponse').innerHTML = "";
        }, 3000);

        await renderTickets();
        await logActivity("إرسال تذكرة", `تم إرسال تذكرة: ${subject}`);
        showToast("تم الإرسال بنجاح");

    } catch (error) {
        console.error(error);
        showToast("خطأ: " + error.message, true);
    }
}

// ==================== رد على تذكرة ====================
async function replyToTicket(ticketId) {
    if (!canManageUsers()) {
        showToast("غير مسموح - للمسؤول فقط", true);
        return;
    }

    if (!ticketId) {
        showToast("خطأ: معرف التذكرة غير صالح", true);
        return;
    }

    const replyText = prompt("✏️ اكتب الرد:");
    if (!replyText) return;

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
            throw new Error(error.error || 'فشل الرد');
        }

        await renderTickets();
        await logActivity("رد على تذكرة", `تم الرد على التذكرة`);
        showToast("تم إرسال الرد");

    } catch (error) {
        console.error(error);
        showToast("خطأ: " + error.message, true);
    }
}

// ==================== إغلاق تذكرة ====================
async function closeTicket(ticketId) {
    if (!canManageUsers()) {
        showToast("غير مسموح - للمسؤول فقط", true);
        return;
    }

    if (!ticketId) {
        showToast("خطأ: معرف التذكرة غير صالح", true);
        return;
    }

    if (!confirm("هل تريد إغلاق التذكرة؟")) return;

    try {
        const response = await fetch(`/api/tickets/${ticketId}/close`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'فشل الإغلاق');
        }

        await renderTickets();
        await logActivity("إغلاق تذكرة", `تم إغلاق التذكرة`);
        showToast("تم الإغلاق");

    } catch (error) {
        console.error(error);
        showToast("خطأ: " + error.message, true);
    }
}

// ==================== عرض التذاكر ====================
async function renderTickets() {
    try {
        const tickets = await loadTickets();

        let html = `
        <div class="scrollable-table">
        <table class="region-table">
        <thead>
            <tr>
                <th>#</th>
                <th>التاريخ</th>
                <th>الوقت</th>
                <th>المستخدم</th>
                <th>العنوان</th>
                <th>الحالة</th>
                <th>الرسالة</th>
                <th>الردود</th>
                ${canManageUsers() ? '<th>إجراءات</th>' : ''}
            </tr>
        </thead>
        <tbody>
        `;

        if (!tickets || tickets.length === 0) {
            html += `
            <tr>
                <td colspan="${canManageUsers() ? 9 : 8}" style="text-align:center;">
                    📭 لا توجد تذاكر
                </td>
            </tr>
            `;
        } else {

            tickets.forEach((t, index) => {

                const ticketId = getTicketId(t);
                if (!ticketId) return;

                const statusColor =
                    t.status === 'مغلقة' ? '#888' :
                    t.status === 'تم الرد' ? '#28a745' : '#f39c12';

                const statusText =
                    t.status === 'مغلقة' ? '✅ مغلقة' :
                    t.status === 'تم الرد' ? '💬 تم الرد' : '⏳ قيد المعالجة';

                html += `
                <tr>
                    <td>${index + 1}</td>
                    <td>${t.date || '-'}</td>
                    <td>${t.time || '-'}</td>

                    <td>
                        <b>${escapeHTML(t.userName)}</b><br>
                        <small>${escapeHTML(t.userRole)}</small>
                    </td>

                    <td><strong>${escapeHTML(t.subject)}</strong></td>

                    <td style="color:${statusColor}; font-weight:bold;">
                        ${statusText}
                    </td>

                    <td style="max-width:250px; text-align:right;">
                        ${escapeHTML(t.message)}
                    </td>

                    <td style="max-width:300px; text-align:right;">
                `;

                if (t.replies?.length) {
                    t.replies.forEach(r => {
                        html += `
                        <div class="ticket-reply">
                            <small>👤 ${escapeHTML(r.adminName)} - ${r.date} ${r.time}</small>
                            <p>📝 ${escapeHTML(r.reply)}</p>
                        </div>
                        `;
                    });
                } else {
                    html += `<span style="color:#999;">لا توجد ردود</span>`;
                }

                html += `</td>`;

                if (canManageUsers()) {
                    if (t.status !== 'مغلقة') {
                        html += `
                        <td style="text-align:center;">
                            <button onclick="replyToTicket('${ticketId}')"
                                style="background:#17a2b8;color:white;border:none;padding:5px 10px;margin:2px;">
                                💬 رد
                            </button>

                            <button onclick="closeTicket('${ticketId}')"
                                style="background:#d9534f;color:white;border:none;padding:5px 10px;margin:2px;">
                                🔒 إغلاق
                            </button>
                        </td>
                        `;
                    } else {
                        html += `<td style="text-align:center;color:green;">✅ مغلقة</td>`;
                    }
                } else {
                    html += `<td>-</td>`;
                }

                html += `</tr>`;
            });
        }

        html += `
        </tbody>
        </table>
        </div>
        `;

        document.getElementById('ticketsList').innerHTML = html;

    } catch (error) {
        console.error(error);
        document.getElementById('ticketsList').innerHTML =
            '<div>❌ خطأ في تحميل التذاكر</div>';
    }
}
