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

const SYSTEM_PROMPT = "أنت مساعد ذكي ومدرب أدبي متخصص في 'تحدي القراءة العربي'. مهمتك مساعدة الطلاب في تلخيص الكتب، تصحيح الأخطاء اللغوية بأسلوب تربوي، طرح أسئلة تحليلية عميقة، ومحاكاة لجان التحكيم. أجب باللغة العربية الفصحى وبأسلوب مشجّع ومحفز للطلاب.";

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

        // استخراج JSON بطريقة أكثر ثباتاً
        const match = text.match(/setResponse\(([\s\S]*)\);?\s*$/);
        if (!match) throw new Error("صيغة الاستجابة غير متوقعة");
        const data = JSON.parse(match[1]);

        const rows = data?.table?.rows;
        if (!rows || rows.length === 0) {
            container.innerHTML = `<div class="bg-[#1E293B] p-4 rounded-xl text-center text-gray-400 text-xs">لا توجد كتب مضافة في الشيت حالياً.</div>`;
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

            // تخطي صف العناوين
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

        if (count === 0) {
            container.innerHTML = `<div class="bg-[#1E293B] p-4 rounded-xl text-center text-gray-400 text-xs">لا توجد كتب مضافة في الشيت حالياً.</div>`;
        }

    } catch (error) {
        console.error("Sheet Fetch Error:", error);
        container.innerHTML = `
            <div class="bg-[#1E293B] p-4 rounded-xl border border-red-900/40 text-center text-gray-400 text-xs space-y-1">
                <p class="text-red-400 font-bold">تعذر جلب البيانات من Google Sheet.</p>
                <p class="text-[11px]">تأكد من مشاركة الشيت كـ "Anyone with the link" ووضع الـ Spreadsheet ID الصحيح.</p>
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
        outputDiv.textContent = reply;
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

    fetchSheetBooks();
    loadUserBooks();
});
