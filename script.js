// ==========================================
// منصة سفير القراءة - الملف الرئيسي (نسخة مصححة)
// ==========================================

// رابط وسيط Cloudflare Worker (المفتاح محفوظ هناك ولا يظهر في الكود)
const API_URL = "https://safir-proxy.drazhasan7.workers.dev";

// معرف Google Sheet (الموجود في الرابط بين /d/ و /edit)
const SPREADSHEET_ID = '1UnYvDX6b-O17jcsps_96MVsQ3kgwg7jKshhr69UwUKo';

// ==========================================
// أدوات مساعدة
// ==========================================

// حماية من XSS: تحويل النص إلى نص آمن قبل إدراجه في innerHTML
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// السماح فقط بروابط http/https (يمنع روابط javascript:)
function safeUrl(url) {
    try {
        const u = new URL(String(url));
        return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : '#';
    } catch {
        return '#';
    }
}

function getBooks() {
    try {
        const books = JSON.parse(localStorage.getItem('safir_user_books'));
        return Array.isArray(books) ? books : [];
    } catch {
        return [];
    }
}

function setBooks(books) {
    try {
        localStorage.setItem('safir_user_books', JSON.stringify(books));
    } catch (e) {
        console.error("Storage Error:", e);
        alert("تعذر حفظ البيانات (قد تكون مساحة التخزين ممتلئة).");
    }
}

function getNotes() {
    try {
        const notes = JSON.parse(localStorage.getItem('student_notes'));
        return Array.isArray(notes) ? notes : [];
    } catch {
        return [];
    }
}

function setNotes(notes) {
    try {
        localStorage.setItem('student_notes', JSON.stringify(notes));
    } catch (e) {
        console.error("Storage Error:", e);
        alert("تعذر حفظ الملاحظات (قد تكون مساحة التخزين ممتلئة).");
    }
}

// ==========================================
// التنقل بين التبويبات
// ==========================================

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    const tab = document.getElementById('tab-' + tabName);
    if (tab) {
        tab.classList.remove('hidden'); // تبويب الملاحظات كان يحمل hidden فلا يظهر أبداً
        tab.classList.add('active');
    }

    const titles = {
        'home': 'منصة سفير القراءة',
        'notes': 'مفكرة السفير',
        'assistant': 'المساعد الذكي',
        'library': 'مكتبة الكتب',
        'analysis': 'مختبر التحليل الأدبي',
        'audio': 'المختبر الصوتي'
    };
    const header = document.getElementById('header-title');
    if (header && titles[tabName]) header.innerText = titles[tabName];

    ['home', 'notes', 'assistant', 'library', 'analysis', 'audio'].forEach(t => {
        const btn = document.getElementById('nav-' + t);
        if (!btn) return;
        if (t === tabName) {
            btn.classList.add('text-sky-400');
            btn.classList.remove('text-gray-400');
        } else {
            btn.classList.remove('text-sky-400');
            btn.classList.add('text-gray-400');
        }
    });
}

// ==========================================
// الاتصال بالذكاء الاصطناعي (Groq)
// ==========================================

async function askAI(messages) {
    if (!API_URL || API_URL.includes("ضع_رابط")) {
        throw new Error("لم يتم ضبط رابط الوسيط بعد (API_URL).");
    }

    const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages })
    });

    let data = null;
    try {
        data = await res.json();
    } catch {
        // الرد ليس JSON
    }

    if (!res.ok || (data && data.error)) {
        const serverMsg = data?.error?.message || `HTTP ${res.status}`;
        if (res.status === 401) throw new Error("الخدمة غير متاحة حالياً، حاول مجددا.");
        if (res.status === 429) throw new Error("تم تجاوز حد الطلبات، انتظر قليلاً ثم حاول مرة أخرى.");
        throw new Error(serverMsg);
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("لم يصل رد من المساعد، حاول مرة أخرى.");
    return content;
}

// ==========================================
// المساعد الذكي (محادثة بذاكرة)
// ==========================================

const SYSTEM_PROMPT = `أنت مساعد ذكي ومدرب أدبي متخصص في 'تحدي القراءة العربي'. مهمتك مساعدة الطلاب في تلخيص الكتب، وتصحيح الأخطاء اللغوية بأسلوب تربوي، وطرح أسئلة تحليلية عميقة، ومحاكاة لجان التحكيم.

أسلوب الإجابة:
- أجب بالعربية الفصحى وبأسلوب مشجّع ومحفّز.
- كن موجزاً ومباشراً، وقدّم الفائدة فوراً بدون مقدمات طويلة.
- لا تستخدم رموز الماركداون (مثل ** أو # أو \`)، لأن الواجهة تعرض النص كما هو.
- نسّق الإجابة بشكل مناسب: فقرات قصيرة يفصل بينها سطر فارغ، وللقوائم استخدم الترقيم (1. 2. 3.) أو الشرطة (-) فقط عند الحاجة.
- اجعل طول الإجابة متناسباً مع السؤال: قصيرة للأسئلة البسيطة، ومفصّلة قليلاً للتلخيص أو التحليل.
- عند تصحيح الأخطاء اللغوية، اذكر الخطأ ثم الصواب مع سبب مختصر.`;

const CHAT_KEY = 'safir_chat_history';

function loadChatHistory() {
    try {
        const h = JSON.parse(localStorage.getItem(CHAT_KEY));
        return Array.isArray(h) ? h : [];
    } catch { return []; }
}

function saveChatHistory() {
    try { localStorage.setItem(CHAT_KEY, JSON.stringify(chatHistory.slice(-60))); } catch (e) {}
}

function renderChatHistory() {
    chatHistory.forEach(m => appendMessage(m.content, m.role === 'user' ? 'user' : 'bot'));
}

function clearChat() {
    if (!confirm("هل تريد مسح سجل المحادثة بالكامل؟")) return;
    chatHistory = [];
    localStorage.removeItem(CHAT_KEY);
    const box = document.getElementById('chat-box');
    while (box && box.children.length > 1) box.removeChild(box.lastChild); // يبقي رسالة الترحيب
}

let chatHistory = loadChatHistory();   // سجل المحادثة لإعطاء المساعد سياقاً
let isSending = false;    // منع الإرسال المزدوج

async function sendMessage() {
    if (isSending) return;

    const input = document.getElementById('chat-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    isSending = true;
    appendMessage(text, 'user');
    input.value = '';
    showTypingIndicator();

    try {
        const messages = [
            { role: "system", content: SYSTEM_PROMPT },
            ...chatHistory.slice(-20),
            { role: "user", content: text }
        ];

        const reply = await askAI(messages);

        chatHistory.push({ role: "user", content: text });
        chatHistory.push({ role: "assistant", content: reply });
        saveChatHistory();

        removeTypingIndicator();
        appendMessage(reply, 'bot');
    } catch (error) {
        removeTypingIndicator();
        console.error("API Error:", error);
        appendMessage("⚠️ " + (error.message || "تعذر الاتصال بالخدمة، تأكد من اتصالك بالإنترنت."), 'bot');
    } finally {
        isSending = false;
    }
}

function sendQuickMessage(msg) {
    const input = document.getElementById('chat-input');
    if (!input) return;
    input.value = msg;
    sendMessage();
}

function appendMessage(text, sender) {
    const chatBox = document.getElementById('chat-box');
    if (!chatBox) return;

    const msgDiv = document.createElement('div');

    if (sender === 'user') {
        msgDiv.className = "bg-sky-600 text-white p-3 rounded-2xl rounded-tl-none max-w-[85%] self-end text-xs leading-relaxed shadow whitespace-pre-line";
        msgDiv.textContent = text; // textContent آمن
    } else {
        msgDiv.className = "bg-[#0F141C] border border-gray-800 p-3 rounded-2xl rounded-tr-none max-w-[85%] self-start text-xs text-gray-200 leading-relaxed shadow whitespace-pre-line";
        msgDiv.innerHTML = formatAiOutput(text); // formatAiOutput تنظّف النص أولاً ثم تنسّقه
    }

    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function showTypingIndicator() {
    const chatBox = document.getElementById('chat-box');
    if (!chatBox) return;
    const typingDiv = document.createElement('div');
    typingDiv.id = 'typing-indicator';
    typingDiv.className = "bg-[#0F141C] border border-gray-800 p-3 rounded-2xl rounded-tr-none max-w-[40%] self-start text-xs text-sky-400 flex items-center gap-2 shadow animate-pulse";
    typingDiv.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> المساعد يقرأ ويفكر...`;
    chatBox.appendChild(typingDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function removeTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.remove();
}

// ==========================================
// 1. جلب كتب المنصة من Google Sheet (تظهر للجميع)
// ==========================================

async function fetchSheetBooks() {
    const container = document.getElementById('sheet-books-container');
    if (!container) return;

    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json`;

    try {
        const response = await fetch(url);
        const text = await response.text();

        const match = text.match(/setResponse\(([\s\S]*)\);?\s*$/);
        if (!match) throw new Error("صيغة الاستجابة غير متوقعة");
        const data = JSON.parse(match[1]);

        const rows = data?.table?.rows;
        if (!rows || rows.length === 0) {
            container.innerHTML = `<div class="bg-[#1E293B] p-4 rounded-xl text-center text-gray-400 text-xs">لا توجد كتب مضافة في الشيت حالياً.</div>`;
            updateHomeStats(0);
            return;
        }

        container.innerHTML = '';
        let count = 0;

        rows.forEach(row => {
            const cell = (i) => (row.c && row.c[i] && row.c[i].v != null) ? row.c[i].v : null;

            const title = String(cell(0) ?? 'بدون عنوان');
            const author = String(cell(1) ?? 'غير معروف');
            const linkUrl = safeUrl(cell(2) ?? '#');
            const badgeType = String(cell(3) ?? 'رابط خارجي');

            if (title.toLowerCase() === 'title' || title === 'عنوان الكتاب') return;

            const card = document.createElement('div');
            card.className = "bg-[#1E293B] p-4 rounded-xl border border-gray-800 flex justify-between items-center shadow hover:border-gray-700 transition";
            card.innerHTML = `
                <div>
                    <div class="flex items-center gap-2">
                        <h4 class="font-bold text-sm text-white">${escapeHtml(title)}</h4>
                        <span class="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded text-[10px]">${escapeHtml(badgeType)}</span>
                    </div>
                    <p class="text-gray-400 text-xs mt-1"><i class="fa-solid fa-user-pen text-[10px] ml-1"></i> ${escapeHtml(author)}</p>
                </div>
                <a href="${escapeHtml(linkUrl)}" target="_blank" rel="noopener noreferrer" class="bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1">
                    <i class="fa-solid fa-arrow-up-right-from-square"></i> فتح الكتاب
                </a>
            `;
            container.appendChild(card);
            count++;
        });

        // تحديث عداد كتب المنصة في الصفحة الرئيسية
        updateHomeStats(count);

        if (count === 0) {
            container.innerHTML = `<div class="bg-[#1E293B] p-4 rounded-xl text-center text-gray-400 text-xs">لا توجد كتب مضافة في الشيت حالياً.</div>`;
        }

    } catch (error) {
        console.error("Sheet Fetch Error:", error);
        container.innerHTML = `
            <div class="bg-[#1E293B] p-4 rounded-xl border border-red-900/40 text-center text-gray-400 text-xs space-y-1">
                <p class="text-red-400 font-bold">تعذر جلب البيانات من Google Sheet.</p>
                <p class="text-[11px]">تأكد من مشاركة الشيت للعامة.</p>
            </div>
        `;
    }
}

// ==========================================
// 2. تخزين ملفات PDF في IndexedDB (تبقى بعد تحديث الصفحة)
// ==========================================

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('safir_db', 1);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains('pdfs')) {
                req.result.createObjectStore('pdfs');
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function savePdf(id, file) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('pdfs', 'readwrite');
        tx.objectStore('pdfs').put(file, id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function getPdf(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const req = db.transaction('pdfs', 'readonly').objectStore('pdfs').get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

async function deletePdf(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('pdfs', 'readwrite');
        tx.objectStore('pdfs').delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// ==========================================
// 3. إدارة كتب المستخدم الخاصة (رفع PDF وإضافة الاقتباسات)
// ==========================================

let activeObjectUrls = [];

function toggleUploadModal() {
    const modal = document.getElementById('upload-modal');
    if (modal) modal.classList.toggle('hidden');
}

async function saveUserBook() {
    const title = document.getElementById('up-title').value.trim();
    const author = document.getElementById('up-author').value.trim();
    const fileInput = document.getElementById('up-file');

    if (!title || !author) {
        alert("الرجاء إدخال عنوان الكتاب واسم المؤلف.");
        return;
    }

    const id = Date.now();
    let hasPdf = false;

    if (fileInput.files && fileInput.files[0]) {
        try {
            await savePdf(id, fileInput.files[0]);
            hasPdf = true;
        } catch (e) {
            console.error("PDF Save Error:", e);
            alert("تعذر حفظ ملف الـ PDF، سيتم حفظ الكتاب بدونه.");
        }
    }

    const books = getBooks();
    books.unshift({ id, title, author, hasPdf, quotes: [] });
    setBooks(books);

    document.getElementById('up-title').value = '';
    document.getElementById('up-author').value = '';
    fileInput.value = '';
    toggleUploadModal();

    loadUserBooks();
}

async function loadUserBooks() {
    const container = document.getElementById('user-books-container');
    if (!container) return;

    // تحرير روابط الملفات القديمة
    activeObjectUrls.forEach(u => URL.revokeObjectURL(u));
    activeObjectUrls = [];

    const books = getBooks();

    if (books.length === 0) {
        container.innerHTML = `
            <div class="bg-[#1E293B]/50 border border-dashed border-gray-800 p-4 rounded-xl text-center text-gray-500 text-xs">
                لم تقم برفع أي كتاب خاص حتى الآن. اضغط على "رفع كتاب خاص" لأرشفة كتبك.
            </div>
        `;
        updateHomeStats(); // تحديث العداد إلى صفر بعد حذف آخر كتاب
        return;
    }

    container.innerHTML = '';

    for (const book of books) {
        let pdfButton = `<div class="flex-1 text-center bg-gray-800 text-gray-500 py-1.5 rounded-lg text-xs">لا يوجد ملف PDF مرفق</div>`;

        if (book.hasPdf) {
            try {
                const file = await getPdf(book.id);
                if (file) {
                    const url = URL.createObjectURL(file);
                    activeObjectUrls.push(url);
                    pdfButton = `
                        <a href="${url}" target="_blank" rel="noopener" class="flex-1 text-center bg-sky-500 text-white py-1.5 rounded-lg text-xs font-bold hover:bg-sky-600 transition shadow">
                            <i class="fa-solid fa-file-pdf ml-1"></i> قراءة ملف الـ PDF المرفوع
                        </a>`;
                }
            } catch (e) {
                console.error("PDF Load Error:", e);
            }
        }

        const quotesHtml = (book.quotes || []).map(q =>
            `<li class="text-[11px] text-gray-300 bg-[#0F141C] p-2 rounded-lg border border-gray-800/80 mb-1 list-none">“${escapeHtml(q)}”</li>`
        ).join('');

        const card = document.createElement('div');
        card.className = "bg-[#1E293B] p-4 rounded-xl border border-gray-800 space-y-3 shadow";
        card.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <h4 class="font-bold text-sm text-white">${escapeHtml(book.title)}</h4>
                    <p class="text-gray-400 text-xs mt-0.5">المؤلف: ${escapeHtml(book.author)}</p>
                </div>
                <button onclick="deleteBook(${Number(book.id)})" class="text-red-400 hover:text-red-300 text-xs px-2 py-1"><i class="fa-solid fa-trash-can"></i></button>
            </div>

            <div class="flex gap-2">
                ${pdfButton}
            </div>

            <div class="pt-2 border-t border-gray-800 space-y-2">
                <div class="flex justify-between items-center">
                    <span class="text-[11px] font-bold text-sky-400"><i class="fa-solid fa-quote-right ml-1"></i> بنك الاقتباسات والأفكار</span>
                </div>
                <div class="max-h-24 overflow-y-auto space-y-1">
                    ${quotesHtml || '<p class="text-[10px] text-gray-500">لا توجد اقتباسات محفوظة لهذا الكتاب بعد.</p>'}
                </div>
                <div class="flex gap-1 pt-1">
                    <input id="quote-input-${Number(book.id)}" type="text" placeholder="اكتب اقتباساً أعجبك من الكتاب..." onkeydown="if(event.key==='Enter'){addQuoteToBook(${Number(book.id)})}" class="flex-1 bg-[#0F141C] border border-gray-800 text-white text-[11px] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-sky-400">
                    <button onclick="addQuoteToBook(${Number(book.id)})" class="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold">إضافة</button>
                </div>
            </div>
        `;
        container.appendChild(card);
    }

    // تحديث عدد الكتب الشخصية تلقائياً
    updateHomeStats();
}


function addQuoteToBook(bookId) {
    const input = document.getElementById(`quote-input-${bookId}`);
    if (!input) return;
    const quoteText = input.value.trim();
    if (!quoteText) return;

    const books = getBooks().map(b => {
        if (b.id === bookId) {
            b.quotes = b.quotes || [];
            b.quotes.push(quoteText);
        }
        return b;
    });

    setBooks(books);
    loadUserBooks();
}

async function deleteBook(bookId) {
    if (!confirm("هل أنت متأكد من حذف هذا الكتاب من سجلك؟")) return;
    setBooks(getBooks().filter(b => b.id !== bookId));
    try {
        await deletePdf(bookId);
    } catch (e) {
        console.error("PDF Delete Error:", e);
    }
    loadUserBooks();
}

// ==========================================
// 4. مختبر التحليل الأدبي والتقييم عبر الذكاء الاصطناعي
// ==========================================

let isAnalyzing = false;
const AN_IDS = [1, 2, 4, 5, 7];

function anParse(t) {
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b < 0) return null;
    try { const d = JSON.parse(t.slice(a, b + 1)); return Array.isArray(d.criteria) ? d : null; } catch { return null; }
}
const anNorm = s => String(s || '').replace(/[\u064B-\u0652\u0640]/g, '').replace(/\s+/g, ' ').trim();

async function evaluateAnalysis() {
    if (isAnalyzing) return;
    const bookTitle = document.getElementById('analysis-book-title').value.trim();
    const text = document.getElementById('analysis-text').value.trim();
    const resultCard = document.getElementById('analysis-result-card');
    const outputDiv = document.getElementById('analysis-output');

    // ---- فحوص قبل الإرسال لمنع النتائج العشوائية ----
    if (!bookTitle || !text) { showToast('اكتب عنوان الكتاب وملخصك أولاً'); return; }
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < 40) { showToast('ملخصك قصير (' + words.length + ' كلمة). اكتب 40 كلمة على الأقل'); return; }
    if (text.length > 3000) { showToast('الملخص طويل جداً. اختصره إلى 3000 حرف'); return; }
    const letters = (text.match(/[A-Za-z\u0600-\u06FF]/g) || []).length;
    const arabic = (text.match(/[\u0600-\u06FF]/g) || []).length;
    if (letters === 0 || arabic / letters < 0.6) { showToast('اكتب ملخصك باللغة العربية'); return; }
    if (new Set(words).size / words.length < 0.35) { showToast('النص يحتوي تكراراً كثيراً. اكتب ملخصاً حقيقياً'); return; }

    isAnalyzing = true;
    resultCard.classList.remove('hidden');
    outputDiv.classList.remove('whitespace-pre-line');
    outputDiv.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin text-sky-400"></i> لجنة التحكيم تقرأ ملخصك سطراً بسطر...`;
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    const list = AN_IDS.map(id => `{"id":${id},"name":"${IV_RUBRIC[id - 1].t}","max":${IV_RUBRIC[id - 1].m}}`).join(',');
    const prompt = `أنت عضو لجنة تحكيم صارم وعادل في مسابقة تحدي القراءة العربي، وتقيّم ملخصاً كتبه طالب.
الكتاب: ${bookTitle}
ملخص الطالب (${words.length} كلمة):
"""
${text}
"""

القواعد:
1. قيّم فقط ما كُتب فعلاً. كل ملاحظة تشير إلى عبارة من الملخص. ممنوع الكلام العام الذي يصلح لأي ملخص.
2. لا تدّعِ معرفة تفاصيل الكتاب ولا تصحح معلومات عنه. قيّم الوضوح والتحديد ووجود الأمثلة والأحداث والأسماء.
3. لا تبالغ بالدرجات: الملخص العام بلا تفاصيل محددة لا يتجاوز 50% من درجة المعيار.
4. "language_errors": اذكر فقط أخطاء لغوية أو إملائية موجودة حرفياً في النص، وانسخ الكلمة أو العبارة الخاطئة كما هي. إن لم يوجد خطأ فاترك المصفوفة فارغة ولا تخترع أخطاء. 4 أخطاء كحد أقصى.
5. "improved_summary": أعد كتابة ملخصه نفسه بأفكاره هو بلغة أفصح وترتيب أوضح، دون إضافة أحداث أو شخصيات من عندك. ضع [أضف مثالاً من الكتاب] حيث ينقصه تفصيل.
6. "checklist": هل يحتوي الملخص فعلاً على: الفكرة العامة، الأفكار الرئيسية، الأثر الشخصي، الدرس المستفاد (true/false).

أخرج JSON صالحاً فقط بلا أي نص أو علامات خارجه:
{"checklist":{"main_idea":true,"key_ideas":true,"personal_impact":true,"lesson":true},
"criteria":[ لكل معيار من: ${list} ضع {"id":رقم,"score":رقم لا يتجاوز max,"note":"جملة واحدة تشير إلى عبارة من الملخص"} ],
"strengths":["نقطة قوة مع اقتباس قصير"],
"language_errors":[{"wrong":"النص الخاطئ حرفياً","right":"الصواب","why":"سبب قصير"}],
"improvements":[{"quote":"عبارة حرفية من الملخص","problem":"المشكلة","fix":"الحل"}],
"improved_summary":"..."}
improvements من 2 إلى 3 فقط، وstrengths من 1 إلى 2.`;

    const msgs = [
        { role: 'system', content: 'أنت محكّم مسابقة تحدي القراءة العربي. تُخرج JSON صالحاً فقط، بالعربية الفصحى المبسطة، وكل ملاحظة مرتبطة بنص الطالب.' },
        { role: 'user', content: prompt }
    ];
    try {
        let reply = await askAI(msgs);
        let d = anParse(reply);
        if (!d) { // محاولة ثانية واحدة إذا جاء الرد بصيغة خاطئة
            reply = await askAI([...msgs, { role: 'assistant', content: reply }, { role: 'user', content: 'الرد غير صالح. أعد إخراج JSON صالحاً فقط بالشكل المطلوب.' }]);
            d = anParse(reply);
        }
        if (!d) throw new Error('لم أتمكن من تنظيم التقييم هذه المرة. اضغط تقييم مرة أخرى.');
        d = anClean(d, text);
        outputDiv.innerHTML = anRender(d);
        saveAnalysisEntry(bookTitle, text, JSON.stringify(d));
    } catch (error) {
        console.error('AI Analysis Error:', error);
        outputDiv.textContent = '⚠️ ' + (error.message || 'تعذر الاتصال بخدمة التحليل الذكي.');
    } finally {
        isAnalyzing = false;
    }
}

// تنظيف الرد: حصر الدرجات، وحذف أي «اقتباس» أو «خطأ لغوي» غير موجود فعلاً في نص الطالب
function anClean(d, text) {
    const t = anNorm(text);
    const inText = s => { const n = anNorm(s); return n.length > 1 && t.includes(n); };
    d.criteria = AN_IDS.map(id => {
        const c = d.criteria.find(z => +z.id === id) || {};
        const m = IV_RUBRIC[id - 1].m;
        return { id, score: Math.max(0, Math.min(m, Math.round(+c.score || 0))), note: String(c.note || '') };
    });
    d.language_errors = (d.language_errors || []).filter(e => e && inText(e.wrong) && anNorm(e.wrong) !== anNorm(e.right)).slice(0, 4);
    d.improvements = (d.improvements || []).filter(i => i && inText(i.quote)).slice(0, 3);
    d.strengths = (d.strengths || []).slice(0, 2);
    d.checklist = d.checklist || {};
    return d;
}

function anRender(d) {
    const E = escapeHtml;
    let total = 0, max = 0;
    const rows = d.criteria.map(c => {
        const m = IV_RUBRIC[c.id - 1].m; total += c.score; max += m;
        const p = c.score / m, col = p >= .75 ? 'bg-emerald-400' : p >= .5 ? 'bg-amber-400' : 'bg-red-400';
        return `<div class="space-y-1"><div class="flex justify-between text-[11px]"><span class="font-bold text-gray-200">${E(IV_RUBRIC[c.id - 1].t)}</span><span class="font-mono text-gray-300">${c.score}/${m}</span></div>
            <div class="h-1.5 bg-gray-800 rounded-full overflow-hidden"><div class="h-full ${col}" style="width:${p * 100}%"></div></div>
            <p class="text-[11px] text-gray-400">${E(c.note)}</p></div>`;
    }).join('');
    const pct = Math.round(total / max * 100);
    const lvl = pct >= 85 ? ['ممتاز', 'text-emerald-400'] : pct >= 70 ? ['جيد جداً', 'text-sky-400'] : pct >= 50 ? ['جيد', 'text-amber-400'] : ['يحتاج تطويراً', 'text-red-400'];
    const ck = [['main_idea', 'الفكرة العامة'], ['key_ideas', 'الأفكار الرئيسية'], ['personal_impact', 'الأثر الشخصي'], ['lesson', 'الدرس المستفاد']]
        .map(([k, n]) => `<span class="text-[10px] font-bold px-2 py-1 rounded-full ${d.checklist[k] === true ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}">${d.checklist[k] === true ? '✓' : '✗'} ${n}</span>`).join('');
    const li = a => a.map(s => `<li class="text-[11px] text-gray-300">${E(s)}</li>`).join('');
    const errs = d.language_errors.length ? `<div class="space-y-1.5"><h4 class="text-xs font-bold text-red-400">التدقيق اللغوي</h4>${d.language_errors.map(e => `
        <div class="bg-[#1E293B] rounded-lg p-2 text-[11px] border border-gray-800"><span class="text-red-300 line-through">${E(e.wrong)}</span> <i class="fa-solid fa-arrow-left text-gray-500 mx-1"></i> <span class="text-emerald-300 font-bold">${E(e.right)}</span><span class="block text-gray-400 mt-0.5">${E(e.why || '')}</span></div>`).join('')}</div>`
        : `<p class="text-[11px] text-emerald-400"><i class="fa-solid fa-circle-check"></i> لم أجد أخطاء لغوية واضحة في ملخصك.</p>`;
    const imp = d.improvements.length ? `<div class="space-y-2"><h4 class="text-xs font-bold text-amber-400">ما يحتاج تحسيناً</h4>${d.improvements.map(i => `
        <div class="bg-[#1E293B] rounded-lg p-2.5 space-y-1 border border-gray-800">
            <p class="text-[11px] text-amber-300">«${E(i.quote)}»</p>
            <p class="text-[11px] text-gray-300"><span class="font-bold text-red-400">المشكلة:</span> ${E(i.problem || '')}</p>
            <p class="text-[11px] text-gray-300"><span class="font-bold text-emerald-400">الحل:</span> ${E(i.fix || '')}</p></div>`).join('')}</div>` : '';
    const sum = d.improved_summary ? `<div class="bg-[#1E293B] rounded-lg p-2.5 space-y-1 border border-sky-500/20"><h4 class="text-xs font-bold text-sky-400">صياغة محسّنة لملخصك</h4><p class="text-[11px] text-gray-200 leading-relaxed">${E(d.improved_summary)}</p></div>` : '';
    return `<div class="space-y-3 text-right">
        <div class="flex items-center justify-between"><div><span class="text-2xl font-bold text-white">${total}</span><span class="text-xs text-gray-400">/${max} (${pct}%)</span></div><span class="text-xs font-bold ${lvl[1]}">${lvl[0]}</span></div>
        <div class="flex flex-wrap gap-1.5">${ck}</div>
        <div class="space-y-2.5">${rows}</div>
        ${d.strengths.length ? `<div><h4 class="text-xs font-bold text-emerald-400 mb-1">نقاط القوة</h4><ul class="list-disc pr-4 space-y-0.5">${li(d.strengths)}</ul></div>` : ''}
        ${errs}${imp}${sum}</div>`;
}

// عرض السجل: التقارير الجديدة منسّقة، والقديمة (نص) تبقى كما كانت
function anHistoryHtml(result) {
    try {
        const d = JSON.parse(result);
        if (d && Array.isArray(d.criteria)) return anRender(d);
    } catch { }
    return `<div class="whitespace-pre-line">${formatAiOutput(result)}</div>`;
}

// ==========================================
// التشغيل عند تحميل الصفحة
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        chatInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    setRandomQuote();
    fetchSheetBooks();
    loadUserBooks();
    updateHomeStats();
    renderChatHistory();       // إظهار المحادثة المحفوظة
    renderAnalysisHistory();   // إظهار سجل التحليلات المحفوظ
});

// ==========================================
// 5. الإحصائيات والاقتباسات للصفحة الرئيسية
// ==========================================

const QUOTES = [
    { text: "وَخَيرُ جَليسٍ في الزَمانِ كِتابُ", author: "المتنبي" },
    { text: "على قَدْرِ أهلِ العزمِ تأتي العزائمُ", author: "المتنبي" },
    { text: "إذا غامرتَ في شرفٍ مرومٍ فلا تقنعْ بما دونَ النجومِ", author: "المتنبي" },
    { text: "وإذا كانتِ النفوسُ كباراً تعبتْ في مرادِها الأجسامُ", author: "المتنبي" },
    { text: "وتعظُمُ في عينِ الصغيرِ صغارُها وتصغرُ في عينِ العظيمِ العظائمُ", author: "المتنبي" },
    { text: "وكم من عائبٍ قولاً صحيحاً وآفتُهُ من الفهمِ السقيمِ", author: "المتنبي" },
    { text: "وما انتفاعُ أخي الدنيا بناظرِهِ إذا استوتْ عندَهُ الأنوارُ والظُّلَمُ", author: "المتنبي" },
    { text: "الكتابُ هو الجليسُ الذي لا يُطريكَ، والصديقُ الذي لا يُملِّقُكَ", author: "الجاحظ" },
    { text: "الكتابُ نِعمَ الذُّخرُ والعُقدة، ونِعمَ الجليسُ والعُدّة", author: "الجاحظ" },
    { text: "أهوى القراءةَ لأن عندي حياةً واحدةً لا تكفيني", author: "عباس محمود العقاد" },
    { text: "التعليمُ كالماءِ والهواء", author: "طه حسين" },
    { text: "قُمْ للمعلِّمِ وَفِّهِ التبجيلا كادَ المعلِّمُ أن يكونَ رسولا", author: "أحمد شوقي" },
    { text: "وما نيلُ المطالبِ بالتمنّي ولكنْ تُؤخذُ الدنيا غِلابا", author: "أحمد شوقي" },
    { text: "بالعلمِ والمالِ يبني الناسُ ملكَهُمُ، لم يُبنَ مُلكٌ على جهلٍ وإقلالِ", author: "أحمد شوقي" },
    { text: "إنما الأممُ الأخلاقُ ما بقيَتْ، فإنْ همُ ذهبتْ أخلاقُهمْ ذهبوا", author: "أحمد شوقي" },
    { text: "وللأوطانِ في دمِ كلِّ حرٍّ يدٌ سلفتْ ودَيْنٌ مستحقُّ", author: "أحمد شوقي" },
    { text: "الأمُّ مدرسةٌ إذا أعددتَها أعددتَ شعباً طيِّبَ الأعراقِ", author: "حافظ إبراهيم" },
    { text: "أنا البحرُ في أحشائِهِ الدُّرُّ كامنٌ فهل سألوا الغوّاصَ عن صَدَفاتي", author: "حافظ إبراهيم" },
    { text: "وسعتُ كتابَ اللهِ لفظاً وغايةً وما ضقتُ عن آيٍ بهِ وعِظاتِ", author: "حافظ إبراهيم" },
    { text: "إذا الشعبُ يوماً أرادَ الحياةَ فلا بدَّ أن يستجيبَ القدرُ", author: "أبو القاسم الشابي" },
    { text: "ولا بدَّ لليلِ أن ينجلي، ولا بدَّ للقيدِ أن ينكسرْ", author: "أبو القاسم الشابي" },
    { text: "ومَن يتهيَّبْ صعودَ الجبالِ يعِشْ أبدَ الدهرِ بينَ الحُفَرِ", author: "أبو القاسم الشابي" },
    { text: "كُنْ جميلاً ترَ الوجودَ جميلاً", author: "إيليا أبو ماضي" },
    { text: "قلتُ ابتسمْ، يكفي التجهُّمُ في السما", author: "إيليا أبو ماضي" },
    { text: "والذي نفسُهُ بغيرِ جمالٍ لا يرى في الوجودِ شيئاً جميلا", author: "إيليا أبو ماضي" },
    { text: "اطلبِ العلمَ ولا تكسلْ فما أبعدَ الخيرَ على أهلِ الكسلِ", author: "ابن الوردي" },
    { text: "لا تقلْ أصلي وفصلي أبداً، إنما أصلُ الفتى ما قد حصلْ", author: "ابن الوردي" },
    { text: "مَن لم يذقْ مُرَّ التعلُّمِ ساعةً تجرَّعَ ذُلَّ الجهلِ طولَ حياتِهِ", author: "الإمام الشافعي" },
    { text: "كلّما ازددتُ علماً زادني علماً بجهلي", author: "الإمام الشافعي" },
    { text: "العلمُ نورٌ، ونورُ اللهِ لا يُهدى لعاصي", author: "الإمام الشافعي" },
    { text: "قيمةُ كلِّ امرئٍ ما يُحسِنُه", author: "الإمام علي بن أبي طالب" },
    { text: "الناسُ أعداءُ ما جهلوا", author: "الإمام علي بن أبي طالب" },
    { text: "لا غِنى كالعقلِ ولا فقرَ كالجهلِ", author: "الإمام علي بن أبي طالب" },
    { text: "العلمُ يحرسُكَ وأنتَ تحرسُ المالَ", author: "الإمام علي بن أبي طالب" },
    { text: "على هذه الأرضِ ما يستحقُّ الحياة", author: "محمود درويش" },
    { text: "نحنُ نحبُّ الحياةَ إذا ما استطعنا إليها سبيلا", author: "محمود درويش" },
    { text: "الحياةُ ظلامٌ إلا حيثُ تكونُ الرغبة، وكلُّ رغبةٍ عمياءُ إلا حيثُ تكونُ المعرفة", author: "جبران خليل جبران" },
    { text: "المعلِّمُ الحقُّ لا يأمرُكم أن تدخلوا بيتَ حكمتِهِ، بل يقودُكم إلى عتبةِ عقولِكم", author: "جبران خليل جبران" },
    { text: "اقْرَأْ بِاسْمِ رَبِّكَ الَّذِي خَلَقَ", author: "القرآن الكريم" },
    { text: "وَقُل رَّبِّ زِدْنِي عِلْمًا", author: "القرآن الكريم" },
    { text: "مَن سلكَ طريقاً يلتمسُ فيه علماً سهَّلَ اللهُ له به طريقاً إلى الجنة", author: "حديث شريف" },
    { text: "القراءةُ تصنعُ إنساناً مكتملاً", author: "فرانسيس بيكون" },
    { text: "بعضُ الكتبِ تُتذوَّق، وبعضُها يُبتلَع، وقليلٌ منها يُمضَغُ ويُهضَم", author: "فرانسيس بيكون" },
    { text: "قراءةُ الكتبِ الجيدةِ أشبهُ بمحادثةٍ مع أفضلِ عقولِ القرونِ الماضية", author: "ديكارت" },
    { text: "لطالما تخيّلتُ أن الجنةَ ستكونُ نوعاً من المكتبة", author: "خورخي لويس بورخيس" },
    { text: "الكتابُ يجبُ أن يكونَ الفأسَ التي تحطِّمُ البحرَ المتجمِّدَ فينا", author: "فرانز كافكا" },
    { text: "ما إن تتعلّمَ القراءةَ حتى تصبحَ حرّاً إلى الأبد", author: "فريدريك دوغلاس" },
    { text: "الكتابُ دليلٌ على أن البشرَ قادرون على صنعِ السحر", author: "كارل ساغان" },
    { text: "كلما قرأتَ أكثرَ عرفتَ أكثر، وكلما تعلّمتَ أكثرَ ذهبتَ إلى أماكنَ أكثر", author: "دكتور سوس" },
    { text: "التعليمُ أقوى سلاحٍ يمكنُك استخدامُه لتغييرِ العالم", author: "نيلسون مانديلا" },
    { text: "طفلٌ واحد، ومعلِّمٌ واحد، وكتابٌ واحد، وقلمٌ واحد يمكنُها أن تغيِّرَ العالم", author: "ملالا يوسفزاي" },
    { text: "القراءةُ للعقلِ كالرياضةِ للجسد", author: "جوزيف أديسون" },
    { text: "جذورُ التعلُّمِ مُرّة، لكنَّ ثمارَه حلوة", author: "أرسطو" },
    { text: "كلُّ ما أعرفُه أنني لا أعرفُ شيئاً", author: "سقراط" },
    { text: "ليس يكفي أن نعرف، بل يجبُ أن نطبِّق", author: "غوته" },
    { text: "حين ترغبُ بشدّةٍ في شيء، يتآمرُ الكونُ كلُّه ليساعدَك", author: "باولو كويلو" },
    { text: "إن لم يكن لديك وقتٌ للقراءة، فلا وقتَ لديك للكتابة", author: "ستيفن كينغ" },
    { text: "لا أستطيعُ أن أعيشَ بلا كتب", author: "توماس جيفرسون" },
    { text: "الأدبُ هو مدينتي الفاضلة", author: "هيلين كيلر" },
    { text: "إن كان هناك كتابٌ تريدُ قراءتَه ولم يُكتبْ بعد، فعليكَ أن تكتبَه", author: "توني موريسون" }
];

function updateHomeStats(sheetCount) {
    const userBooks = getBooks();

    const userCountEl = document.getElementById('stat-user-count');
    if (userCountEl) userCountEl.textContent = userBooks.length;

    if (typeof sheetCount === 'number') {
        const sheetCountEl = document.getElementById('stat-sheet-count');
        if (sheetCountEl) sheetCountEl.textContent = sheetCount;
    }
}

function setRandomQuote() {
    const quoteEl = document.getElementById('daily-quote');
    const authorEl = document.getElementById('daily-author');
    if (!quoteEl || !authorEl) return;

    const randomIndex = Math.floor(Math.random() * QUOTES.length);
    const item = QUOTES[randomIndex];

    quoteEl.textContent = `"${item.text}"`;
    authorEl.textContent = `— ${item.author}`;
}

// ==========================================
// 6. التصفية والتنبيهات السريعة
// ==========================================

// دالة التصفية في الكتب
function filterBooks() {
    const query = document.getElementById('search-books-input')?.value.toLowerCase().trim() || '';

    // تصفية كتب الشيت والكتب الشخصية
    const allCards = document.querySelectorAll('#sheet-books-container > div, #user-books-container > div');
    allCards.forEach(card => {
        const text = card.innerText.toLowerCase();
        card.style.display = text.includes(query) ? '' : 'none';
    });
}

// دالة إشعار سريع (Toast Notification)
let toastTimeout = null;
function showToast(message) {
    let toast = document.getElementById('toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        toast.className = "fixed bottom-16 left-1/2 -translate-x-1/2 bg-sky-500 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-lg transition-all duration-300 opacity-0 pointer-events-none z-50";
        document.body.appendChild(toast);
    }

    toast.innerText = message;
    toast.classList.remove('opacity-0', 'pointer-events-none');

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.add('opacity-0', 'pointer-events-none');
    }, 2500);
}


// ==========================================
// المختبر الصوتي والإلقاء
// ==========================================

// 1. القارئ الآلي للنصوص (Text-to-Speech) مع معاينة الأمواج الصوتية الحية
function playTextAudio() {
    const text = document.getElementById('tts-text').value.trim();
    const waveEl = document.getElementById('tts-wave');
    const statusEl = document.getElementById('tts-status');

    if (!text) {
        alert("الرجاء كتابة أو لصق النص المراد قراءته أولاً.");
        return;
    }

    if (!('speechSynthesis' in window)) {
        alert("متصفحك لا يدعم خاصية القراءة الصوتية.");
        return;
    }

    const rateInput = document.getElementById('speech-rate');
    const rate = rateInput ? parseFloat(rateInput.value) || 1.0 : 1.0; // السرعة من الشريط

    speakArabic(text, {
        rate,
        onStart: () => {
            if (waveEl) waveEl.classList.remove('hidden');
            if (statusEl) statusEl.textContent = "جاري الإلقاء الصوتي...";
            showToast("جاري البدء بالإلقاء الصوتي...");
        },
        onEnd: () => {
            if (waveEl) waveEl.classList.add('hidden');
            if (statusEl) statusEl.textContent = "انتهى الإلقاء";
        },
        onError: (e) => {
            console.error("TTS Error:", e);
            if (waveEl) waveEl.classList.add('hidden');
            if (statusEl) statusEl.textContent = "حدث خطأ في القراءة";
            showToast("حدث خطأ أثناء محاولة تشغيل الصوت.");
        }
    });
}

// ------------------------------------------
// محرك القراءة الصوتية العربية (اختيار صوت عربي + تقسيم النص الطويل)
// ------------------------------------------
let arabicVoice = null;
let speechToken = 0; // لإلغاء أي سلسلة قراءة قديمة

function pickArabicVoice() {
    if (!('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    arabicVoice = voices.find(v => (v.lang || '').toLowerCase().replace('_', '-').startsWith('ar')) || null;
    return arabicVoice;
}

if ('speechSynthesis' in window) {
    pickArabicVoice();
    window.speechSynthesis.onvoiceschanged = pickArabicVoice; // الأصوات تُحمَّل متأخرة في كروم
}

// تقسيم النص إلى مقاطع قصيرة (كروم يقطع القراءة الطويلة)
function splitForSpeech(text, maxLen = 160) {
    const sentences = text.match(/[^.!؟?\n،,؛;]+[.!؟?\n،,؛;]*/g) || [text];
    const chunks = [];
    let current = '';
    sentences.forEach(s => {
        if ((current + s).length <= maxLen) {
            current += s;
        } else {
            if (current.trim()) chunks.push(current.trim());
            current = s;
            while (current.length > maxLen) {
                const cut = current.lastIndexOf(' ', maxLen);
                const at = cut > 0 ? cut : maxLen;
                chunks.push(current.slice(0, at).trim());
                current = current.slice(at);
            }
        }
    });
    if (current.trim()) chunks.push(current.trim());
    return chunks;
}

function speakArabic(text, { rate = 1.0, onStart, onEnd, onError } = {}) {
    const synth = window.speechSynthesis;
    const token = ++speechToken;
    synth.cancel();

    if (!pickArabicVoice() && synth.getVoices().length > 0) {
        showToast("⚠️ لا يوجد صوت عربي مثبّت على جهازك، قد لا يُسمع الصوت. ثبّت حزمة صوت عربي من إعدادات النظام.");
    }

    const chunks = splitForSpeech(text);
    let index = 0;
    let started = false;

    const speakNext = () => {
        if (token !== speechToken) return; // أُلغيت أو بدأت قراءة جديدة
        if (index >= chunks.length) {
            if (onEnd) onEnd();
            return;
        }
        const u = new SpeechSynthesisUtterance(chunks[index++]);
        u.lang = 'ar-SA';
        if (arabicVoice) u.voice = arabicVoice;
        u.rate = rate;
        u.pitch = 1.0;
        u.onstart = () => {
            if (!started) {
                started = true;
                if (onStart) onStart();
            }
        };
        u.onend = speakNext;
        u.onerror = (e) => {
            if (token !== speechToken) return;
            if (e.error === 'canceled' || e.error === 'interrupted') return;
            speechToken++;
            if (onError) onError(e);
        };
        currentUtterance = u; // الاحتفاظ بمرجع يمنع حذفه تلقائياً في بعض المتصفحات
        synth.speak(u);
    };

    // تأخير بسيط بعد cancel() لأن كروم قد يتجاهل speak() الفوري
    setTimeout(speakNext, 120);
}

// 2. تسجيل صوت الطالب (MediaRecorder API)
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let recordingInterval = null;
let secondsElapsed = 0;
let lastAudioUrl = null;

async function toggleRecording() {
    const btnText = document.getElementById('record-text');
    const recordIcon = document.getElementById('record-icon');
    const playbackContainer = document.getElementById('audio-playback-container');
    const visualizerContainer = document.getElementById('visualizer-container');
    const timerEl = document.getElementById('recording-timer');

    if (!isRecording) {
        try {
            if (!navigator.mediaDevices || !window.MediaRecorder) {
                alert("متصفحك لا يدعم التسجيل الصوتي.");
                return;
            }

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // اختيار صيغة تسجيل يدعمها المتصفح (webm في كروم، mp4 في سفاري)
            const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
            const supportedType = preferredTypes.find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
            mediaRecorder = supportedType ? new MediaRecorder(stream, { mimeType: supportedType }) : new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) audioChunks.push(event.data);
            };

            mediaRecorder.onstop = () => {
                // استخدام النوع الحقيقي الذي سجّل به المتصفح (webm أو mp4 ...)
                const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });

                if (lastAudioUrl) URL.revokeObjectURL(lastAudioUrl);
                const audioUrl = URL.createObjectURL(audioBlob);
                lastAudioUrl = audioUrl;

                playbackContainer.classList.remove('hidden');
                playbackContainer.innerHTML = `
                    <div class="space-y-2 bg-[#0F141C] p-3 rounded-xl border border-gray-800">
                        <div class="flex items-center justify-between">
                            <p class="text-xs text-gray-300 font-bold flex items-center gap-1.5">
                                <i class="fa-solid fa-headphones text-sky-400"></i> استماع لتسجيلك الصوتي:
                            </p>
                            <!-- أمواج تفاعلية تظهر فقط أثناء الاستماع -->
                            <div id="listening-wave" class="flex items-center gap-1 h-4 hidden">
                                <span class="w-0.5 bg-sky-400 rounded-full animate-pulse h-2"></span>
                                <span class="w-0.5 bg-sky-400 rounded-full animate-pulse h-4"></span>
                                <span class="w-0.5 bg-sky-400 rounded-full animate-pulse h-3"></span>
                                <span class="w-0.5 bg-sky-400 rounded-full animate-pulse h-4"></span>
                                <span class="w-0.5 bg-sky-400 rounded-full animate-pulse h-2"></span>
                            </div>
                        </div>
                        <audio id="my-audio-player" controls src="${audioUrl}" class="w-full h-8"></audio>
                    </div>
                `;

                // تفعيل الأمواج المتحركة عند التشغيل
                const audioEl = document.getElementById('my-audio-player');
                const waveEl = document.getElementById('listening-wave');

                if (audioEl && waveEl) {
                    audioEl.onplay = () => waveEl.classList.remove('hidden');
                    audioEl.onpause = () => waveEl.classList.add('hidden');
                    audioEl.onended = () => waveEl.classList.add('hidden');
                }

                showToast("تم حفظ التسجيل الصوتي بنجاح! 🎙️");
            };

            mediaRecorder.start();
            isRecording = true;
            btnText.innerText = "إيقاف التسجيل";
            recordIcon.classList.add('fa-beat', 'text-white');

            // إظهار صندوق المعاينة والأمواج والعداد
            visualizerContainer.classList.remove('hidden');
            playbackContainer.classList.add('hidden');

            // بدء العداد الزمني
            clearInterval(recordingInterval);
            secondsElapsed = 0;
            timerEl.textContent = "00:00";
            recordingInterval = setInterval(() => {
                secondsElapsed++;
                const mins = String(Math.floor(secondsElapsed / 60)).padStart(2, '0');
                const secs = String(secondsElapsed % 60).padStart(2, '0');
                timerEl.textContent = `${mins}:${secs}`;
            }, 1000);

            showToast("بدأ التسجيل... ألقِ ملخصك بثقة!");

        } catch (err) {
            console.error("Mic Error:", err);
            alert("تعذر الوصول إلى الميكروفون. تأكد من منح الصلاحيات في المتصفح.");
        }
    } else {
        mediaRecorder.stop();
        isRecording = false;
        btnText.innerText = "بدء التسجيل المستأنف";
        recordIcon.classList.remove('fa-beat', 'text-white');

        // إيقاف العداد وإخفاء صندوق الأمواج الحية
        clearInterval(recordingInterval);
        visualizerContainer.classList.add('hidden');

        // إيقاف استخدام الميكروفون
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
}

// دالة لتنظيم وتنسيق الردود وجعلها متناسقة مع المساحة بدون نجوم مزعجة
function formatAiOutput(text) {
    if (!text) return '';
    return escapeHtml(text)
        .replace(/\*\*(.*?)\*\*/g, '<strong class="text-sky-300 font-bold">$1</strong>') // تحويل النجوم إلى خط عريض
        .replace(/^\s*-{3,}\s*$/gm, '<hr class="border-gray-700 my-2">')                   // فاصل أنيق
        .replace(/^[-*]\s+/gm, '• ');                                                      // نقاط القوائم (في بداية السطر فقط)
}

// ==========================================
// 7. إدارة القائمة الجانبية (الثلاث شرطات) وتنبيهات الجرس
// ==========================================

// عند الضغط على زر القائمة (الثلاث شرطات)
function toggleMenu() {
    showToast("📚 منصة سفير القراءة - جاهزة لمساعدتك في التحدي!");

    const menuInfo = "أهلاً بك يا سفير القراءة.\n\nهذه المنصة تساعدك في:\n• إدارة كتبك وقراءاتك\n• تلخيص الكتب وتحليلها عبر الذكاء الاصطناعي\n• التدرب على الإلقاء الصوتي";
    alert(menuInfo);
}

// عند الضغط على زر الجرس (التنبيهات)
function showNotifications() {
    showToast("🔔 تذكير: لا تنسَ قراءة صفحات جديدة اليوم وتسجيل اقتباساتك!");
}

// ==========================================
// سجل المختبر (التحليلات السابقة)
// ==========================================

const ANALYSIS_KEY = 'safir_analysis_history';

function getAnalysisHistory() {
    try {
        const h = JSON.parse(localStorage.getItem(ANALYSIS_KEY));
        return Array.isArray(h) ? h : [];
    } catch { return []; }
}

function saveAnalysisEntry(title, text, result) {
    const list = getAnalysisHistory();
    list.unshift({ id: Date.now(), title, text, result, date: new Date().toLocaleDateString('ar-SA') });
    try { localStorage.setItem(ANALYSIS_KEY, JSON.stringify(list.slice(0, 30))); } catch (e) {}
    renderAnalysisHistory();
}

function renderAnalysisHistory() {
    const el = document.getElementById('analysis-history-list');
    if (!el) return;
    const list = getAnalysisHistory();

    if (list.length === 0) {
        el.innerHTML = `<p class="text-center text-[11px] text-gray-500 py-3">لا توجد تحليلات سابقة بعد.</p>`;
        return;
    }

    el.innerHTML = list.map(item => `
        <details class="bg-[#1E293B] rounded-xl border border-gray-800 p-3 shadow">
            <summary class="cursor-pointer flex justify-between items-center text-xs gap-2">
                <span class="font-bold text-white">${escapeHtml(item.title)}</span>
                <span class="text-[10px] text-gray-400">${escapeHtml(item.date)}</span>
            </summary>
            <div class="mt-3 space-y-3">
                <div>
                    <p class="text-[10px] text-sky-400 font-bold mb-1">ملخصك:</p>
                    <p class="text-[11px] text-gray-300 whitespace-pre-line bg-[#0F141C] p-2 rounded-lg">${escapeHtml(item.text)}</p>
                </div>
                <div>
                    <p class="text-[10px] text-amber-400 font-bold mb-1">تقييم اللجنة:</p>
                    <div class="text-[11px] text-gray-200 bg-[#0F141C] p-2 rounded-lg">${anHistoryHtml(item.result)}</div>
                </div>
                <button onclick="deleteAnalysisEntry(${Number(item.id)})" class="text-[11px] text-red-400 hover:underline flex items-center gap-1">
                    <i class="fa-solid fa-trash-can"></i> حذف
                </button>
            </div>
        </details>
    `).join('');
}

function deleteAnalysisEntry(id) {
    if (!confirm("هل تريد حذف هذا التحليل من السجل؟")) return;
    localStorage.setItem(ANALYSIS_KEY, JSON.stringify(getAnalysisHistory().filter(i => i.id !== id)));
    renderAnalysisHistory();
}

function clearAnalysisHistory() {
    if (!confirm("هل تريد مسح كل التحليلات السابقة؟")) return;
    localStorage.removeItem(ANALYSIS_KEY);
    renderAnalysisHistory();
}

// ==========================================
// مؤقت العد التنازلي لتسليم الجوازات
// ==========================================
function startPassportCountdown() {
    // التاريخ المستهدف: 5 أبريل 2027 الساعة 23:59:05 (الشهر يبدأ من 0، فـ 3 = أبريل)
    const targetDate = new Date(2027, 3, 5, 23, 59, 5).getTime();

    const countdownInterval = setInterval(() => {
        const now = Date.now();
        const distance = targetDate - now;

        if (distance < 0) {
            clearInterval(countdownInterval);
            const container = document.getElementById('cd-days');
            const box = container ? container.closest('.bg-\\[\\#1E293B\\]') : null;
            if (box) {
                box.innerHTML = `
                    <h3 class="font-bold text-sm text-red-400 flex items-center justify-center gap-2 py-2">
                        <i class="fa-solid fa-triangle-exclamation"></i> انتهى وقت تسليم الجوازات الرسمية!
                    </h3>
                `;
            }
            return;
        }

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        const dEl = document.getElementById('cd-days');
        const hEl = document.getElementById('cd-hours');
        const mEl = document.getElementById('cd-minutes');
        const sEl = document.getElementById('cd-seconds');

        if (dEl) dEl.textContent = String(days).padStart(2, '0');
        if (hEl) hEl.textContent = String(hours).padStart(2, '0');
        if (mEl) mEl.textContent = String(minutes).padStart(2, '0');
        if (sEl) sEl.textContent = String(seconds).padStart(2, '0');

    }, 1000);
}

// تشغيل العداد تلقائياً عند تحميل المنصة
document.addEventListener('DOMContentLoaded', () => {
    startPassportCountdown();
});

// ==========================================
// مفكرة السفير الأدبية (الملاحظات المحلية)
// ==========================================

function loadStudentNotes() {
    const listEl = document.getElementById('notes-list');
    if (!listEl) return;

    const notes = getNotes();

    if (notes.length === 0) {
        listEl.innerHTML = `<p class="text-center text-xs text-gray-400 py-4">لا توجد ملاحظات محفوظة حالياً. ابدأ بتدوين أفكارك!</p>`;
        return;
    }

    let html = '';
    notes.forEach(note => {
        html += `
            <div class="bg-[#1E293B] p-4 rounded-2xl border border-gray-800 space-y-2 shadow relative">
                <div class="flex justify-between items-start">
                    <span class="text-[11px] font-bold text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-lg border border-sky-500/20">
                        ${escapeHtml(note.category || 'عام')}
                    </span>
                    <span class="text-[10px] text-gray-400">${escapeHtml(note.date || '')}</span>
                </div>
                <h4 class="font-bold text-sm text-white pt-1">${escapeHtml(note.title)}</h4>
                <p class="text-xs text-gray-300 leading-relaxed whitespace-pre-line">${escapeHtml(note.text)}</p>
                <div class="flex justify-end pt-2 border-t border-gray-800/60">
                    <button onclick="deleteStudentNote('${escapeHtml(note.id)}')" class="text-gray-400 hover:text-red-400 transition text-xs flex items-center gap-1 font-bold">
                        <i class="fa-solid fa-trash-can"></i> حذف
                    </button>
                </div>
            </div>
        `;
    });
    listEl.innerHTML = html;
}

function saveStudentNote() {
    const title = document.getElementById('note-title').value.trim();
    const category = document.getElementById('note-category').value;
    const text = document.getElementById('note-text').value.trim();

    if (!title || !text) {
        alert("الرجاء إدخال عنوان الملاحظة ومحتواها.");
        return;
    }

    const notes = getNotes();
    notes.unshift({
        id: 'note_' + Date.now(),
        title: title,
        category: category,
        text: text,
        date: new Date().toLocaleDateString('ar-SA')
    });
    setNotes(notes);

    // تفريغ الحقول
    document.getElementById('note-title').value = '';
    document.getElementById('note-text').value = '';

    loadStudentNotes();
    showToast("تم حفظ الملاحظة بنجاح! 📝");
}

function deleteStudentNote(id) {
    if (!confirm("هل أنت متأكد من حذف هذه الملاحظة؟")) return;
    setNotes(getNotes().filter(n => n.id !== id));
    loadStudentNotes();
    showToast("تم حذف الملاحظة.");
}

// تحميل الملاحظات عند فتح المنصة
document.addEventListener('DOMContentLoaded', () => {
    loadStudentNotes();
});

// ==========================================
// التحكم بالقراءة الصوتية الآلية (Text-to-Speech Control)
// ==========================================

let currentUtterance = null;

// تحديث نص السرعة الظاهر للمستخدم
function updateSpeedLabel(val) {
    const label = document.getElementById('speed-label');
    if (label) {
        label.textContent = `السرعة: ${parseFloat(val).toFixed(1)}x`;
    }
}

// دالة تشغيل القراءة الصوتية بالسرعة المحددة
function speakTextCustom(textToRead = null) {
    if (!('speechSynthesis' in window)) {
        showToast("متصفحك لا يدعم القراءة الصوتية.");
        return;
    }

    // زر "استماع" بدون نص ممرر: يقرأ ما في مربع النص (tts-text) مع الأمواج والحالة
    // (كان يبحث عن summary-output وهو غير موجود في الصفحة، فيقرأ جملة الترحيب فقط)
    if (typeof textToRead !== 'string' || !textToRead) {
        playTextAudio();
        return;
    }

    const text = textToRead;

    if (!text || text.trim() === "") {
        showToast("لا يوجد نص حالي لقراءته.");
        return;
    }

    const rateInput = document.getElementById('speech-rate');
    const rate = rateInput ? parseFloat(rateInput.value) || 1.0 : 1.0;

    speakArabic(text, {
        rate,
        onError: (e) => {
            console.error("TTS Error:", e);
            showToast("حدث خطأ أثناء محاولة تشغيل الصوت.");
        }
    });
    showToast("جاري القراءة الصوتية... 🔊");
}

// دالة إيقاف القراءة الصوتية
function stopSpeechCustom() {
    if ('speechSynthesis' in window) {
        speechToken++; // إلغاء سلسلة المقاطع المتبقية
        window.speechSynthesis.cancel();
        const waveEl = document.getElementById('tts-wave');
        const statusEl = document.getElementById('tts-status');
        if (waveEl) waveEl.classList.add('hidden');
        if (statusEl) statusEl.textContent = "تم الإيقاف";
        showToast("تم إيقاف القراءة الصوتية.");
    }
}

// ==========================================
// تسجيل Service Worker (لتثبيت الموقع كتطبيق)
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.error('SW Error:', err));
    });
}

// ==========================================
// مدرّب المقابلة: بنك الأسئلة + وضع التدريب + معايير التحكيم
// ==========================================
const IV_CATS = ['الكتاب', 'الشخصيات والأفكار', 'الأثر الشخصي', 'المؤلف والتنوع', 'أسئلة عامة'];

// معايير التحكيم الرسمية (نموذج التحكيم الموحد)
const IV_RUBRIC = [
    { n: 1, t: 'عرض الكتاب وتحديد الأفكار الرئيسية والفرعية', m: 10 },
    { n: 2, t: 'الدروس المستفادة والربط بالواقع', m: 5 },
    { n: 3, t: 'تحديد عناوين أخرى للكتاب', m: 3 },
    { n: 4, t: 'التراكيب واللغة', m: 10 },
    { n: 5, t: 'التدفق والوضوح', m: 10 },
    { n: 6, t: 'الأسلوب الخطابي والإعلامي', m: 10 },
    { n: 7, t: 'القراءة الناقدة', m: 20 },
    { n: 8, t: 'لغة الجسد', m: 7 },
    { n: 9, t: 'الثقة بالنفس', m: 10 },
    { n: 10, t: 'الحضور والشخصية (الكاريزما)', m: 10 },
    { n: 11, t: 'التنوع والمعلومات المكتبية', m: 5 }
];

// الأسئلة تُكتب هنا مرة واحدة: c = الفئة، q = السؤال، h = كيف تجيب، l = ما تبحث عنه اللجنة، k = رقم المعيار
const IV_QUESTIONS = [
    { c: 0, q: 'لخّص لنا فكرة الكتاب في دقيقة واحدة.', h: 'ابدأ بجملة تلخّص الفكرة العامة، ثم اذكر 2–3 أفكار رئيسية، واختم بما استفدته.', l: 'عرضاً منظماً يفرّق بين الفكرة الأساسية والتفاصيل.', k: 1 },
    { c: 0, q: 'ما الفكرة الرئيسية للكتاب؟ وما الأفكار الفرعية التي تدعمها؟', h: 'اذكر الفكرة الأساسية أولاً ثم رتّب الفرعية كأنها أعمدة تسندها.', l: 'قدرتك على التمييز بين الأساسي والفرعي.', k: 1 },
    { c: 0, q: 'لماذا اختار المؤلف هذا العنوان؟ وما عنوان آخر تقترحه؟', h: 'اربط العنوان بمضمون الكتاب، ثم اقترح عنواناً مختلفاً غير مكرر مع سبب اختيارك.', l: 'عنواناً مناسباً مختلفاً عن الأصلي، مع تعليل.', k: 3 },
    { c: 0, q: 'كيف بدأ الكتاب وكيف انتهى؟', h: 'صِف المقدمة والخاتمة بترتيب منطقي دون قفز بين الأفكار.', l: 'تسلسلاً واضحاً وانتقالاً سلساً.', k: 5 },
    { c: 0, q: 'ما أهم الدروس التي استفدتها من الكتاب؟ وكيف تطبّقها؟', h: 'اذكر 4–5 دروس، وأوضح كل درس بمثال من واقعك.', l: 'عدد الدروس مع توضيحها وربطها بالواقع.', k: 2 },

    { c: 1, q: 'ما رأيك في الشخصية الرئيسية؟ هل اتفقت مع تصرفاتها؟', h: 'أبدِ رأيك بوضوح مع دليل من الكتاب، ولا تخف من الاختلاف بأدب.', l: 'رأياً شخصياً معلَّلاً وليس سرداً للأحداث.', k: 7 },
    { c: 1, q: 'لو كنت مكان بطل الكتاب، ماذا كنت ستفعل؟', h: 'قارن قرارك بقراره، وبيّن سبب الاختلاف.', l: 'تفكيراً مستقلاً وقدرة على التحليل.', k: 7 },
    { c: 1, q: 'هل كانت أحداث الكتاب متوقعة؟ وما أكثر ما فاجأك؟', h: 'حدّد حدثاً بعينه واشرح لماذا لم تتوقعه.', l: 'تفاعلاً حقيقياً مع النص.', k: 7 },
    { c: 1, q: 'هل غيّر الكتاب نظرتك إلى موضوع ما؟', h: 'قل ما كانت نظرتك قبل القراءة وما صارت بعدها.', l: 'تحولاً فكرياً واضحاً.', k: 7 },
    { c: 1, q: 'ما الفكرة في الكتاب التي لم تقتنع بها؟ ولماذا؟', h: 'اعرض الفكرة، ثم حجتك المضادة بهدوء واحترام.', l: 'نقداً متزناً مبنياً على حجة.', k: 7 },

    { c: 2, q: 'ما أثر هذا الكتاب فيك؟', h: 'ابدأ بمثال محدد: موقف أو قرار أو عادة تغيّرت بسببه.', l: 'أثراً صادقاً وملموساً، لا عبارات عامة.', k: 9 },
    { c: 2, q: 'كيف غيّر الكتاب سلوكك أو تفكيرك؟', h: 'اذكر سلوكاً قبل وبعد، بجملتين واضحتين.', l: 'ربطاً حقيقياً بين القراءة وحياتك.', k: 2 },
    { c: 2, q: 'لمن توصي بقراءة هذا الكتاب ولماذا؟', h: 'حدّد فئة (أصدقاء، أسرة، طلاب) وقدّم سببين.', l: 'فهمك لقيمة الكتاب وجمهوره.', k: 6 },
    { c: 2, q: 'ما أجمل اقتباس أو فكرة علقت في ذهنك؟ ولماذا؟', h: 'اذكر الاقتباس باختصار ثم فسّر سبب تأثيره فيك.', l: 'ذاكرة جيدة وذوقاً أدبياً وتعليلاً.', k: 7 },
    { c: 2, q: 'ما الدرس الذي ستنقله إلى زملائك؟', h: 'اختر درساً واحداً واشرحه بطريقة مشوّقة.', l: 'قدرتك على التأثير في الآخرين.', k: 10 },

    { c: 3, q: 'من هو مؤلف الكتاب؟ وما الذي يميّز أسلوبه؟', h: 'اذكر اسم المؤلف وجنسيته وأهم أعماله بإيجاز، ثم صِف أسلوبه.', l: 'معرفة بالمؤلف وبما كتب.', k: 11 },
    { c: 3, q: 'لماذا اخترت هذا الكتاب تحديداً؟', h: 'اذكر ميلك للموضوع، وكيف وجدته (مكتبة، صديق، معلم).', l: 'اختياراً واعياً ينسجم مع ميولك.', k: 11 },
    { c: 3, q: 'ما أنواع الكتب التي قرأتها في التحدي؟', h: 'اذكر 4 مجالات أو أكثر: علمي، تاريخي، قصصي، سير، تنمية ذاتية.', l: 'تنوعاً في المجالات والمؤلفين.', k: 11 },
    { c: 3, q: 'اذكر ثلاثة مؤلفين قرأت لهم. ما الذي ميّز كل واحد؟', h: 'جملة واحدة لكل مؤلف: الاسم، الكتاب، والميزة.', l: 'معرفة بأسماء المؤلفين وسرعة استحضارها.', k: 11 },
    { c: 3, q: 'ما أصعب كتاب قرأته؟ وكيف تعاملت مع صعوبته؟', h: 'كن صريحاً، واذكر الاستراتيجية التي ساعدتك.', l: 'مثابرة وصدقاً.', k: 9 },

    { c: 4, q: 'لماذا تحب القراءة؟', h: 'اروِ قصة قصيرة عن أول كتاب أحببته.', l: 'شغفاً حقيقياً وليس إجابة محفوظة.', k: 10 },
    { c: 4, q: 'كيف نظّمت وقتك لقراءة خمسين كتاباً؟', h: 'اذكر عادات عملية: وقت ثابت، عدد صفحات يومي.', l: 'التزاماً وانضباطاً.', k: 9 },
    { c: 4, q: 'كيف تختار كتابك التالي؟', h: 'اذكر معاييرك: الموضوع، توصية، حجم الكتاب.', l: 'وعياً بقراءاتك.', k: 11 },
    { c: 4, q: 'القراءة الورقية أم الإلكترونية، أيهما تفضّل ولماذا؟', h: 'اختر موقفاً وادعمه بمثال، ويمكنك ذكر مزايا الطرفين.', l: 'رأياً معلَّلاً بأسلوب منظم.', k: 5 },
    { c: 4, q: 'كيف تشجّع زملاءك على القراءة؟', h: 'قدّم فكرتين عمليتين مجرّبتين.', l: 'مبادرة وشخصية قيادية.', k: 10 }
];

let ivView = 'bank', ivCat = -1, ivCurrent = -1, ivTimerId = null, ivLeft = 60, ivBusy = false;
const IV_KEY = 'safir_iv_done';

function ivDone() { try { return JSON.parse(localStorage.getItem(IV_KEY)) || []; } catch { return []; } }
function ivMark(i) {
    const d = ivDone();
    if (!d.includes(i)) { d.push(i); try { localStorage.setItem(IV_KEY, JSON.stringify(d)); } catch { } }
    ivUpdateProgress();
}
function ivUpdateProgress() {
    const el = document.getElementById('iv-progress');
    if (el) el.textContent = ivDone().length + '/' + IV_QUESTIONS.length;
}

function ivSetView(v) {
    ivView = v;
    ['bank', 'practice', 'rubric'].forEach(x => {
        document.getElementById('iv-view-' + x).classList.toggle('hidden', x !== v);
        const b = document.getElementById('iv-tab-' + x);
        b.className = 'py-2 rounded-lg ' + (x === v ? 'bg-emerald-500 text-white' : 'text-gray-400');
    });
    if (v === 'bank') ivRenderBank();
    if (v === 'rubric') ivRenderRubric();
}

function ivRenderBank() {
    const cats = document.getElementById('iv-cats');
    const all = ['الكل', ...IV_CATS];
    cats.innerHTML = all.map((c, i) => `<button onclick="ivPickCat(${i - 1})" class="whitespace-nowrap px-3 py-1.5 rounded-full text-[11px] font-bold border ${ivCat === i - 1 ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-[#0F141C] text-gray-400 border-gray-800'}">${c}</button>`).join('');
    const done = ivDone();
    document.getElementById('iv-list').innerHTML = IV_QUESTIONS.map((x, i) => ({ x, i })).filter(o => ivCat < 0 || o.x.c === ivCat).map(({ x, i }) => `
        <div class="bg-[#0F141C] border border-gray-800 rounded-xl overflow-hidden">
            <button onclick="ivToggle(${i})" class="w-full flex items-center justify-between gap-2 p-3 text-right">
                <span class="text-xs font-bold text-gray-200 leading-relaxed">${done.includes(i) ? '<i class="fa-solid fa-circle-check text-emerald-400 ml-1"></i>' : ''}${escapeHtml(x.q)}</span>
                <i id="iv-chev-${i}" class="fa-solid fa-chevron-down text-gray-500 text-[10px] transition"></i>
            </button>
            <div id="iv-body-${i}" class="hidden px-3 pb-3 space-y-2 text-[11px] leading-relaxed">
                <p><span class="font-bold text-sky-400">كيف تجيب؟</span> <span class="text-gray-300">${escapeHtml(x.h)}</span></p>
                <p><span class="font-bold text-amber-400">ماذا تبحث اللجنة؟</span> <span class="text-gray-300">${escapeHtml(x.l)}</span></p>
                <div class="flex items-center justify-between pt-1">
                    <span class="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">معيار ${x.k}: ${escapeHtml(IV_RUBRIC[x.k - 1].t)}</span>
                    <button onclick="ivPractice(${i})" class="text-[11px] font-bold text-emerald-400">تدرّب عليه <i class="fa-solid fa-arrow-left"></i></button>
                </div>
            </div>
        </div>`).join('');
}
function ivPickCat(c) { ivCat = c; ivRenderBank(); }
function ivToggle(i) {
    document.getElementById('iv-body-' + i).classList.toggle('hidden');
    document.getElementById('iv-chev-' + i).classList.toggle('rotate-180');
}

function ivRenderRubric() {
    document.getElementById('iv-rubric').innerHTML = IV_RUBRIC.map(r => `
        <div class="flex items-center justify-between bg-[#0F141C] border border-gray-800 rounded-xl px-3 py-2 text-xs">
            <span class="text-gray-200"><span class="text-emerald-400 font-bold ml-1">${r.n}.</span>${escapeHtml(r.t)}</span>
            <span class="font-mono font-bold text-amber-400">${r.m}</span>
        </div>`).join('');
}

function ivPractice(i) {
    ivSetView('practice');
    ivCurrent = i;
    ivFollow = null;
    try { const bk = document.getElementById('iv-book'); if (bk && !bk.value) bk.value = localStorage.getItem('safir_iv_book') || ''; } catch { }
    ivStop();
    const x = IV_QUESTIONS[i];
    document.getElementById('iv-question-box').innerHTML = `<span class="text-[10px] text-emerald-400 font-bold block mb-1">${IV_CATS[x.c]}</span><span class="text-sm font-bold text-white leading-relaxed">${escapeHtml(x.q)}</span>`;
    document.getElementById('iv-answer').value = '';
    document.getElementById('iv-result').classList.add('hidden');
    document.getElementById('iv-timer-wrap').classList.add('hidden');
}
function ivRandom() {
    const pool = IV_QUESTIONS.map((_, i) => i).filter(i => i !== ivCurrent);
    ivPractice(pool[Math.floor(Math.random() * pool.length)]);
}

function ivFmt(s) { return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
function ivStop() { clearInterval(ivTimerId); ivTimerId = null; }
function ivStart() {
    if (ivCurrent < 0) { showToast('اختر سؤالاً أولاً'); return; }
    ivStop();
    ivLeft = 60;
    const wrap = document.getElementById('iv-timer-wrap'), t = document.getElementById('iv-timer'), bar = document.getElementById('iv-bar');
    wrap.classList.remove('hidden');
    t.textContent = ivFmt(ivLeft); t.className = 'font-mono font-bold text-emerald-400 text-sm';
    bar.style.transition = 'none'; bar.style.width = '100%'; bar.className = 'h-full bg-emerald-400';
    void bar.offsetWidth; bar.style.transition = '';
    ivMark(ivCurrent);
    ivTimerId = setInterval(() => {
        ivLeft--;
        t.textContent = ivFmt(ivLeft);
        bar.style.width = (ivLeft / 60 * 100) + '%';
        if (ivLeft <= 10) { t.classList.replace('text-emerald-400', 'text-red-400'); bar.classList.replace('bg-emerald-400', 'bg-red-400'); }
        if (ivLeft <= 0) {
            ivStop();
            if (isRecording) ivRecord();
            showToast('انتهى الوقت ⏱️');
        }
    }, 1000);
}

function ivListen() {
    if (ivCurrent < 0) { showToast('اختر سؤالاً أولاً'); return; }
    speakArabic(IV_QUESTIONS[ivCurrent].q, { rate: 0.95 });
}
async function ivRecord() {
    await toggleRecording(); // نستخدم المسجّل الموجود، ويظهر المشغّل في بطاقة التسجيل
    const b = document.getElementById('iv-rec-btn');
    if (b) b.innerHTML = isRecording ? '<i class="fa-solid fa-stop"></i> إيقاف' : '<i class="fa-solid fa-microphone"></i> سجّل صوتك';
}

let ivFollow = null, ivLastImproved = '', ivLastAns = '';

function ivParseJson(t) {
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b < 0) return null;
    try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}

async function ivEvaluate() {
    if (ivBusy) return;
    const ans = document.getElementById('iv-answer').value.trim();
    const book = document.getElementById('iv-book').value.trim();
    const out = document.getElementById('iv-result');
    if (ivCurrent < 0) { showToast('اختر سؤالاً أولاً'); return; }
    const words = ans.split(/\s+/).filter(Boolean).length;
    if (words < 25) { showToast('إجابتك قصيرة جداً (' + words + ' كلمة). اكتب 25 كلمة على الأقل'); return; }
    const x = IV_QUESTIONS[ivCurrent];
    const q = ivFollow ? ivFollow.q : x.q;
    const k = ivFollow ? ivFollow.k : x.k;
    const needsBook = x.c !== 4;
    if (needsBook && !book) { showToast('اكتب اسم الكتاب أولاً ليكون التقييم دقيقاً'); document.getElementById('iv-book').focus(); return; }
    try { localStorage.setItem('safir_iv_book', book); } catch { }

    ivBusy = true;
    ivMark(ivCurrent);
    out.classList.remove('hidden');
    out.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin text-amber-400"></i> اللجنة تقرأ إجابتك وتقارنها بالسؤال...';

    const ids = [...new Set([k, 4, 5, 6, 9])];
    const list = ids.map(id => `{"id":${id},"name":"${IV_RUBRIC[id - 1].t}","max":${IV_RUBRIC[id - 1].m}}`).join(',');
    const prompt = `أنت عضو لجنة تحكيم صارم وعادل في مسابقة تحدي القراءة العربي.
الكتاب: ${book || 'غير محدد (سؤال عام)'}
السؤال الذي طُرح على الطالب: "${q}"
إجابة الطالب (${words} كلمة):
"""
${ans}
"""

قواعد التقييم:
1. قيّم فقط ما كتبه الطالب فعلاً، واقتبس من كلامه حرفياً. لا تعطِ ملاحظات عامة تصلح لأي إجابة.
2. أول ما تفحصه: هل أجاب عن السؤال المطروح تحديداً؟ إن ابتعد عنه أو سرد ملخصاً بدل الإجابة فأعطِ "relevance" منخفضاً وخفّض معيار المحتوى.
3. لا تبالغ في الدرجات: الإجابة العامة الخالية من أمثلة وتفاصيل محددة من الكتاب لا تتجاوز 50% من درجة المعيار. الدرجة العالية تحتاج أمثلة وأسماء وأحداثاً محددة.
4. لا تتحقق من صحة معلومات الكتاب لأنك لا تملك نصه، لكن اطلب التحديد وبيّن حيث ذكر الطالب كلاماً عاماً يمكن أن ينطبق على أي كتاب.
5. في "improved_answer" أعد صياغة إجابة الطالب نفسه بأفكاره هو وبلغة أفصح وترتيب أوضح، ولا تخترع أحداثاً أو شخصيات من الكتاب. إن نقصه مثال فضع [اذكر هنا مثالاً من الكتاب].
6. "follow_up": سؤال متابعة واحد قد تطرحه اللجنة بناءً على إجابته تحديداً.

أخرج JSON صالحاً فقط بلا أي نص خارجه، بهذا الشكل:
{"relevance":{"score":0-10,"comment":"جملة واحدة"},
"criteria":[ لكل معيار من هذه القائمة: ${list} ضع {"id":رقم,"score":رقم لا يتجاوز max,"note":"جملة تشير إلى عبارة من إجابته"} ],
"strengths":["نقطة قوة مع اقتباس قصير من إجابته"],
"improvements":[{"quote":"عبارة حرفية من إجابته","problem":"ما المشكلة","fix":"كيف يصلحها"}],
"improved_answer":"...","follow_up":"..."}
اجعل improvements من 2 إلى 3 عناصر فقط، وstrengths من 1 إلى 2.`;

    try {
        const reply = await askAI([
            { role: 'system', content: 'أنت محكّم مسابقة تحدي القراءة العربي. تُخرج JSON صالحاً فقط، بالعربية الفصحى المبسطة، وكل ملاحظة مرتبطة بنص الطالب والسؤال.' },
            { role: 'user', content: prompt }
        ]);
        const d = ivParseJson(reply);
        if (!d || !Array.isArray(d.criteria)) { out.innerHTML = formatAiOutput(reply); return; }
        ivLastAns = anNorm(ans);
        out.innerHTML = ivRenderResult(d, ids, words);
    } catch (e) {
        out.textContent = '⚠️ ' + (e.message || 'تعذر الاتصال بلجنة التحكيم.');
    } finally { ivBusy = false; }
}

function ivRenderResult(d, ids, words) {
    const E = escapeHtml;
    let total = 0, max = 0;
    const rows = ids.map(id => {
        const m = IV_RUBRIC[id - 1].m;
        const c = (d.criteria.find(z => +z.id === id)) || {};
        const s = Math.max(0, Math.min(m, Math.round(+c.score || 0)));
        total += s; max += m;
        const p = s / m, col = p >= .75 ? 'bg-emerald-400' : p >= .5 ? 'bg-amber-400' : 'bg-red-400';
        return `<div class="space-y-1"><div class="flex justify-between text-[11px]"><span class="font-bold text-gray-200">${E(IV_RUBRIC[id - 1].t)}</span><span class="font-mono text-gray-300">${s}/${m}</span></div>
            <div class="h-1.5 bg-gray-800 rounded-full overflow-hidden"><div class="h-full ${col}" style="width:${p * 100}%"></div></div>
            <p class="text-[11px] text-gray-400">${E(c.note || '')}</p></div>`;
    }).join('');
    const rel = Math.max(0, Math.min(10, Math.round(+(d.relevance && d.relevance.score) || 0)));
    const relCol = rel >= 7 ? 'text-emerald-400 bg-emerald-500/20' : rel >= 4 ? 'text-amber-400 bg-amber-500/20' : 'text-red-400 bg-red-500/20';
    const pct = Math.round(total / max * 100);
    ivLastImproved = d.improved_answer || '';
    const li = a => (a || []).map(s => `<li class="text-[11px] text-gray-300">${E(s)}</li>`).join('');
    const imp = (d.improvements || []).filter(i => i && ivLastAns.includes(anNorm(i.quote)) ).slice(0, 3).map(i => `
        <div class="bg-[#1E293B] rounded-lg p-2.5 space-y-1 border border-gray-800">
            <p class="text-[11px] text-amber-300">«${E(i.quote || '')}»</p>
            <p class="text-[11px] text-gray-300"><span class="font-bold text-red-400">المشكلة:</span> ${E(i.problem || '')}</p>
            <p class="text-[11px] text-gray-300"><span class="font-bold text-emerald-400">الحل:</span> ${E(i.fix || '')}</p>
        </div>`).join('');
    const short = words < 60 ? `<p class="text-[11px] text-amber-400">إجابتك ${words} كلمة فقط؛ دقيقة كاملة تعني نحو 120 كلمة، فأضف مثالاً.</p>` : '';
    return `<div class="space-y-3 text-right">
        <div class="flex items-center justify-between"><div><span class="text-2xl font-bold text-white">${total}</span><span class="text-xs text-gray-400">/${max} (${pct}%)</span></div>
            <span class="text-[10px] font-bold px-2 py-1 rounded-full ${relCol}">الصلة بالسؤال ${rel}/10</span></div>
        <p class="text-[11px] text-gray-300">${E((d.relevance && d.relevance.comment) || '')}</p>${short}
        <div class="space-y-2.5">${rows}</div>
        <div><h4 class="text-xs font-bold text-emerald-400 mb-1">نقاط القوة</h4><ul class="list-disc pr-4 space-y-0.5">${li(d.strengths)}</ul></div>
        <div class="space-y-2"><h4 class="text-xs font-bold text-amber-400">ما يحتاج تحسيناً في إجابتك</h4>${imp}</div>
        <div class="bg-[#1E293B] rounded-lg p-2.5 space-y-1.5 border border-emerald-500/20">
            <div class="flex items-center justify-between"><h4 class="text-xs font-bold text-sky-400">صياغة محسّنة لإجابتك</h4>
            <button onclick="speakArabic(ivLastImproved,{rate:0.95})" class="text-[11px] text-sky-400"><i class="fa-solid fa-volume-high"></i> استمع</button></div>
            <p class="text-[11px] text-gray-200 leading-relaxed">${E(d.improved_answer || '')}</p></div>
        ${d.follow_up ? `<button onclick="ivFollowUp()" class="w-full text-right bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2.5"><span class="block text-[10px] font-bold text-emerald-400 mb-0.5">سؤال متابعة من اللجنة (اضغط للإجابة عنه)</span><span class="text-[11px] text-gray-200">${E(d.follow_up)}</span></button>` : ''}
    </div>`;
}
function ivFollowUp() {
    const el = document.querySelector('#iv-result button[onclick="ivFollowUp()"] span:last-child');
    if (!el) return;
    ivFollow = { q: el.textContent, k: IV_QUESTIONS[ivCurrent].k };
    document.getElementById('iv-question-box').innerHTML = `<span class="text-[10px] text-amber-400 font-bold block mb-1">سؤال متابعة</span><span class="text-sm font-bold text-white leading-relaxed">${E_(ivFollow.q)}</span>`;
    document.getElementById('iv-answer').value = '';
    document.getElementById('iv-result').classList.add('hidden');
    document.getElementById('iv-timer-wrap').classList.add('hidden');
    ivStop();
    document.getElementById('iv-answer').focus();
}
const E_ = escapeHtml;

function openInterviewLab(view) {
    switchTab('audio');
    ivSetView(view || 'bank');
    setTimeout(() => document.getElementById('interview-lab').scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
}

document.addEventListener('DOMContentLoaded', () => { ivSetView('bank'); ivUpdateProgress(); });
