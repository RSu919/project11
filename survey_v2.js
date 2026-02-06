import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabase = createClient(
    "https://mbdatbwrralhlkhyhxlr.supabase.co", 
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iZGF0YndycmFsaGxraHloeGxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNjg2OTksImV4cCI6MjA4NTc0NDY5OX0.5kv8UvBRbYfcZGLXdKI_cWtplkN3YT05XC5AUhVtsok"
);

const QUESTIONNAIRE_ID = "db949a8e-95ad-454e-9fa4-050cf9ed238a"; 

let questions = [];
let currentIndex = 0;
let respondentId = null;
let currentAnswer = null; // 紀錄當前選取的答案

// --- [新增] 補齊字體調整函數，避免 index.html 報錯 ---
window.adjustFontSize = (delta) => {
    const body = document.body;
    const currentSize = parseFloat(window.getComputedStyle(body).fontSize);
    body.style.fontSize = (currentSize + delta) + "px";
};

// --- [新增] 選項選取邏輯 ---
window.selectOption = (el, val) => {
    // 移除其他選項的選取狀態
    document.querySelectorAll('.opt-item').forEach(item => item.classList.remove('selected'));
    // 加入選取狀態
    el.classList.add('selected');
    currentAnswer = val;
};

// 1. 初始化受試者
async function initRespondent() {
    const { data, error } = await supabase
        .from('respondent')
        .insert([{ 
            questionnaire_id: QUESTIONNAIRE_ID,
            device_type: window.innerWidth < 768 ? 'mobile' : 'desktop',
            start_time: new Date().toISOString(),
            abandoned: true 
        }])
        .select();

    if (data && data.length > 0) {
        respondentId = data[0].id;
    } else {
        console.error("無法建立受試者紀錄:", error);
    }
}

// 2. 抓取題目 (對齊您的真實 Schema)
async function fetchQuestions() {
    const { data, error } = await supabase
        .from('question_block')
        .select(`
            id,
            title,
            encouragement_text,
            question (
                id,
                question_text,   /* 真實欄位名 */
                question_type,   /* 真實欄位名 */
                options,
                order_index
            )
        `)
        .eq('questionnaire_id', QUESTIONNAIRE_ID)
        .order('order_index', { ascending: true });

    if (error || !data) {
        console.error("讀取題目失敗:", error);
        document.getElementById('app').innerHTML = `<div style="padding:20px;">讀取失敗，請確認資料庫中 questionnaire_id 是否正確。</div>`;
        return;
    }

    questions = [];
    data.forEach(block => {
        if (block.question) {
            block.question.sort((a, b) => a.order_index - b.order_index).forEach(q => {
                questions.push({
                    ...q,
                    blockTitle: block.title,
                    encouragement: block.encouragement_text
                });
            });
        }
    });

    if (questions.length === 0) {
        document.getElementById('app').innerHTML = `<div style="padding:20px;">此問卷目前沒有題目資料。</div>`;
    } else {
        renderQuestion();
    }
}

// 3. 渲染題目邏輯
function renderQuestion() {
    const q = questions[currentIndex];
    const app = document.getElementById('app');
    currentAnswer = null; // 重設答案
    
    app.innerHTML = `
        <div class="survey-container">
            <div class="progress-container">
                <div class="progress-bar" style="width: ${(currentIndex / questions.length * 100)}%"></div>
            </div>
            <div class="progress-text">進度：${currentIndex + 1} / ${questions.length}</div>
            
            <div class="question-box">
                <div class="block-tag">${q.blockTitle || ''}</div>
                <div class="question-text">${q.question_text}</div>
                <div id="options-container">
                    ${renderOptions(q)}
                </div>
                <div class="nav-section">
                    <button class="next-btn" id="nextBtn">下一題</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('nextBtn').onclick = handleNext;
}

function renderOptions(q) {
    if (q.question_type === 'radio' && Array.isArray(q.options)) {
        return q.options.map((opt, i) => `
            <div class="opt-item" onclick="window.selectOption(this, '${opt}')">
                <span class="opt-label">${String.fromCharCode(65 + i)}</span>
                <span class="opt-text">${opt}</span>
            </div>
        `).join('');
    }
    return `<input type="text" class="text-input" id="textAns" placeholder="請輸入答案">`;
}

// --- [新增] 下一題邏輯 (包含簡易存檔) ---
async function handleNext() {
    const q = questions[currentIndex];
    let finalAnswer = currentAnswer;

    // 如果是填充題，抓取 input 的值
    if (q.question_type !== 'radio') {
        const input = document.getElementById('textAns');
        finalAnswer = input ? input.value : null;
    }

    // 存入 response 表
    if (respondentId) {
        await supabase.from('response').insert([{
            respondent_id: respondentId,
            question_id: q.id,
            answer_value: finalAnswer
        }]);
    }

    currentIndex++;
    if (currentIndex < questions.length) {
        renderQuestion();
    } else {
        // 完成問卷，更新 respondent 狀態
        await supabase.from('respondent').update({ abandoned: false }).eq('id', respondentId);
        document.getElementById('app').innerHTML = `<div class="finish-card"><h2>感謝您的填答！</h2><p>您的資料已成功送出。</p></div>`;
    }
}

// 啟動流程
(async () => {
    await initRespondent();
    await fetchQuestions();
})();