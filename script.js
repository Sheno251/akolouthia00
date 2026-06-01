// أكولوثيا – نظام المتابعة - الإصدار النهائي مع الإضافات

// ========================================
// البيانات الأساسية
// ========================================

const ALL_MEMBERS = [
    "مارتيروس جمال", "نرمين فرج الله", "ميرنا فام", "بيشوي صفوت", "شنوده نصحي", "سيلفيا طلعت",
    "سيمون سمعان", "كرستينا ميلاد", "ماري بشاي", "ابانوب فرج الله", "امال عادل", "باسم جابر",
    "هاله عادل", "دميانه سمعان", "فام روماني", "ويصا مرزق", "ماري هاني", "مينا فام", "فيولا طلعت"
];

const ADMIN_ACCOUNTS = [
    { username: "frmina", password: "admin123" },
    { username: "admin2", password: "admin123" },
    { username: "admin3", password: "admin123" }
];

const ALL_NAMES = [...ALL_MEMBERS, "shenouda", "admin2", "admin3"];
const MONTHS_COUNT = 12;
const MAX_NOTE_LENGTH = 300;

// متغيرات الحالة العامة
let currentMember = null;
let currentMonth = 0;
let fromAdminEdit = false;
let isAdminLoggedIn = false;
let currentFilter = 'monthly';
let attendanceCache = [];
let dataLoaded = false;
let pinnedMonth = localStorage.getItem('pinnedMonth') !== null ? parseInt(localStorage.getItem('pinnedMonth')) : null;
let currentUsername = null;
let currentUserRole = null;

// البحث والفلترة
let filteredMembersList = [...ALL_MEMBERS];
let searchActive = false;

// ========================================
// تكامل Google Sheets
// ========================================

async function loadDataFromSheet() {
    if (dataLoaded) return attendanceCache;
    try {
        const response = await fetch(SCRIPT_URL);
        const json = await response.json();
        if (json.attendance) attendanceCache = json.attendance;
        dataLoaded = true;
        console.log(`✅ تم تحميل ${attendanceCache.length} سجل`);
        
        // تحديث الإشعار التحذيري
        updateGlobalWarningNotification();
        
    } catch (error) {
        console.error("خطأ في تحميل البيانات:", error);
    }
    return attendanceCache;
}

async function saveToSheet(record) {
    try {
        await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(record)
        });
        attendanceCache.push(record);
        console.log("✅ تم حفظ:", record);
    } catch (error) {
        console.error("خطأ في الحفظ:", error);
    }
}

async function syncAllData() {
    await fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({ action: 'delete_all' })
    });
    for (const record of attendanceCache) {
        await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(record)
        });
    }
}

// ========================================
// إدارة الوقت الرسمي
// ========================================

function getOfficialTime() {
    return localStorage.getItem('officialTime') || '09:00';
}

function updateOfficialTime() {
    const newTime = document.getElementById('newOfficialTime').value;
    if (!newTime) return;
    localStorage.setItem('officialTime', newTime);
    document.getElementById('currentOfficialTime').innerText = newTime;
    alert('✅ تم تحديث الموعد الرسمي');
}

function calculateLateMinutes() {
    const officialTime = getOfficialTime();
    const [officialHour, officialMinute] = officialTime.split(':').map(Number);
    const now = new Date();
    const lateMinutes = (now.getHours() - officialHour) * 60 + (now.getMinutes() - officialMinute);
    return lateMinutes > 0 ? lateMinutes : 0;
}

function formatLateTime(actualTime) {
    if (!actualTime) return 'لم يسجل';
    return actualTime;
}

// ========================================
// تسجيل الحضور والغياب
// ========================================

async function recordStatus(status) {
    if (!currentMember) return;

    const targetMonth = pinnedMonth !== null ? pinnedMonth : currentMonth;
    const now = new Date();
    const lateMinutes = status === 'late' ? calculateLateMinutes() : 0;
    const actualTime = now.toLocaleTimeString('ar-EG');

    const record = [
        currentMember,
        targetMonth + 1,
        now.toISOString().slice(0, 10),
        status,
        actualTime,
        lateMinutes,
        ""
    ];

    await saveToSheet(record);
    await updateMemberView();

    if (!document.getElementById('adminDashboard').classList.contains('hidden')) {
        await updateAdminView();
    }

    alert(`✅ تم تسجيل ${getStatusText(status)} في شهر ${targetMonth + 1}`);
}

async function recordLateAuto() {
    await recordStatus('late');
}

function getStatusText(status) {
    const statusMap = {
        'present': 'الحضور',
        'late': 'التأخير',
        'absent': 'الغياب بدون عذر',
        'excused': 'الغياب بعذر',
        'travel': 'السفر'
    };
    return statusMap[status] || status;
}

function getStatusIcon(status) {
    const icons = {
        'present': '✅',
        'late': '⏰',
        'absent': '❌',
        'excused': '📝',
        'travel': '✈️'
    };
    return icons[status] || '📌';
}

// ========================================
// حساب الإحصائيات
// ========================================

async function calculateStats(name, month) {
    await loadDataFromSheet();
    const records = attendanceCache.filter(r => r[0] === name && r[1] === month + 1);

    let presentCount = 0, lateCount = 0, excusedCount = 0, absentCount = 0, travelCount = 0;
    let totalLateMinutes = 0;
    let lastLateTime = null;
    let allLateDetails = [];

    records.forEach(record => {
        const status = record[3];
        if (status === 'present') presentCount++;
        else if (status === 'late') {
            lateCount++;
            totalLateMinutes += parseInt(record[5]) || 0;
            if (!lastLateTime) lastLateTime = record[4];
            allLateDetails.push({
                time: record[4],
                date: record[2],
                minutes: record[5]
            });
        } else if (status === 'excused') excusedCount++;
        else if (status === 'absent') absentCount++;
        else if (status === 'travel') travelCount++;
    });

    const totalRecords = records.length;
    const totalPresent = presentCount + lateCount;
    const presentRate = totalRecords ? Math.round((totalPresent / totalRecords) * 100) : 0;

    return {
        presentRate,
        excusedRate: totalRecords ? Math.round((excusedCount / totalRecords) * 100) : 0,
        absentRate: totalRecords ? Math.round((absentCount / totalRecords) * 100) : 0,
        travelRate: totalRecords ? Math.round((travelCount / totalRecords) * 100) : 0,
        totalRecords,
        lateCount,
        avgLate: lateCount ? Math.round(totalLateMinutes / lateCount) : 0,
        presentCount: totalPresent,
        excusedCount,
        absentCount,
        travelCount,
        lastLateTime,
        allLateDetails
    };
}

// ========================================
// الإشعار التحذيري الأحمر (للجميع)
// ========================================

function getViolatingMembers() {
    const LATE_MINUTES_THRESHOLD = 30;  // نصف ساعة
    const COUNT_THRESHOLD = 2;           // مرتين
    const violatingMembers = [];
    
    for (const name of ALL_MEMBERS) {
        const records = attendanceCache.filter(r => r[0] === name && r[1] === currentMonth + 1);
        
        let lateCount = 0;
        let absentCount = 0;
        
        records.forEach(record => {
            const status = record[3];
            if (status === 'late') {
                const lateMinutes = parseInt(record[5]) || 0;
                if (lateMinutes >= LATE_MINUTES_THRESHOLD) {
                    lateCount++;
                }
            } else if (status === 'absent') {
                absentCount++;
            }
        });
        
        if (lateCount >= COUNT_THRESHOLD || absentCount >= COUNT_THRESHOLD) {
            violatingMembers.push({
                name,
                lateCount,
                absentCount
            });
        }
    }
    
    return violatingMembers;
}

function updateGlobalWarningNotification() {
    const notificationArea = document.getElementById('globalNotificationArea');
    if (!notificationArea) return;
    
    // نعرض الإشعار فقط لو الشاشة الحالية هي memberScreen
    const isMemberScreen = document.getElementById('memberScreen') && !document.getElementById('memberScreen').classList.contains('hidden');
    const isAdminDashboard = document.getElementById('adminDashboard') && !document.getElementById('adminDashboard').classList.contains('hidden');
    
    if (!isMemberScreen && !isAdminDashboard) {
        notificationArea.style.display = 'none';
        return;
    }
    
    const violatingMembers = getViolatingMembers();
    
    if (violatingMembers.length === 0) {
        notificationArea.style.display = 'none';
        return;
    }
    
    let membersHtml = '<ul style="margin:10px 0; padding-right:20px;">';
    violatingMembers.forEach(member => {
        let reasons = [];
        if (member.lateCount >= 2) reasons.push(`تأخر (${member.lateCount} مرات)`);
        if (member.absentCount >= 2) reasons.push(`غياب بدون عذر (${member.absentCount} مرات)`);
        membersHtml += `<li style="margin:5px 0;"><strong>${member.name}</strong>: ${reasons.join(' و ')}</li>`;
    });
    membersHtml += '</ul>';
    
    notificationArea.innerHTML = `
        <div class="warning-notification" id="warningNotificationBox">
            <div class="warning-header">
                ⚠️ تنبيه: أعضاء تجاوزوا الحد المسموح
            </div>
            ${membersHtml}
            <div class="warning-footer">
                <span>🕒 آخر تحديث: ${new Date().toLocaleDateString('ar-EG')}</span>
                <button class="warning-close" onclick="this.closest('.warning-notification').style.display='none'">تجاهل</button>
            </div>
        </div>
    `;
    notificationArea.style.display = 'block';
}

// ========================================
// إدارة الملاحظات
// ========================================

async function getNotesList(name, month) {
    await loadDataFromSheet();
    return attendanceCache
        .filter(r => r[0] === name && r[1] === month + 1 && r[3] === 'note' && r[6])
        .map(r => ({ text: r[6], date: r[2], time: r[4] }));
}

function canUserModifyNotes() {
    return currentUsername === 'shenouda';
}

function showNoteDialog(name) {
    if (!canUserModifyNotes()) {
        alert('⚠️ غير مسموح لك بإضافة ملاحظات. هذه الخاصية متاحة فقط لـ shenouda');
        return;
    }

    const dialog = document.createElement('div');
    dialog.className = 'dialog';
    dialog.id = 'noteDialog';
    dialog.innerHTML = `
        <div class="dialog-content">
            <h3>📝 إضافة ملاحظة جديدة لـ ${name}</h3>
            <textarea id="newNoteText" rows="4" placeholder="اكتب ملاحظتك... (حد أقصى ${MAX_NOTE_LENGTH} حرف)"></textarea>
            <div style="font-size:12px; color:#666; margin-top:5px;" id="charCount">0 / ${MAX_NOTE_LENGTH} حرف</div>
            <button onclick="addNote('${name}')" class="btn-primary">➕ إضافة</button>
            <button onclick="closeNoteDialog()" class="btn-secondary">إلغاء</button>
            <hr>
            <h4>الملاحظات السابقة</h4>
            <div id="notesList"></div>
        </div>
    `;
    document.body.appendChild(dialog);
    
    const textarea = document.getElementById('newNoteText');
    if (textarea) {
        textarea.addEventListener('input', function() {
            const count = this.value.length;
            const counter = document.getElementById('charCount');
            if (counter) {
                counter.innerHTML = `${count} / ${MAX_NOTE_LENGTH} حرف`;
                if (count > MAX_NOTE_LENGTH) {
                    counter.style.color = '#ef4444';
                } else {
                    counter.style.color = '#666';
                }
            }
        });
    }
    
    refreshNotesList(name);
}

async function refreshNotesList(name) {
    const notes = await getNotesList(name, currentMonth);
    const container = document.getElementById('notesList');
    if (!container) return;

    if (notes.length === 0) {
        container.innerHTML = '<p style="color:#64748b;">لا توجد ملاحظات</p>';
        return;
    }

    const canDelete = canUserModifyNotes();

    container.innerHTML = notes.map((note, index) => `
        <div style="border-bottom: 1px solid #e2e8f0; padding: 12px; margin-bottom: 10px;">
            <small style="color:#64748b;">${note.date} ${note.time}</small>
            <p style="margin: 8px 0; font-size:16px;">${escapeHtml(note.text)}</p>
            ${canDelete ? `<button onclick="deleteNote('${name}', ${index})" class="btn-edit" style="background:#ef4444;">🗑️ حذف</button>` : ''}
        </div>
    `).join('');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function closeNoteDialog() {
    const dialog = document.getElementById('noteDialog');
    if (dialog) dialog.remove();
}

async function addNote(name) {
    const noteText = document.getElementById('newNoteText')?.value;
    if (!noteText?.trim()) {
        alert('الرجاء كتابة ملاحظة');
        return;
    }
    
    if (noteText.length > MAX_NOTE_LENGTH) {
        alert(`⚠️ الملاحظة طويلة جداً. الحد الأقصى هو ${MAX_NOTE_LENGTH} حرفاً.`);
        return;
    }

    const targetMonth = pinnedMonth !== null ? pinnedMonth : currentMonth;
    const now = new Date();
    const record = [
        name,
        targetMonth + 1,
        now.toISOString().slice(0, 10),
        'note',
        now.toLocaleTimeString(),
        0,
        noteText
    ];

    await saveToSheet(record);
    await loadDataFromSheet();
    refreshNotesList(name);
    document.getElementById('newNoteText').value = '';
    const counter = document.getElementById('charCount');
    if (counter) counter.innerHTML = `0 / ${MAX_NOTE_LENGTH} حرف`;
    await updateMemberView();
    if (!document.getElementById('adminDashboard').classList.contains('hidden')) await updateAdminView();
    alert('✅ تم إضافة الملاحظة');
}

async function deleteNote(name, index) {
    if (!confirm('هل أنت متأكد من حذف هذه الملاحظة؟')) return;

    const notes = await getNotesList(name, currentMonth);
    if (!notes[index]) return;

    const targetNote = notes[index];
    const recordToDelete = attendanceCache.find(r =>
        r[0] === name &&
        r[1] === currentMonth + 1 &&
        r[2] === targetNote.date &&
        r[4] === targetNote.time &&
        r[3] === 'note' &&
        r[6] === targetNote.text
    );

    if (recordToDelete) {
        const idx = attendanceCache.indexOf(recordToDelete);
        if (idx !== -1) attendanceCache.splice(idx, 1);
        await syncAllData();
        await loadDataFromSheet();
        refreshNotesList(name);
        await updateMemberView();
        if (!document.getElementById('adminDashboard').classList.contains('hidden')) await updateAdminView();
        alert('✅ تم حذف الملاحظة');
    }
}

// ========================================
// تصفية واسترجاع البيانات
// ========================================

function getMemberRecords(name, month, filter = 'monthly') {
    let records = attendanceCache.filter(r => r[0] === name && r[1] === month + 1);

    if (filter === 'weekly') {
        const today = new Date();
        const lastSaturday = new Date(today.setDate(today.getDate() - ((today.getDay() + 1) % 7)));
        const saturdayStr = lastSaturday.toISOString().slice(0, 10);
        records = records.filter(r => r[2] === saturdayStr);
    }

    return records;
}

function getLatecomers(month, filter = 'monthly') {
    const lateList = [];
    for (const name of ALL_MEMBERS) {
        const records = getMemberRecords(name, month, filter);
        records.forEach(record => {
            if (record[3] === 'late') {
                lateList.push({
                    name,
                    time: record[4],
                    date: record[2],
                    minutes: record[5]
                });
            }
        });
    }
    return lateList;
}

function formatDateRange() {
    const today = new Date();
    const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };

    if (currentFilter === 'weekly') {
        const lastSaturday = new Date(today.setDate(today.getDate() - ((today.getDay() + 1) % 7)));
        return `📅 التقرير الأسبوعي - ${lastSaturday.toLocaleDateString('ar-EG', options)}`;
    }

    return `📅 التقرير الشهري - شهر ${currentMonth + 1} - ${today.toLocaleDateString('ar-EG', options)}`;
}

// ========================================
// البحث والفلترة
// ========================================

function searchMembers() {
    const searchTerm = document.getElementById('searchMemberInput').value.toLowerCase().trim();
    
    if (searchTerm === '') {
        resetSearch();
        return;
    }
    
    filteredMembersList = ALL_MEMBERS.filter(name => name.toLowerCase().includes(searchTerm));
    searchActive = true;
    displayFilteredCards();
}

function resetSearch() {
    filteredMembersList = [...ALL_MEMBERS];
    searchActive = false;
    document.getElementById('searchMemberInput').value = '';
    displayFilteredCards();
}

// ========================================
// تصدير Excel (CSV)
// ========================================

function exportToCSV() {
    if (!attendanceCache.length) {
        alert('لا توجد بيانات لتصديرها');
        return;
    }
    
    const monthData = attendanceCache.filter(r => r[1] === currentMonth + 1);
    
    if (!monthData.length) {
        alert(`لا توجد بيانات في شهر ${currentMonth + 1}`);
        return;
    }
    
    let csvContent = "\uFEFFالتاريخ,العضو,الحالة,وقت الحضور,دقائق التأخير,الملاحظات\n";
    
    monthData.forEach(record => {
        const row = [
            record[2],
            record[0],
            getStatusText(record[3]),
            record[4],
            record[5],
            (record[6] || "").replace(/,/g, ' ')
        ].join(',');
        csvContent += row + '\n';
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', `تقرير_شهر_${currentMonth + 1}_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    alert('✅ تم تصدير البيانات');
}

// ========================================
// طباعة تقرير عضو واحد
// ========================================

function populateMemberSelect() {
    const select = document.getElementById('printMemberSelect');
    if (!select) return;
    select.innerHTML = '<option value="">-- اختر عضو --</option>';
    ALL_MEMBERS.forEach(name => {
        select.innerHTML += `<option value="${name}">${name}</option>`;
    });
}

function printSingleMember(memberName = null) {
    const nameToPrint = memberName || currentMember;
    if (!nameToPrint) {
        alert('الرجاء اختيار عضو أولاً (من القائمة أو من البحث أو من داخل صفحة العضو)');
        return;
    }
    
    calculateStats(nameToPrint, currentMonth).then(async (stats) => {
        const notes = await getNotesList(nameToPrint, currentMonth);
        
        let notesHtml = '';
        if (notes.length > 0) {
            notesHtml = '<div style="margin-top:15px;"><strong>📝 الملاحظات:</strong><br>';
            notes.forEach(note => {
                notesHtml += `<div style="margin:8px 0; padding:8px; background:#fefce8; border-radius:8px;">${escapeHtml(note.text)}<br><small>${note.date} ${note.time}</small></div>`;
            });
            notesHtml += '</div>';
        }
        
        let allLateHtml = '';
        if (stats.allLateDetails && stats.allLateDetails.length > 0) {
            allLateHtml = '<div style="margin-top:15px;"><strong>⏰ تفاصيل التأخير:</strong><br>';
            stats.allLateDetails.forEach(late => {
                allLateHtml += `<div style="margin:5px 0;">🕒 ${late.time} - ${late.date} (${late.minutes} دقيقة)</div>`;
            });
            allLateHtml += '</div>';
        }
        
        const printWindow = window.open('', '_blank');
        printWindow.document.write('<html><head><title>تقرير ' + nameToPrint + '</title>');
        printWindow.document.write('<style>body{font-family:Arial;padding:20px;direction:rtl;} @media print{.no-print{display:none;}}</style>');
        printWindow.document.write('</head><body>');
        printWindow.document.write(`
            <div style="text-align:center;">
                <h1 style="color:#667eea;">أكولوثيا – نظام المتابعة</h1>
                <h2>تقرير ${nameToPrint}</h2>
                <p>شهر ${currentMonth + 1} - تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG')}</p>
                <hr>
            </div>
            <div style="margin-top:20px;">
                <div style="display:flex; justify-content:space-around; margin-bottom:20px;">
                    <div style="text-align:center;"><div style="font-size:36px; font-weight:bold; color:#10b981;">${stats.presentRate}%</div><div>الحضور</div></div>
                    <div style="text-align:center;"><div style="font-size:36px; font-weight:bold;">${stats.totalRecords}</div><div>إجمالي الاجتماعات</div></div>
                    <div style="text-align:center;"><div style="font-size:36px; font-weight:bold; color:#ef4444;">${stats.absentRate}%</div><div>الغياب</div></div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:20px;">
                    <div style="background:#f8fafc; padding:10px; border-radius:12px;">✅ الحضور: ${stats.presentCount}</div>
                    <div style="background:#f8fafc; padding:10px; border-radius:12px;">⏰ التأخير: ${stats.lateCount} (متوسط ${stats.avgLate} د)</div>
                    <div style="background:#f8fafc; padding:10px; border-radius:12px;">📝 غياب بعذر: ${stats.excusedCount}</div>
                    <div style="background:#f8fafc; padding:10px; border-radius:12px;">❌ غياب بدون عذر: ${stats.absentCount}</div>
                    <div style="background:#f8fafc; padding:10px; border-radius:12px;">✈️ مسافر: ${stats.travelCount}</div>
                </div>
                ${allLateHtml}
                ${notesHtml}
            </div>
        `);
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        printWindow.print();
    });
}

// ========================================
// عرض البطاقات (مع دعم البحث)
// ========================================

async function displayFilteredCards() {
    await loadDataFromSheet();
    let html = '';
    
    const membersToShow = searchActive ? filteredMembersList : ALL_MEMBERS;
    
    for (const name of membersToShow) {
        const stats = await calculateStats(name, currentMonth);
        const notes = await getNotesList(name, currentMonth);
        
        let notesHtml = '';
        if (notes.length > 0) {
            notesHtml = '<div style="margin-top:12px;"><strong>📝 الملاحظات:</strong><br>';
            notes.forEach(note => {
                notesHtml += `<div class="note-item" style="font-size:16px; margin-bottom:8px; padding:8px; background:#fefce8; border-radius:12px;">📌 ${escapeHtml(note.text)}<br><small style="font-size:12px; color:#666;">${note.date} ${note.time}</small></div>`;
            });
            notesHtml += '</div>';
        } else {
            notesHtml = '<div class="notes-preview" onclick="event.stopPropagation();showNoteDialog(\'' + name + '\')">➕ إضافة ملاحظة</div>';
        }
        
        let allLateHtml = '';
        if (stats.allLateDetails && stats.allLateDetails.length > 0) {
            allLateHtml = '<div style="margin-top:12px;"><strong>⏰ تفاصيل التأخير:</strong><br>';
            stats.allLateDetails.forEach(late => {
                allLateHtml += `<div style="font-size:14px; margin-bottom:6px; padding:6px; background:#e0f2fe; border-radius:10px;">🕒 الساعة ${late.time} - ${late.date} (${late.minutes} دقيقة)</div>`;
            });
            allLateHtml += '</div>';
        }
        
        html += `
            <div class="stat-card">
                <a href="javascript:editMemberFromAdmin('${name}')" class="card-link">
                    <div class="card-header">👤 ${name}</div>
                    <div class="card-body">
                        <div class="stats-row">
                            <div class="stat-box">
                                <div class="stat-number ${stats.presentRate >= 70 ? 'good' : stats.presentRate >= 40 ? 'warning' : 'bad'}">
                                    ${stats.presentRate}%
                                </div>
                                <div class="stat-label-sm">الحضور</div>
                            </div>
                            <div class="stat-box">
                                <div class="stat-number">${stats.totalRecords}</div>
                                <div class="stat-label-sm">اجتماعات</div>
                            </div>
                            <div class="stat-box">
                                <div class="stat-number ${stats.absentRate > 20 ? 'bad' : ''}">${stats.absentRate}%</div>
                                <div class="stat-label-sm">غياب</div>
                            </div>
                        </div>
                        <div class="details-grid">
                            <div class="detail-item">✅ الحضور: ${stats.presentCount}</div>
                            <div class="detail-item">⏰ تأخر: ${stats.lateCount} (متوسط ${stats.avgLate} د)</div>
                            <div class="detail-item">📝 غياب بعذر: ${stats.excusedCount}</div>
                            <div class="detail-item">❌ غياب بدون عذر: ${stats.absentCount}</div>
                            <div class="detail-item">✈️ مسافر: ${stats.travelCount}</div>
                            <div class="detail-item">📊 إجمالي: ${stats.totalRecords}</div>
                        </div>
                        ${allLateHtml}
                        ${notesHtml}
                    </div>
                </a>
            </div>
        `;
    }
    
    document.getElementById('cardsContainer').innerHTML = html;
    
    if (searchActive && membersToShow.length === 0) {
        document.getElementById('cardsContainer').innerHTML = '<div class="stat-card" style="text-align:center;padding:40px;">❌ لا توجد نتائج للبحث</div>';
    }
}

async function displayCards() {
    await displayFilteredCards();
}

function displayWeeklyLatecomers() {
    if (currentFilter !== 'weekly') {
        document.getElementById('weeklyLatecomers').innerHTML = '';
        return;
    }

    const latecomers = getLatecomers(currentMonth, 'weekly');

    if (latecomers.length === 0) {
        document.getElementById('weeklyLatecomers').innerHTML = '<div class="latecomers-box">✅ لا يوجد متأخرون هذا الأسبوع</div>';
        return;
    }

    let html = `
        <div class="latecomers-box">
            <h3>⏰ المتأخرون هذا الأسبوع</h3>
            <table style="width:100%; border-collapse:collapse;">
                <thead>
                    <tr style="background:#f59e0b; color:white;">
                        <th>الاسم</th>
                        <th>وقت الحضور</th>
                        <th>دقائق التأخير</th>
                        <th>التاريخ</th>
                    </tr>
                </thead>
                <tbody>
    `;

    latecomers.forEach(late => {
        html += `
            <tr>
                <td style="padding:8px;">${late.name}
                <td style="padding:8px;">${late.time}
                <td style="padding:8px;">${late.minutes} دقيقة
                <td style="padding:8px;">${late.date}
            </tr>
        `;
    });

    html += `</tbody><table></div>`;
    document.getElementById('weeklyLatecomers').innerHTML = html;
}

// ========================================
// حذف بيانات الشهر
// ========================================

async function deleteCurrentMonth() {
    if (!confirm(`⚠️ هل أنت متأكد من حذف جميع بيانات شهر ${currentMonth + 1}؟\nلا يمكن التراجع عن هذا الإجراء.`)) return;

    try {
        await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({ action: 'delete', month: currentMonth + 1 })
        });

        dataLoaded = false;
        attendanceCache = [];
        await loadDataFromSheet();
        await updateAdminView();
        alert(`✅ تم حذف شهر ${currentMonth + 1}`);
    } catch (error) {
        console.error(error);
        alert("حدث خطأ أثناء حذف البيانات");
    }
}

// ========================================
// عرض قوائم الأعضاء
// ========================================

function showMemberList() {
    document.getElementById('adminPanelBtn').style.display = 'none';
    document.getElementById('backToAdminBtn').style.display = 'none';
    isAdminLoggedIn = false;
    fromAdminEdit = false;

    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
    document.getElementById('memberScreen').classList.remove('hidden');

    const container = document.getElementById('memberList');
    container.innerHTML = '';

    ALL_MEMBERS.forEach(name => {
        const card = document.createElement('div');
        card.className = 'member-card';
        card.textContent = name;
        card.onclick = () => openMemberDashboard(name);
        container.appendChild(card);
    });
    
    updateGlobalWarningNotification();
}

function showMemberListForAdmin() {
    document.getElementById('adminPanelBtn').style.display = 'inline-block';
    isAdminLoggedIn = true;

    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
    document.getElementById('memberScreen').classList.remove('hidden');

    const container = document.getElementById('memberList');
    container.innerHTML = '';

    ALL_MEMBERS.forEach(name => {
        const card = document.createElement('div');
        card.className = 'member-card';
        card.textContent = name;
        card.onclick = () => {
            fromAdminEdit = true;
            openMemberDashboard(name);
        };
        container.appendChild(card);
    });
    
    updateGlobalWarningNotification();
}

// ========================================
// فتح لوحة العضو
// ========================================

function openMemberDashboard(name) {
    const isAdminUser = name === 'shenouda' || name === 'admin2' || name === 'admin3';
    currentMember = name;
    currentMonth = pinnedMonth !== null ? pinnedMonth : 0;

    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
    document.getElementById('memberDashboard').classList.remove('hidden');
    document.getElementById('memberName').textContent = name;

    document.getElementById('backToAdminBtn').style.display = (isAdminLoggedIn || fromAdminEdit || isAdminUser) ? 'inline-block' : 'none';

    renderTabs('memberMonthsTabs', true);

    const buttons = document.querySelectorAll('.status-btn');
    if (fromAdminEdit || isAdminLoggedIn || isAdminUser) {
        buttons.forEach(btn => btn.style.display = 'flex');
        fromAdminEdit = false;
    } else {
        buttons.forEach(btn => btn.style.display = 'none');
    }

    const existingMsg = document.getElementById('pinnedMsg');
    if (pinnedMonth !== null && !existingMsg) {
        const msgDiv = document.createElement('div');
        msgDiv.id = 'pinnedMsg';
        msgDiv.style.cssText = 'background:#e0f2fe; color:#0369a1; padding:10px; border-radius:16px; margin-bottom:15px; text-align:center';
        msgDiv.innerHTML = `📌 ملاحظة: التسجيل يتم حالياً في <strong>شهر ${pinnedMonth + 1}</strong> (شهر مثبت من الأدمن)`;
        document.getElementById('memberDashboard').insertBefore(msgDiv, document.getElementById('memberMonthsTabs'));
    } else if (pinnedMonth === null && existingMsg) {
        existingMsg.remove();
    }

    updateMemberView();
}

function backToAdminPanel() {
    showAdminDashboard();
}

// ========================================
// تحديث عرض العضو
// ========================================

async function updateMemberView() {
    await loadDataFromSheet();

    const records = getMemberRecords(currentMember, currentMonth);
    const lastRecord = records[records.length - 1];

    const statusDiv = document.getElementById('currentStatus');
    if (lastRecord) {
        let lateInfo = '';
        if (lastRecord[3] === 'late') {
            lateInfo = `<br><small>⏱️ تأخر ${lastRecord[5]} دقيقة - الساعة ${lastRecord[4]}</small>`;
        }
        statusDiv.innerHTML = `
            <strong>آخر تسجيل:</strong><br>
            ${getStatusIcon(lastRecord[3])} ${getStatusText(lastRecord[3])}${lateInfo}<br>
            <small>${lastRecord[2]} - ${lastRecord[4]}</small>
        `;
    } else {
        statusDiv.innerHTML = 'لا توجد تسجيلات لهذا الشهر';
    }

    const stats = await calculateStats(currentMember, currentMonth);
    const notes = await getNotesList(currentMember, currentMonth);
    const allLate = attendanceCache
        .filter(r => r[0] === currentMember && r[1] === currentMonth + 1 && r[3] === 'late')
        .map(r => ({ time: r[4], date: r[2], minutes: r[5] }));

    let lateHtml = '';
    if (allLate.length) {
        lateHtml = `<div class="late-details">⏰ تفاصيل التأخير:<br>${allLate.map(l => `${l.date} - الساعة ${l.time} (${l.minutes} دقيقة)`).join('<br>')}</div>`;
    }

    let notesHtml = '';
    if (notes.length) {
        notesHtml = notes.map(n => `
            <div class="note-item">
                <small>${n.date} ${n.time}</small>
                <p style="font-size:16px;">${escapeHtml(n.text)}</p>
            </div>
        `).join('');
        notesHtml += `<div class="notes-preview" onclick="showNoteDialog('${currentMember}')">➕ إضافة ملاحظة جديدة</div>`;
    } else {
        notesHtml = `<div class="notes-preview" onclick="showNoteDialog('${currentMember}')">📝 إضافة ملاحظة جديدة</div>`;
    }

    document.getElementById('personalStats').innerHTML = `
        <div class="stat-card">
            <div class="card-header">📊 ${currentMember}</div>
            <div class="card-body">
                <div class="stats-row">
                    <div class="stat-box">
                        <div class="stat-number ${stats.presentRate >= 70 ? 'good' : stats.presentRate >= 40 ? 'warning' : 'bad'}">
                            ${stats.presentRate}%
                        </div>
                        <div class="stat-label-sm">الحضور</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-number">${stats.totalRecords}</div>
                        <div class="stat-label-sm">اجتماعات</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-number ${stats.absentRate > 20 ? 'bad' : ''}">${stats.absentRate}%</div>
                        <div class="stat-label-sm">غياب</div>
                    </div>
                </div>
                <div class="details-grid">
                    <div class="detail-item">✅ الحضور: ${stats.presentCount}</div>
                    <div class="detail-item">⏰ تأخر: ${stats.lateCount} (متوسط ${stats.avgLate} د)</div>
                    <div class="detail-item">📝 غياب بعذر: ${stats.excusedCount}</div>
                    <div class="detail-item">❌ غياب بدون عذر: ${stats.absentCount}</div>
                    <div class="detail-item">✈️ مسافر: ${stats.travelCount}</div>
                    <div class="detail-item">📊 إجمالي: ${stats.totalRecords}</div>
                </div>
                ${lateHtml}
                <div style="margin-top:15px">
                    <strong>📝 الملاحظات:</strong><br>
                    ${notesHtml}
                </div>
            </div>
        </div>
    `;
}

// ========================================
// تبويبات الشهور
// ========================================

function renderTabs(containerId, isMember = true) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';

    for (let i = 0; i < MONTHS_COUNT; i++) {
        const button = document.createElement('button');
        button.className = `month-tab ${i === currentMonth ? 'active' : ''}`;
        button.textContent = `شهر ${i + 1}`;
        button.onclick = () => {
            if (pinnedMonth !== null && isMember) {
                alert(`⚠️ الشهر ${pinnedMonth + 1} مثبت حالياً. لا يمكن التغيير.`);
                return;
            }
            document.querySelectorAll(`#${containerId} .month-tab`).forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            currentMonth = i;
            if (isMember) updateMemberView();
            else updateAdminView();
        };
        container.appendChild(button);
    }
}

// ========================================
// إدارة الأدمن
// ========================================

function showAdminLogin() {
    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
    document.getElementById('adminLoginScreen').classList.remove('hidden');
}

function verifyAdmin() {
    const username = document.getElementById('adminUsername').value;
    const password = document.getElementById('adminPassword').value;

    const admin = ADMIN_ACCOUNTS.find(a => a.username === username && a.password === password);

    if (admin) {
        currentUsername = username;
        currentUserRole = 'admin';
        isAdminLoggedIn = true;
        populateMemberSelect();
        showAdminDashboard();
    } else {
        alert('اسم المستخدم أو كلمة السر خطأ');
    }
}

function showAdminDashboard() {
    currentMember = null;
    currentMonth = 0;
    searchActive = false;
    filteredMembersList = [...ALL_MEMBERS];
    document.getElementById('searchMemberInput').value = '';

    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
    document.getElementById('adminDashboard').classList.remove('hidden');

    renderTabs('adminMonthsTabs', false);
    document.getElementById('currentOfficialTime').innerText = getOfficialTime();

    updatePinnedDisplay();
    
    if (currentFilter === 'weekly') {
        displayWeeklyLatecomers();
    }
    updateAdminView();

    const isShenouda = document.getElementById('adminUsername').value === 'shenouda';
    const advancedSection = document.getElementById('shenoudaSection');
    if (advancedSection) {
        advancedSection.style.display = isShenouda ? 'block' : 'none';
        if (isShenouda) loadEditTable();
    }
}

function editMemberFromAdmin(memberName) {
    fromAdminEdit = true;
    openMemberDashboard(memberName);
}

async function updateAdminView() {
    await loadDataFromSheet();

    document.getElementById('reportDateRange').innerHTML = formatDateRange();

    const stats = [];
    for (const name of ALL_NAMES) {
        stats.push(await calculateStats(name, currentMonth));
    }

    const bestAttendance = stats.reduce((a, b) => a.presentRate > b.presentRate ? a : b);
    const worstAbsence = stats.reduce((a, b) => a.absentRate > b.absentRate ? a : b);
    const mostLate = stats.reduce((a, b) => a.lateCount > b.lateCount ? a : b);

    document.getElementById('adminStats').innerHTML = `
        <div style="background:linear-gradient(135deg, #1e293b, #334155); color:white; padding:20px; border-radius:24px; margin-bottom:20px;">
            <h3>📊 إحصائيات ${currentFilter === 'monthly' ? `شهر ${currentMonth + 1}` : 'آخر سبت'}</h3>
            <div style="display:flex; flex-wrap:wrap; gap:20px; justify-content:space-between; margin-top:10px;">
                <div>🏆 أعلى حضور: <strong>${ALL_NAMES[stats.indexOf(bestAttendance)]}</strong> (${bestAttendance.presentRate}%)</div>
                <div>⚠️ أعلى غياب بدون عذر: <strong>${ALL_NAMES[stats.indexOf(worstAbsence)]}</strong> (${worstAbsence.absentRate}%)</div>
                <div>⏰ أكثر عضو تأخيراً: <strong>${ALL_NAMES[stats.indexOf(mostLate)]}</strong> (${mostLate.lateCount} مرات)</div>
            </div>
        </div>
    `;

    await displayCards();
}

// ========================================
// تثبيت الشهر
// ========================================

function pinMonth() {
    const selected = document.getElementById('pinMonthSelect').value;
    if (selected === '') {
        alert('اختر شهراً أولاً');
        return;
    }

    pinnedMonth = parseInt(selected);
    localStorage.setItem('pinnedMonth', pinnedMonth);
    updatePinnedDisplay();
    alert(`✅ تم تثبيت شهر ${pinnedMonth + 1}`);
}

function unpinMonth() {
    pinnedMonth = null;
    localStorage.removeItem('pinnedMonth');
    updatePinnedDisplay();
    alert('✅ تم إلغاء تثبيت الشهر');
}

function updatePinnedDisplay() {
    const displayElement = document.getElementById('pinnedMonthDisplay');
    if (displayElement) {
        if (pinnedMonth !== null) {
            displayElement.innerHTML = `✅ شهر ${pinnedMonth + 1} (مثبت)`;
        } else {
            displayElement.innerHTML = '❌ لا يوجد شهر مثبت';
        }
    }

    const selectElement = document.getElementById('pinMonthSelect');
    if (selectElement && pinnedMonth !== null) {
        selectElement.value = pinnedMonth;
    }
}

// ========================================
// جدول تعديل التسجيلات (لـ shenouda فقط)
// ========================================

async function loadEditTable() {
    await loadDataFromSheet();

    const records = [...attendanceCache].reverse();
    if (records.length === 0) {
        document.getElementById('editTable').innerHTML = '<p style="color:#64748b; text-align:center;">لا توجد تسجيلات لعرضها</p>';
        return;
    }

    let html = `
        <table style="min-width:600px;">
            <thead>
                <tr>
                    <th>التاريخ</th>
                    <th>العضو</th>
                    <th>الحالة</th>
                    <th>وقت الحضور</th>
                    <th>التأخير</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
    `;

    for (let i = 0; i < records.length; i++) {
        const record = records[i];
        html += `
            <tr>
                <td><input type="date" id="editDate_${i}" value="${record[2]}" style="width:110px;"></td>
                <td style="font-weight:500;">${record[0]}
                <td>
                    <select id="editStatus_${i}">
                        <option ${record[3] === 'present' ? 'selected' : ''}>✅ حاضر</option>
                        <option ${record[3] === 'late' ? 'selected' : ''}>⏰ متأخر</option>
                        <option ${record[3] === 'absent' ? 'selected' : ''}>❌ غائب</option>
                        <option ${record[3] === 'excused' ? 'selected' : ''}>📝 غائب بعذر</option>
                        <option ${record[3] === 'travel' ? 'selected' : ''}>✈️ مسافر</option>
                    </select>
                
                <td><input type="time" id="editTime_${i}" value="${record[4]}" style="width:100px;">
                <td><input type="number" id="editLate_${i}" value="${record[5]}" style="width:70px;">
                <td>
                    <button onclick="updateRecord(${i})" class="btn-edit">💾 حفظ</button>
                    <button onclick="deleteRecord(${i})" class="btn-edit" style="background:#ef4444;">🗑️ حذف</button>
                
            </tr>
        `;
    }

    html += `</tbody></table>`;
    document.getElementById('editTable').innerHTML = html;
}

window.updateRecord = async function(index) {
    const records = [...attendanceCache].reverse();
    const oldRecord = records[index];

    const newDate = document.getElementById(`editDate_${index}`).value;
    const newStatus = document.getElementById(`editStatus_${index}`).value === '✅ حاضر' ? 'present' :
                      document.getElementById(`editStatus_${index}`).value === '⏰ متأخر' ? 'late' :
                      document.getElementById(`editStatus_${index}`).value === '❌ غائب' ? 'absent' :
                      document.getElementById(`editStatus_${index}`).value === '📝 غائب بعذر' ? 'excused' : 'travel';
    const newTime = document.getElementById(`editTime_${index}`).value;
    const newLate = parseInt(document.getElementById(`editLate_${index}`).value) || 0;

    const originalIndex = attendanceCache.findIndex(r =>
        r[0] === oldRecord[0] && r[2] === oldRecord[2] && r[4] === oldRecord[4]
    );

    if (originalIndex !== -1) {
        attendanceCache[originalIndex][2] = newDate;
        attendanceCache[originalIndex][3] = newStatus;
        attendanceCache[originalIndex][4] = newTime;
        attendanceCache[originalIndex][5] = newLate;

        await syncAllData();
        await loadDataFromSheet();
        await updateAdminView();
        loadEditTable();
        alert('✅ تم تحديث التسجيل بنجاح');
    }
};

window.deleteRecord = async function(index) {
    if (!confirm('هل أنت متأكد من حذف هذا التسجيل؟')) return;

    const records = [...attendanceCache].reverse();
    const oldRecord = records[index];

    const originalIndex = attendanceCache.findIndex(r =>
        r[0] === oldRecord[0] && r[2] === oldRecord[2] && r[4] === oldRecord[4]
    );

    if (originalIndex !== -1) {
        attendanceCache.splice(originalIndex, 1);
        await syncAllData();
        await loadDataFromSheet();
        await updateAdminView();
        loadEditTable();
        alert('✅ تم حذف التسجيل بنجاح');
    }
};

// ========================================
// إدارة الأزرار
// ========================================

document.addEventListener('click', (event) => {
    if (event.target.id === 'filterMonthly') {
        currentFilter = 'monthly';
        document.getElementById('filterMonthly').classList.add('active');
        document.getElementById('filterWeekly').classList.remove('active');
        updateAdminView();
        if (currentFilter !== 'weekly') {
            document.getElementById('weeklyLatecomers').innerHTML = '';
        } else {
            displayWeeklyLatecomers();
        }
    }
    if (event.target.id === 'filterWeekly') {
        currentFilter = 'weekly';
        document.getElementById('filterWeekly').classList.add('active');
        document.getElementById('filterMonthly').classList.remove('active');
        displayWeeklyLatecomers();
        updateAdminView();
    }
    if (event.target.id === 'changePasswordBtn') showChangePasswordDialog();
    if (event.target.id === 'downloadPDFBtn') downloadPDF();
    if (event.target.id === 'deleteMonthBtn') deleteCurrentMonth();
    if (event.target.id === 'exportExcelBtn') exportToCSV();
    if (event.target.id === 'searchMemberBtn') searchMembers();
    if (event.target.id === 'resetSearchBtn') resetSearch();
    if (event.target.id === 'printMemberFromSelectBtn') {
        const selected = document.getElementById('printMemberSelect').value;
        if (selected) printSingleMember(selected);
        else alert('الرجاء اختيار عضو من القائمة');
    }
});

// ========================================
// تغيير كلمة المرور
// ========================================

function showChangePasswordDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'dialog';
    dialog.innerHTML = `
        <div class="dialog-content">
            <h3>🔒 تغيير كلمة المرور</h3>
            <p style="font-size:14px; color:#64748b;">متاح فقط لـ <strong>shenouda</strong></p>
            <input type="password" id="currentPass" placeholder="كلمة المرور الحالية">
            <input type="password" id="newPass1" placeholder="كلمة المرور الجديدة">
            <input type="password" id="newPass2" placeholder="تأكيد كلمة المرور">
            <button onclick="changePassword()" class="btn-primary">تغيير</button>
            <button onclick="this.parentElement.parentElement.remove()" class="btn-secondary">إلغاء</button>
        </div>
    `;
    document.body.appendChild(dialog);
}

function changePassword() {
    const current = document.getElementById('currentPass').value;
    const newPass1 = document.getElementById('newPass1').value;
    const newPass2 = document.getElementById('newPass2').value;

    const adminAccount = ADMIN_ACCOUNTS.find(a => a.username === 'shenouda');
    if (!adminAccount || adminAccount.password !== current) {
        alert('⚠️ كلمة المرور الحالية غير صحيحة');
        return;
    }
    if (newPass1 !== newPass2) {
        alert('⚠️ كلمة المرور الجديدة غير متطابقة');
        return;
    }

    adminAccount.password = newPass1;
    localStorage.setItem('customAdmins', JSON.stringify(ADMIN_ACCOUNTS));
    alert('✅ تم تغيير كلمة المرور بنجاح');
    document.querySelector('.dialog').remove();
}

// ========================================
// PDF
// ========================================

function downloadPDF() {
    const element = document.getElementById('pdf-content');
    if (element && typeof html2pdf !== 'undefined') {
        const originalHTML = element.innerHTML;
        const period = currentFilter === 'weekly' ? 'تقرير أسبوعي' : `تقرير شهري - شهر ${currentMonth + 1}`;

        element.innerHTML = `
            <div style="text-align:center; margin-bottom:20px;">
                <h1 style="color:#667eea;">أكولوثيا – نظام المتابعة</h1>
                <h2>${period}</h2>
                <p>تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG')}</p>
                <hr>
            </div>
            ${originalHTML}
        `;

        html2pdf().set({
            margin: 10,
            filename: `تقرير_${currentFilter === 'monthly' ? `شهر_${currentMonth + 1}` : 'اسبوعي'}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
        }).from(element).save().then(() => {
            element.innerHTML = originalHTML;
        });
    } else {
        alert('جاري تحميل مكتبة PDF، حاول مرة أخرى');
    }
}

// ========================================
// دوال التنقل العامة
// ========================================

function backToLogin() {
    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
    document.getElementById('loginScreen').classList.remove('hidden');
    currentUsername = null;
    currentUserRole = null;
    isAdminLoggedIn = false;
}

function backToMemberList() {
    if (isAdminLoggedIn) showMemberListForAdmin();
    else showMemberList();
}

// ========================================
// تهيئة وتحميل البيانات
// ========================================

if (localStorage.getItem('pinnedMonth')) pinnedMonth = parseInt(localStorage.getItem('pinnedMonth'));
loadDataFromSheet();
