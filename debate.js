// ==========================================
// ساحة المناظرة - الواجهة
// يجب تحميله بعد script.js (يستخدم escapeHtml و showToast منه)
// ==========================================

// رابط Apps Script بعد النشر (Deploy ← Web app)
const DEBATE_API = "https://script.google.com/macros/s/AKfycbyRIWPMWUTvfZnk35XUwNIHU_c1KyJ82rdsYtQ9DmyG-rdA4kQWTqbcFPhiDVNJy1LT/exec";

let debateState = null;
let debateFilter = 'all';
let debateSide = null;          // 'A' أو 'B'
let debateReplyTo = null;       // رقم الحجة التي يُكتب ردّ عليها
let debateReplyDraft = '';
let debateBusy = false;
let debateLastLoad = 0;
const debateVotedLocal = new Set();

const DEBATE_ERRORS = {
    limit: 'وصلت للحد الأقصى من المشاركات في هذا الموضوع.',
    short: 'اكتب نصاً أوضح قليلاً.',
    name: 'اكتب اسمك الأول (حرفان على الأقل).',
    side: 'اختر موقفك أولاً.',
    no_topic: 'لا يوجد موضوع مناظرة حالياً.',
    parent: 'تعذر الرد على هذه الحجة.',
    own: 'لا يمكنك التصويت لحجتك.',
    notfound: 'هذه الحجة غير متاحة.'
};

function $d(id) { return document.getElementById(id); }

function debateVid() {
    try {
        let id = localStorage.getItem('safir_vid');
        if (!id) {
            id = (window.crypto && crypto.randomUUID)
                ? crypto.randomUUID()
                : 'v' + Date.now() + Math.random().toString(36).slice(2, 10);
            localStorage.setItem('safir_vid', id);
        }
        return id;
    } catch {
        return 'v' + Math.random().toString(36).slice(2, 12);
    }
}

function debateToast(msg) {
    if (typeof showToast === 'function') showToast(msg);
    else alert(msg);
}

function debateConfigured() {
    return DEBATE_API && !DEBATE_API.includes('ضع_رابط');
}

function debateNotice(msg) {
    return `<div class="bg-[#1E293B]/60 border border-gray-800 p-4 rounded-xl text-center text-gray-400 text-xs">${escapeHtml(msg)}</div>`;
}

// ---------- الاتصال بالخادم ----------

async function debateGet() {
    const res = await fetch(`${DEBATE_API}?action=state&vid=${encodeURIComponent(debateVid())}`);
    return res.json();
}

async function debatePost(payload) {
    // بدون ترويسة مخصصة لتجنب طلب preflight مع Apps Script
    const res = await fetch(DEBATE_API, {
        method: 'POST',
        body: JSON.stringify({ ...payload, vid: debateVid() })
    });
    return res.json();
}

// ---------- التحميل ----------

async function loadDebate(force) {
    const topicEl = $d('debate-topic');
    if (!topicEl) return;

    if (!debateConfigured()) {
        topicEl.innerHTML = debateNotice('لم يتم ضبط رابط ساحة المناظرة بعد.');
        return;
    }

    if (!force && debateState && Date.now() - debateLastLoad < 20000) return;

    if (!debateState) {
        topicEl.innerHTML = `<div class="bg-[#1E293B]/50 border border-gray-800 p-4 rounded-xl text-center text-gray-400 text-xs animate-pulse">جاري تحميل موضوع الأسبوع...</div>`;
    }

    try {
        const data = await debateGet();
        if (!data || !data.ok) throw new Error((data && data.error) || 'error');
        debateState = data;
        debateLastLoad = Date.now();
        debateRender();
    } catch (e) {
        console.error('Debate load error:', e);
        if (!debateState) topicEl.innerHTML = debateNotice('تعذر تحميل المناظرة، تأكد من الاتصال وحاول مرة أخرى.');
        else debateToast('تعذر تحديث المناظرة.');
    }
}

// ---------- العرض ----------

function debateSetFilter(k) {
    debateFilter = k;
    debateRender();
}

function debateRender() {
    const topicEl = $d('debate-topic');
    const chipsEl = $d('debate-chips');
    const listEl = $d('debate-list');
    const composeEl = $d('debate-compose');
    if (!topicEl || !listEl) return;

    // حفظ مسودة الرد قبل إعادة الرسم
    const liveReply = $d('debate-reply-text');
    if (liveReply) debateReplyDraft = liveReply.value;

    const s = debateState;
    if (!s || !s.topic) {
        topicEl.innerHTML = debateNotice('لا يوجد موضوع مناظرة حالياً. ترقّبوا موضوع الأسبوع القادم!');
        if (chipsEl) chipsEl.innerHTML = '';
        listEl.innerHTML = '';
        if (composeEl) composeEl.classList.add('hidden');
        return;
    }

    const t = s.topic;
    const voted = new Set([...(s.voted || []), ...debateVotedLocal]);
    const main = s.items.filter(i => !i.parentId);
    const replies = s.items.filter(i => i.parentId);

    const sideItems = (k) => main.filter(i => i.side === k);
    const votesOf = (k) => sideItems(k).reduce((a, i) => a + i.votes, 0);
    const vA = votesOf('A');
    const vB = votesOf('B');
    const total = vA + vB;
    const pA = total ? Math.round((vA / total) * 100) : 50;

    // بطاقة الموضوع + ميزان الحجج
    topicEl.innerHTML = `
        <div class="bg-gradient-to-r from-sky-600 to-indigo-700 p-4 rounded-2xl text-white shadow-lg space-y-2">
            <span class="bg-white/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold">موضوع الأسبوع</span>
            <h3 class="text-base font-bold leading-snug">${escapeHtml(t.title)}</h3>
            <p class="text-sky-100 text-xs leading-relaxed whitespace-pre-line">${escapeHtml(t.description)}</p>
        </div>
        <div class="bg-[#1E293B] p-3 rounded-2xl border border-gray-800 space-y-2 mt-3">
            <div class="flex justify-between text-[11px] font-bold">
                <span class="text-sky-400">${escapeHtml(t.sideA)} · ${vA} صوت</span>
                <span class="text-amber-400">${escapeHtml(t.sideB)} · ${vB} صوت</span>
            </div>
            <div class="flex h-2 rounded-full overflow-hidden bg-gray-800">
                <div class="bg-sky-400 transition-all" style="width:${pA}%"></div>
                <div class="bg-amber-400 transition-all" style="width:${100 - pA}%"></div>
            </div>
            <p class="text-[10px] text-gray-500 text-center">${sideItems('A').length + sideItems('B').length} حجة · ${replies.length} رد</p>
        </div>
    `;

    // نموذج المشاركة
    if (composeEl) {
        composeEl.classList.remove('hidden');
        const bA = $d('debate-side-A');
        const bB = $d('debate-side-B');
        if (bA) bA.textContent = t.sideA;
        if (bB) bB.textContent = t.sideB;
        debateUpdateSideButtons();
    }

    // أزرار التصفية
    if (chipsEl) {
        chipsEl.innerHTML = [['all', 'الكل'], ['A', t.sideA], ['B', t.sideB]].map(([k, label]) => {
            const on = debateFilter === k;
            const cls = on
                ? 'bg-sky-500 text-white border-sky-500'
                : 'bg-[#1E293B] text-gray-300 border-gray-700';
            return `<button onclick="debateSetFilter('${k}')" class="px-3 py-1.5 rounded-full text-[11px] font-bold border whitespace-nowrap transition ${cls}">${escapeHtml(label)}</button>`;
        }).join('');
    }

    // أقوى حجة لكل طرف
    const best = { A: null, B: null };
    ['A', 'B'].forEach(k => {
        const arr = sideItems(k).filter(i => i.votes > 0).sort((a, b) => b.votes - a.votes || a.at - b.at);
        if (arr.length) best[k] = arr[0].id;
    });

    let list = main.slice();
    if (debateFilter !== 'all') list = list.filter(i => i.side === debateFilter);
    list.sort((a, b) => b.votes - a.votes || b.at - a.at);

    if (list.length === 0) {
        listEl.innerHTML = debateNotice('لا توجد حجج بعد. كن أول من يشارك برأيه!');
    } else {
        listEl.innerHTML = list.map(i => debateCard(i, t, replies, voted, best)).join('');
        const rt = $d('debate-reply-text');
        if (rt) rt.value = debateReplyDraft;
    }

    // تفويض الأحداث (آمن، بدون إدخال معرّفات داخل onclick)
    listEl.onclick = (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const id = btn.dataset.id;
        const act = btn.dataset.act;
        if (act === 'vote') debateVote(id);
        else if (act === 'reply') debateToggleReply(id);
        else if (act === 'send-reply') debateSendReply(id);
    };
}

function debateVoteBtn(item, hasVoted) {
    const cls = hasVoted
        ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
        : 'bg-[#0F141C] text-gray-300 border-gray-700 hover:border-sky-400';
    const label = hasVoted ? '✓ أقنعتني' : '👍 أقنعتني';
    return `<button data-act="vote" data-id="${escapeHtml(item.id)}" ${hasVoted ? 'disabled' : ''} class="px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${cls}">${label} · ${item.votes}</button>`;
}

function debateCard(i, t, replies, voted, best) {
    const isA = i.side === 'A';
    const badge = isA
        ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
        : 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    const sideLabel = isA ? t.sideA : t.sideB;
    const crown = best[i.side] === i.id
        ? `<span class="text-[10px] text-amber-300 font-bold">🏆 أقوى حجة</span>` : '';

    const myReplies = replies
        .filter(r => r.parentId === i.id)
        .sort((a, b) => a.at - b.at)
        .map(r => `
            <div class="bg-[#0F141C] border border-gray-800 rounded-lg p-2 space-y-1">
                <div class="flex justify-between items-center gap-2">
                    <span class="text-[10px] text-gray-300 font-bold">↩ ${escapeHtml(r.name)}</span>
                    ${debateVoteBtn(r, voted.has(r.id))}
                </div>
                <p class="text-[11px] text-gray-300 leading-relaxed whitespace-pre-line">${escapeHtml(r.text)}</p>
            </div>`).join('');

    const replyForm = debateReplyTo === i.id ? `
        <div class="space-y-2">
            <textarea id="debate-reply-text" rows="2" maxlength="400" oninput="debateReplyDraft=this.value" placeholder="اكتب ردك على هذه الحجة..." class="w-full bg-[#0F141C] border border-gray-800 text-white text-[11px] rounded-lg p-2 focus:outline-none focus:border-sky-400 resize-none"></textarea>
            <div class="flex gap-2 justify-end">
                <button data-act="reply" data-id="${escapeHtml(i.id)}" class="bg-gray-700 text-gray-300 px-3 py-1 rounded-lg text-[11px]">إلغاء</button>
                <button data-act="send-reply" data-id="${escapeHtml(i.id)}" class="bg-sky-500 text-white px-3 py-1 rounded-lg text-[11px] font-bold">إرسال الرد</button>
            </div>
        </div>` : '';

    return `
        <div class="bg-[#1E293B] p-3.5 rounded-2xl border border-gray-800 space-y-2.5 shadow">
            <div class="flex justify-between items-center gap-2">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge}">${escapeHtml(sideLabel)}</span>
                    <span class="text-xs font-bold text-white">${escapeHtml(i.name)}</span>
                </div>
                ${crown}
            </div>
            <p class="text-xs text-gray-200 leading-relaxed whitespace-pre-line">${escapeHtml(i.text)}</p>
            <div class="flex items-center gap-2">
                ${debateVoteBtn(i, voted.has(i.id))}
                <button data-act="reply" data-id="${escapeHtml(i.id)}" class="px-2.5 py-1 rounded-lg text-[11px] font-bold border border-gray-700 text-gray-300 hover:border-sky-400 transition">↩ ردّ</button>
            </div>
            ${myReplies ? `<div class="space-y-2 pr-3 border-r-2 border-gray-700">${myReplies}</div>` : ''}
            ${replyForm}
        </div>`;
}

// ---------- نموذج المشاركة ----------

function debatePickSide(k) {
    debateSide = k;
    debateUpdateSideButtons();
}

function debateUpdateSideButtons() {
    ['A', 'B'].forEach(k => {
        const b = $d('debate-side-' + k);
        if (!b) return;
        const on = debateSide === k;
        const palette = k === 'A'
            ? (on ? 'bg-sky-500 text-white border-sky-500' : 'bg-[#0F141C] text-sky-400 border-sky-500/30')
            : (on ? 'bg-amber-500 text-white border-amber-500' : 'bg-[#0F141C] text-amber-400 border-amber-500/30');
        b.className = 'flex-1 py-2.5 rounded-xl text-xs font-bold border transition ' + palette;
    });
}

function debateCount() {
    const el = $d('debate-text');
    const c = $d('debate-count');
    if (el && c) c.textContent = `${el.value.length}/400`;
}

function debateMsg(text, type) {
    const el = $d('debate-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'text-[11px] ' + (type === 'ok' ? 'text-emerald-400' : 'text-red-400');
}

function debateName() {
    const el = $d('debate-name');
    const name = el ? el.value.trim() : '';
    if (name.length >= 2) {
        try { localStorage.setItem('safir_debate_name', name); } catch (e) {}
    }
    return name;
}

async function debateSubmit() {
    if (debateBusy || !debateState || !debateState.topic) return;

    const name = debateName();
    const text = ($d('debate-text').value || '').trim();

    if (!debateSide) return debateMsg('اختر موقفك أولاً.', 'err');
    if (name.length < 2) return debateMsg(DEBATE_ERRORS.name, 'err');
    if (text.length < 15) return debateMsg('اكتب حجة أوضح قليلاً (15 حرفاً على الأقل).', 'err');

    debateBusy = true;
    const btn = $d('debate-submit');
    if (btn) btn.disabled = true;
    debateMsg('جاري الإرسال...', 'ok');

    try {
        const r = await debatePost({ action: 'submit', side: debateSide, name, text });
        if (!r.ok) {
            debateMsg(DEBATE_ERRORS[r.error] || 'تعذر إرسال حجتك، حاول مرة أخرى.', 'err');
        } else {
            $d('debate-text').value = '';
            debateCount();
            if (r.approved) {
                debateMsg('تم نشر حجتك!', 'ok');
                loadDebate(true);
            } else {
                debateMsg('تم إرسال حجتك ✅ وستظهر بعد موافقة المعلم.', 'ok');
            }
        }
    } catch (e) {
        console.error('Debate submit error:', e);
        debateMsg('تعذر الاتصال، تأكد من الإنترنت وحاول مرة أخرى.', 'err');
    } finally {
        debateBusy = false;
        if (btn) btn.disabled = false;
    }
}

// ---------- الردود والتصويت ----------

function debateToggleReply(id) {
    if (debateReplyTo === id) {
        debateReplyTo = null;
    } else {
        debateReplyTo = id;
    }
    debateReplyDraft = '';
    debateRender();
    const rt = $d('debate-reply-text');
    if (rt) rt.focus();
}

async function debateSendReply(parentId) {
    if (debateBusy) return;

    const name = debateName();
    const rt = $d('debate-reply-text');
    const text = rt ? rt.value.trim() : '';

    if (name.length < 2) {
        debateToast('اكتب اسمك أولاً في نموذج المشاركة بالأعلى.');
        const n = $d('debate-name');
        if (n) { n.scrollIntoView({ behavior: 'smooth', block: 'center' }); n.focus(); }
        return;
    }
    if (text.length < 8) return debateToast('اكتب رداً أوضح قليلاً.');

    debateBusy = true;
    try {
        const r = await debatePost({ action: 'submit', parentId, name, text });
        if (!r.ok) {
            debateToast(DEBATE_ERRORS[r.error] || 'تعذر إرسال الرد.');
        } else {
            debateReplyTo = null;
            debateReplyDraft = '';
            if (r.approved) {
                debateToast('تم نشر ردك!');
                await loadDebate(true);
            } else {
                debateToast('تم إرسال ردك ✅ وسيظهر بعد موافقة المعلم.');
                debateRender();
            }
        }
    } catch (e) {
        console.error('Debate reply error:', e);
        debateToast('تعذر الاتصال، حاول مرة أخرى.');
    } finally {
        debateBusy = false;
    }
}

async function debateVote(id) {
    if (!debateState) return;
    const item = debateState.items.find(i => i.id === id);
    if (!item) return;
    if (debateVotedLocal.has(id) || (debateState.voted || []).includes(id)) return;

    // تحديث فوري ثم تأكيد من الخادم
    debateVotedLocal.add(id);
    item.votes += 1;
    debateRender();

    try {
        const r = await debatePost({ action: 'vote', argId: id });
        if (!r.ok) {
            debateVotedLocal.delete(id);
            item.votes -= 1;
            debateRender();
            debateToast(DEBATE_ERRORS[r.error] || 'تعذر تسجيل صوتك.');
        } else if (typeof r.votes === 'number') {
            item.votes = r.votes;
            debateRender();
        }
    } catch (e) {
        console.error('Debate vote error:', e);
        debateVotedLocal.delete(id);
        item.votes -= 1;
        debateRender();
        debateToast('تعذر الاتصال، لم يُسجّل صوتك.');
    }
}

// ---------- ربط التبويب بالتنقل (بدون تعديل switchTab الأصلية) ----------

(function () {
    const original = window.switchTab;
    window.switchTab = function (tabName) {
        if (typeof original === 'function') original(tabName);

        const nav = $d('nav-debate');
        if (nav) {
            nav.classList.toggle('text-sky-400', tabName === 'debate');
            nav.classList.toggle('text-gray-400', tabName !== 'debate');
        }
        if (tabName === 'debate') {
            const h = $d('header-title');
            if (h) h.innerText = 'ساحة المناظرة';
            loadDebate(false);
        }
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    try {
        const saved = localStorage.getItem('safir_debate_name');
        const n = $d('debate-name');
        if (saved && n) n.value = saved;
    } catch (e) {}
});
