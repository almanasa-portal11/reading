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

// ==========================================
// التنقل بين التبويبات
// ==========================================

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    const tab = document.getElementById('tab-' + tabName);
    if (tab) tab.classList.add('active');

    const titles = {
        'home': 'منصة سفير القراءة',
        'assistant': 'المساعد الذكي',
        'library': 'مكتبة الكتب',
        'analysis': 'مختبر التحليل الأدبي'
    };
    const header = document.getElementById('header-title');
    if (header && titles[tabName]) header.innerText = titles[tabName];

    ['home', 'assistant', 'library', 'analysis'].forEach(t => {
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
        if (res.status === 401) throw new Error("المفتاح غير صالح أو ملغي. أنشئ مفتاحاً جديداً. (" + serverMsg + ")");
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

let chatHistory = [];     // سجل المحادثة لإعطاء المساعد سياقاً
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
    } else {
        msgDiv.className = "bg-[#0F141C] border border-gray-800 p-3 rounded-2xl rounded-tr-none max-w-[85%] self-start text-xs text-gray-200 leading-relaxed shadow whitespace-pre-line";
    }

    msgDiv.textContent = text; // textContent آمن
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

        // **تحديث عداد كتب المنصة في الصفحة الرئيسية**
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
    
    // **أضف هذا السطر هنا في النهاية لتحديث عدد الكتب الشخصية تلقائياً**
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

async function evaluateAnalysis() {
    if (isAnalyzing) return;

    const bookTitle = document.getElementById('analysis-book-title').value.trim();
    const text = document.getElementById('analysis-text').value.trim();
    const resultCard = document.getElementById('analysis-result-card');
    const outputDiv = document.getElementById('analysis-output');

    if (!bookTitle || !text) {
        alert("الرجاء كتابة عنوان الكتاب وملخصك الأدبي أولاً.");
        return;
    }

    isAnalyzing = true;
    resultCard.classList.remove('hidden');
    outputDiv.classList.add('whitespace-pre-line');
    outputDiv.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin text-sky-400"></i> جاري إرسال الملخص إلى لجنة التحكيم الذكية لتحليله نقدياً ولغوياً...`;

    const prompt = `قم بتحليل التلخيص التالي لكتاب "${bookTitle}" تقييماً حقيقياً وعميقاً.

نص الملخص:
"""
${text}
"""

قدم تقريرك باللغة العربية الفصحى على النحو التالي:
1. تقدير إجمالي (من 10) مع التعليل.
2. تقييم العمق الفكري والتحليلي.
3. تقييم السلامة اللغوية وبلاغة الأسلوب.
4. هل تم إبراز الأثر الشخصي وتغيير الفكر بوضوح؟
5. نصائح وتوجيهات عملية دقيقة لضمان حصول الطالب على الدرجة الكاملة في المقابلة.`;

    try {
        const reply = await askAI([
            { role: "system", content: "أنت رئيس لجنة تحكيم مسابقة 'تحدي القراءة العربي' وناقد أدبي محترف. أجب بالعربية الفصحى بأسلوب واضح ومحفّز." },
            { role: "user", content: prompt }
        ]);
msgDiv.innerHTML = formatAiOutput(text);

    } catch (error) {
        console.error("AI Analysis Error:", error);
        outputDiv.textContent = "⚠️ " + (error.message || "تعذر الاتصال بخدمة التحليل الذكي.");
    } finally {
        isAnalyzing = false;
    }
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
});

// ==========================================
// 5. الإحصائيات والاقتباسات للصفحة الرئيسية
// ==========================================

const QUOTES = [
    { text: "القراءة تُعطيك أكثر من حياة واحدة، لأنها تُضيف إلى حياتك عقول الآخرين وأرواحهم.", author: "عباس محمود العقاد" },
    { text: "الكتاب هو الصديق الوحيد الذي لا ينافق، ولا يفشي سرك، ولا يتركك في وقت الضيق.", author: "أحمد شوقي" },
    { text: "الأمة التي لا تقرأ تموت قبل وقتها، والجيل الذي لا يقرأ يضيّع البوصلة.", author: "نجيب محفوظ" },
    { text: "ليست العبرة بزيادة عدد الكتب المقروءة، بل بالعمق والأثر الذي تتركه في فكرك.", author: "تحدي القراءة العربي" }
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
        if (text.includes(query)) {
            card.style.display = '';
        } else {
            card.style.display = 'none';
        }
    });
}

// دالة إشعار سريع (Toast Notification)
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
    
    setTimeout(() => {
        toast.classList.add('opacity-0', 'pointer-events-none');
    }, 2500);
}


// ==========================================
// المختبر الصوتي والإلقاء
// ==========================================

// 1. القارئ الآلي للنصوص (Text-to-Speech)
// القارئ الآلي للنصوص (Text-to-Speech) مع معاينة الأمواج الصوتية الحية
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

    // إيقاف أي قراءة سابقة
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ar-SA'; // اللغة العربية
    utterance.rate = 0.9;     // سرعة هادئة ومناسبة للإلقاء الأدبي
    utterance.pitch = 1.0;

    // عند بدء النطق الآلي
    utterance.onstart = () => {
        if (waveEl) waveEl.classList.remove('hidden');
        if (statusEl) statusEl.textContent = "جاري الإلقاء الصوتي...";
        showToast("جاري البدء بالإلقاء الصوتي...");
    };

    // عند انتهاء النطق الآلي
    utterance.onend = () => {
        if (waveEl) waveEl.classList.add('hidden');
        if (statusEl) statusEl.textContent = "انتهى الإلقاء";
    };

    // في حال حدوث خطأ
    utterance.onerror = (e) => {
        console.error("TTS Error:", e);
        if (waveEl) waveEl.classList.add('hidden');
        if (statusEl) statusEl.textContent = "حدث خطأ في القراءة";
        showToast("حدث خطأ أثناء محاولة تشغيل الصوت.");
    };

    window.speechSynthesis.speak(utterance);
}

// 2. تسجيل صوت الطالب (MediaRecorder API)
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let timerInterval = null;
let secondsElapsed = 0;

async function toggleRecording() {
    const btnText = document.getElementById('record-text');
    const recordIcon = document.getElementById('record-icon');
    const playbackContainer = document.getElementById('audio-playback-container');
    const visualizerContainer = document.getElementById('visualizer-container');
    const timerEl = document.getElementById('recording-timer');

    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) audioChunks.push(event.data);
            };

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
                const audioUrl = URL.createObjectURL(audioBlob);
                
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

                // تفعيل الأمواج المتحركة عند الضغط على زر التشغيل (Play)
                const audioEl = document.getElementById('my-audio-player');
                const waveEl = document.getElementById('listening-wave');

                if (audioEl && waveEl) {
                    audioEl.onplay = () => {
                        waveEl.classList.remove('hidden');
                    };
                    audioEl.onpause = () => {
                        waveEl.classList.add('hidden');
                    };
                    audioEl.onended = () => {
                        waveEl.classList.add('hidden');
                    };
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
            secondsElapsed = 0;
            timerEl.textContent = "00:00";
            timerInterval = setInterval(() => {
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
        clearInterval(timerInterval);
        visualizerContainer.classList.add('hidden');
        
        // إيقاف استخدام الميكروفون
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
}

// دالة لتنظيم وتنسيق الردود وجعلها متناسقة مع المساحة بدون نجوم مزعجة
function formatAiOutput(text) {
    if (!text) return '';
    let clean = escapeHtml(text)
        .replace(/\*\*(.*?)\*\*/g, '<strong class="text-sky-300 font-bold">$1</strong>') // تحويل النجوم إلى خط عريض جميل
        .replace(/---/g, '<hr class="border-gray-700 my-2">') // تحويل الخطوط المزعجة إلى فاصل أنيق
        .replace(/[-*]\s+/g, '<br>• '); // تحويل النقاط لتظهر بشكل مرتب
    return clean;
}

// ==========================================
// 7. إدارة القائمة الجانبية (الثلاث شرطات) وتنبيهات الجرس
// ==========================================

// عند الضغط على زر القائمة (الثلاث شرطات)
function toggleMenu() {
    // تعرض نافذة معلومات سريعة عن المنصة أو خيارات إضافية
    showToast("📚 منصة سفير القراءة - جاهزة لمساعدتك في التحدي!");
    
    // يمكنك فتح نافذة ترحيبية أو إظهار خيارات سريعة هنا
    const menuInfo = "أهلاً بك يا سفير القراءة.\n\nهذه المنصة تساعدك في:\n• إدارة كتبك وقراءاتك\n• تلخيص الكتب وتحليلها عبر الذكاء الاصطناعي\n• التدرب على الإلقاء الصوتي";
    alert(menuInfo);
}

// عند الضغط على زر الجرس (التنبيهات)
function showNotifications() {
    // عرض تنبيه تفاعلي لطيف للطالب
    showToast("🔔 تذكير: لا تنسَ قراءة صفديات جديدة اليوم وتسجيل اقتباساتك!");
}

// ==========================================
// مؤقت العد التنازلي لتسليم الجوازات
// ==========================================
function startPassportCountdown() {
    // حدد هنا التاريخ والوقت المستهدف لتسليم الجوازات (يمكنك تغييره حسب موعد مدرستك أو التحدي)
    const targetDate = new Date("April 5, 2027 23:59:5").getTime();

    const timerInterval = setInterval(() => {
        const now = new Date().getTime();
        const distance = targetDate - now;

        if (distance < 0) {
            clearInterval(timerInterval);
            const container = document.getElementById('cd-days');
            if(container) {
                container.closest('.bg-\\[\\#1E293B\\]').innerHTML = `
                    <h3 class="font-bold text-sm text-red-400 flex items-center justify-center gap-2 py-2">
                        <i class="fa-solid fa-triangle-exclamation"></i> انتهى وقت تسليم الجوازات الرسمية!
                    </h3>
                `;
            }
            return;
        }

        // حساب الأيام، الساعات، الدقائق، والثواني
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        // حقن القيم في الواجهة مع إضافة الصفر التبادلي (Padding)
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

    const notes = JSON.parse(localStorage.getItem('student_notes') || '[]');

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
                    <button onclick="deleteStudentNote('${note.id}')" class="text-gray-400 hover:text-red-400 transition text-xs flex items-center gap-1 font-bold">
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

    const notes = JSON.parse(localStorage.getItem('student_notes') || '[]');
    const newNote = {
        id: 'note_' + Date.now(),
        title: title,
        category: category,
        text: text,
        date: new Date().toLocaleDateString('ar-SA')
    };

    notes.unshift(newNote);
    localStorage.setItem('student_notes', JSON.stringify(notes));

    // تفريغ الحقول
    document.getElementById('note-title').value = '';
    document.getElementById('note-text').value = '';

    loadStudentNotes();
    showToast("تم حفظ الملاحظة بنجاح! 📝");
}

function deleteStudentNote(id) {
    if (!confirm("هل أنت متأكد من حذف هذه الملاحظة؟")) return;
    let notes = JSON.parse(localStorage.getItem('student_notes') || '[]');
    notes = notes.filter(n => n.id !== id);
    localStorage.setItem('student_notes', JSON.stringify(notes));
    loadStudentNotes();
    showToast("تم حذف الملاحظة.");
}

// تحميل الملاحظات عند فتح المنصة
document.addEventListener('DOMContentLoaded', () => {
    loadStudentNotes();
});