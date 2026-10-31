// ==========================================
// ربط المساعد بذكاء اصطناعي بديل (عبر Groq / OpenAI API)
// ==========================================

const API_KEY = "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"; // ضع مفتاحك هنا

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-' + tabName).classList.add('active');
    
    const titles = { 
        'home': 'منصة سفير القراءة', 
        'assistant': 'المساعد الذكي',
        'library': 'مكتبة الكتب', 
        'analysis': 'مختبر التحليل الأدبي' 
    };
    document.getElementById('header-title').innerText = titles[tabName];

    ['home', 'assistant', 'library', 'analysis'].forEach(t => {
        const btn = document.getElementById('nav-' + t);
        if(btn) {
            if(t === tabName) {
                btn.classList.add('text-sky-400');
                btn.classList.remove('text-gray-400');
            } else {
                btn.classList.remove('text-sky-400');
                btn.classList.add('text-gray-400');
            }
        }
    });
}

// دالة الإرسال والربط مع نموذج الذكاء الاصطناعي الجديد
async function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    // عرض رسالة الطالب فوراً في المحادثة
    appendMessage(text, 'user');
    input.value = '';

    // إظهار مؤشر "جاري التفكير..."
    showTypingIndicator();

    try {
        // إرسال الطلب إلى خادم الذكاء الاصطناعي (Groq مثالاً)
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile", // نموذج سريع وقوي جداً للغة العربية
                messages: [
                    {
                        role: "system",
                        content: "أنت مساعد ذكي ومدرب أدبي متخصص في 'تحدي القراءة العربي'. مهمتك مساعدة الطلاب في تلخيص الكتب، تصحيح الأخطاء اللغوية بأسلوب تربوي، طرح أسئلة تحليلية عميقة، ومحاكاة لجان التحكيم. أجب باللغة العربية الفصحى وبأسلوب مشجّع ومحفز للطلاب."
                    },
                    {
                        role: "user",
                        content: text
                    }
                ],
                temperature: 0.7
            })
        });

        const data = await response.json();
        removeTypingIndicator();

        // فحص الأخطاء أو عرض الإجابة
        if (data.error) {
            appendMessage(`⚠️ خطأ من الخادم: ${data.error.message}`, 'bot');
        } else if (data.choices && data.choices[0].message.content) {
            const aiReply = data.choices[0].message.content;
            appendMessage(aiReply, 'bot');
        } else {
            appendMessage("عذراً، حدث خطأ في استقبال الرد. حاول مرة أخرى.", 'bot');
        }

    } catch (error) {
        removeTypingIndicator();
        console.error("API Error:", error);
        appendMessage("تعذر الاتصال بالخدمة، تأكد من اتصالك بالإنترنت أو صحة المفتاح.", 'bot');
    }
}

// إرسال عبر الأزرار السريعة
function sendQuickMessage(msg) {
    document.getElementById('chat-input').value = msg;
    sendMessage();
}

// إضافة رسالة للواجهة
function appendMessage(text, sender) {
    const chatBox = document.getElementById('chat-box');
    if (!chatBox) return;

    const msgDiv = document.createElement('div');
    
    if (sender === 'user') {
        msgDiv.className = "bg-sky-600 text-white p-3 rounded-2xl rounded-tl-none max-w-[85%] self-end text-xs leading-relaxed shadow";
    } else {
        msgDiv.className = "bg-[#0F141C] border border-gray-800 p-3 rounded-2xl rounded-tr-none max-w-[85%] self-start text-xs text-gray-200 leading-relaxed shadow whitespace-pre-line";
    }
    
    msgDiv.innerText = text;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// مؤشر الكتابة
function showTypingIndicator() {
    const chatBox = document.getElementById('chat-box');
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

// تفعيل زر Enter
document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        chatInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }
});

// ==========================================
// 1. جلب كتب المنصة من Google Sheet (تظهر للجميع)
// ==========================================

// ضع معرف الشيت الخاص بك هنا (ID المكتوب في رابط الشيت بين /d/ و /edit)
const SPREADSHEET_ID = '1UnYvDX6b-O17jcsps_96MVsQ3kgwg7jKshhr69UwUKo';

async function fetchSheetBooks() {
    const container = document.getElementById('sheet-books-container');
    if (!container) return;

    // رابط تحويل الشيت إلى بيانات JSON عامة عبر gviz
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json`;

    try {
        const response = await fetch(url);
        const text = await response.text();
        
        // تنظيف الاستجابة للحصول على JSON سليم
        const jsonString = text.substring(47, text.length - 2);
        const data = JSON.parse(jsonString);
        
        const rows = data.table.rows;
        if (!rows || rows.length === 0) {
            container.innerHTML = `<div class="bg-[#1E293B] p-4 rounded-xl text-center text-gray-400 text-xs">لا توجد كتب مضافة في الشيت حالياً.</div>`;
            return;
        }

        container.innerHTML = '';
        
        // التكرار على صفوف الشيت (تخطي الصف الأول إذا كان عناوين)
        rows.forEach((row, index) => {
            const title = row.c[0] ? row.c[0].v : 'بدون عنوان';
            const author = row.c[1] ? row.c[1].v : 'غير معروف';
            const linkUrl = row.c[2] ? row.c[2].v : '#';
            const badgeType = row.c[3] ? row.c[3].v : 'رابط خارجي';

            // عدم عرض السطر الأول إذا كان يحتوي على أسماء الأعمدة نفسها
            if (title.toLowerCase() === 'title' || title === 'عنوان الكتاب') return;

            const card = document.createElement('div');
            card.className = "bg-[#1E293B] p-4 rounded-xl border border-gray-800 flex justify-between items-center shadow hover:border-gray-700 transition";
            card.innerHTML = `
                <div>
                    <div class="flex items-center gap-2">
                        <h4 class="font-bold text-sm text-white">${title}</h4>
                        <span class="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded text-[10px]">${badgeType}</span>
                    </div>
                    <p class="text-gray-400 text-xs mt-1"><i class="fa-solid fa-user-pen text-[10px] ml-1"></i> ${author}</p>
                </div>
                <a href="${linkUrl}" target="_blank" class="bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1">
                    <i class="fa-solid fa-arrow-up-right-from-square"></i> فتح الكتاب
                </a>
            `;
            container.appendChild(card);
        });

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
// 2. إدارة كتب المستخدم الخاصة (رفع PDF وإضافة الاقتباسات)
// ==========================================

function toggleUploadModal() {
    const modal = document.getElementById('upload-modal');
    if (modal) modal.classList.toggle('hidden');
}

function saveUserBook() {
    const title = document.getElementById('up-title').value.trim();
    const author = document.getElementById('up-author').value.trim();
    const fileInput = document.getElementById('up-file');

    if (!title || !author) {
        alert("الرجاء إدخال عنوان الكتاب واسم المؤلف.");
        return;
    }

    let pdfUrl = "#";
    if (fileInput.files && fileInput.files[0]) {
        pdfUrl = URL.createObjectURL(fileInput.files[0]);
    }

    const newBook = {
        id: Date.now(),
        title: title,
        author: author,
        pdfUrl: pdfUrl,
        quotes: []
    };

    let books = JSON.parse(localStorage.getItem('safir_user_books')) || [];
    books.unshift(newBook);
    localStorage.setItem('safir_user_books', JSON.stringify(books));

    document.getElementById('up-title').value = '';
    document.getElementById('up-author').value = '';
    fileInput.value = '';
    toggleUploadModal();

    loadUserBooks();
}

function loadUserBooks() {
    const container = document.getElementById('user-books-container');
    if (!container) return;

    let books = JSON.parse(localStorage.getItem('safir_user_books')) || [];

    if (books.length === 0) {
        container.innerHTML = `
            <div class="bg-[#1E293B]/50 border border-dashed border-gray-800 p-4 rounded-xl text-center text-gray-500 text-xs">
                لم تقم برفع أي كتاب خاص حتى الآن. اضغط على "رفع كتاب خاص" لأرشفة كتبك.
            </div>
        `;
        return;
    }

    container.innerHTML = '';
    books.forEach(book => {
        let quotesHtml = book.quotes.map(q => `<li class="text-[11px] text-gray-300 bg-[#0F141C] p-2 rounded-lg border border-gray-800/80 mb-1">“${q}”</li>`).join('');

        const card = document.createElement('div');
        card.className = "bg-[#1E293B] p-4 rounded-xl border border-gray-800 space-y-3 shadow";
        card.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <h4 class="font-bold text-sm text-white">${book.title}</h4>
                    <p class="text-gray-400 text-xs mt-0.5">المؤلف: ${book.author}</p>
                </div>
                <button onclick="deleteBook(${book.id})" class="text-red-400 hover:text-red-300 text-xs px-2 py-1"><i class="fa-solid fa-trash-can"></i></button>
            </div>

            <div class="flex gap-2">
                <a href="${book.pdfUrl}" target="_blank" class="flex-1 text-center bg-sky-500 text-white py-1.5 rounded-lg text-xs font-bold hover:bg-sky-600 transition shadow">
                    <i class="fa-solid fa-file-pdf ml-1"></i> قراءة ملف الـ PDF المرفوع
                </a>
            </div>

            <div class="pt-2 border-t border-gray-800 space-y-2">
                <div class="flex justify-between items-center">
                    <span class="text-[11px] font-bold text-sky-400"><i class="fa-solid fa-quote-right ml-1"></i> بنك الاقتباسات والأفكار</span>
                </div>
                <div class="max-h-24 overflow-y-auto space-y-1">
                    ${quotesHtml || '<p class="text-[10px] text-gray-500">لا توجد اقتباسات محفوظة لهذا الكتاب بعد.</p>'}
                </div>
                <div class="flex gap-1 pt-1">
                    <input id="quote-input-${book.id}" type="text" placeholder="اكتب اقتباساً أعجبك من الكتاب..." class="flex-1 bg-[#0F141C] border border-gray-800 text-white text-[11px] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-sky-400">
                    <button onclick="addQuoteToBook(${book.id})" class="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold">إضافة</button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

function addQuoteToBook(bookId) {
    const input = document.getElementById(`quote-input-${bookId}`);
    const quoteText = input.value.trim();
    if (!quoteText) return;

    let books = JSON.parse(localStorage.getItem('safir_user_books')) || [];
    books = books.map(b => {
        if (b.id === bookId) {
            b.quotes.push(quoteText);
        }
        return b;
    });

    localStorage.setItem('safir_user_books', JSON.stringify(books));
    loadUserBooks();
}

function deleteBook(bookId) {
    if (!confirm("هل أنت متأكد من حذف هذا الكتاب من سجلك؟")) return;
    let books = JSON.parse(localStorage.getItem('safir_user_books')) || [];
    books = books.filter(b => b.id !== bookId);
    localStorage.setItem('safir_user_books', JSON.stringify(books));
    loadUserBooks();
}

// استدعاء الدوال عند تشغيل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    fetchSheetBooks();
    loadUserBooks();
});

// ==========================================
// مختبر التحليل الأدبي والتقييم الفوري
// ==========================================

// ==========================================
// مختبر التحليل الأدبي والتقييم عبر الذكاء الاصطناعي الحقيقي
// ==========================================

async function evaluateAnalysis() {
    const bookTitle = document.getElementById('analysis-book-title').value.trim();
    const text = document.getElementById('analysis-text').value.trim();
    const resultCard = document.getElementById('analysis-result-card');
    const outputDiv = document.getElementById('analysis-output');

    if (!bookTitle || !text) {
        alert("الرجاء كتابة عنوان الكتاب وملخصك الأدبي أولاً.");
        return;
    }

    // إظهار البطاقة مع مؤشر تحليل ذكي
    resultCard.classList.remove('hidden');
    outputDiv.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin text-sky-400"></i> جاري إرسال الملخص إلى لجنة التحكيم الذكية لتحليله نقدياً ولغوياً...`;

    try {
        // إرسال الطلب الفعلي لنموذج Gemini للتحليل النقدي
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            {
                                text: `أنت رئيس لجنة تحكيم مسابقة "تحدي القراءة العربي" وناقد أدبي محترف. قم بتحليل التلخيص التالي لكتاب "${bookTitle}" تقييماً حقيقياً وعميقاً.
                                
                                نص الملخص: "${text}"
                                
                                قدم تقريرك باللغة العربية الفصحى على النحو التالي:
                                1. تقدير إجمالي (من 10) مع التعليل.
                                2. تقييم العمق الفكري والتحليلي.
                                3. تقييم السلامة اللغوية وبلاغة الأسلوب.
                                4. هل تم إبراز الأثر الشخصي وتغيير الفكر بوضوح؟
                                5. نصائح وتوجيهات عملية دقيقة لضمان حصول الطالب على الدرجة الكاملة في المقابلة.`
                            }
                        ]
                    }
                ]
            })
        });

        const data = await response.json();

        if (data.error) {
            outputDiv.innerHTML = `⚠️ خطأ من الخادم: ${data.error.message}`;
        } else if (data.candidates && data.candidates[0].content.parts[0].text) {
            const aiEvaluation = data.candidates[0].content.parts[0].text;
            outputDiv.innerHTML = aiEvaluation;
        } else {
            outputDiv.innerHTML = "عذراً، حدث خطأ في استقبال التقييم من المساعد الذكي. حاول مرة أخرى.";
        }

    } catch (error) {
        console.error("AI Analysis Error:", error);
        outputDiv.innerHTML = "تعذر الاتصال بخدمة التحليل الذكي، تأكد من اتصالك بالإنترنت أو صحة المفتاح.";
    }
}