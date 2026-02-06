import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabase = createClient(
    "https://mbdatbwrralhlkhyhxlr.supabase.co", 
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iZGF0YndycmFsaGxraHloeGxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNjg2OTksImV4cCI6MjA4NTc0NDY5OX0.5kv8UvBRbYfcZGLXdKI_cWtplkN3YT05XC5AUhVtsok"
);

const QUESTIONNAIRE_ID = "db949a8e-95ad-454e-9fa4-050cf9ed238a"; 

let questions = [];
let currentIndex = 0;
let respondentId = null;
let currentAnswer = null; // 用於儲存單選題答案
let questionStartTime = null; // 用於計算反應時間

// --- 全域工具函數 ---

// 字體調整
window.adjustFontSize = (delta) => {
    const body = document.body;
    const currentSize = parseFloat(window.getComputedStyle(body).fontSize);
    body.style.fontSize = (currentSize + delta) + "px";
};

[cite_start]// 選項選取邏輯：確保點擊時能正確儲存答案 [cite: 1]
window.selectOption = (el, val) => {
    // 移除其他選項的選取狀態
    document.querySelectorAll('.opt-item').forEach(item => item.classList.remove('selected'));
    // 標記目前選項
    el.classList.add('selected');
    [cite_start]// 更新暫存答案，這一步沒做 handleNext 就會沒反應 [cite: 1]
    currentAnswer = val; 
};

// --- 核心邏輯 ---

[cite_start]// 1. 初始化受試者 (對齊 respondent 欄位) [cite: 1]
async function initRespondent() {
    const { data, error } = await supabase
        .from('respondent')
        .insert([{ 
            questionnaire_id: QUESTIONNAIRE_ID,
            device_type: window.innerWidth < 768 ? 'mobile' : 'desktop',
            start_time: new Date().toISOString(),
            abandoned: true,
            tts_count: 0 
        }])
        .select();

    if (data && data.length > 0) {
        respondentId = data[0].id;
    } else {
        console.error("無法建立受試者紀錄:", error?.message);
        alert("系統連線異常，請重新整理頁面。");
    }
}

[cite_start]// 2. 抓取題目 (對齊 question_block 與 question 欄位) [cite: 1]
async function fetchQuestions() {
    const { data, error } = await supabase
        .from('question_block')
        .select(`
            id,
            title,
            encouragement_text,
            question (
                id,
                question_text,
                question_type,
                options,
                order_index
            )
        `)
        .eq('questionnaire_id', QUESTIONNAIRE_ID)
        .order('order_index', { ascending: true });

    if (error || !data) {
        console.error("讀取題目失敗:", error?.message);
        return;
    }

    questions = [];
    data.forEach(block => {
        if (block.question) {
            const blockQuestions = block.question.sort((a, b) => a.order_index - b.order_index);
            blockQuestions.forEach(q => {
                questions.push({
                    ...q,
                    blockTitle: block.title,
                    encouragement: block.encouragement_text
                });
            });
        }
    });

    if (questions.length > 0) renderQuestion();
}

[cite_start]// 3. 渲染題目與紀錄開始時間 [cite: 1]
function renderQuestion() {
    const q = questions[currentIndex];
    const app = document.getElementById('app');
    currentAnswer = null; [cite_start]// 每題開始前重置答案 [cite: 1]
    questionStartTime = Date.now(); // 紀錄本題呈現的起始時間
    
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
    return `<div class="input-container"><input type="text" class="text-input" id="textAns" placeholder="請在此輸入答案..." autocomplete="off"></div>`;
}

[cite_start]// 4. 下一題與寫入答案 (對齊 response.answer_value 與 reaction_time_sec) [cite: 1]
async function handleNext() {
    const q = questions[currentIndex];
    let finalAnswer = currentAnswer;
    const reactionTime = (Date.now() - questionStartTime) / 1000; [cite_start]// 計算反應秒數 [cite: 1]

    const textInput = document.getElementById('textAns');
    if (textInput) finalAnswer = textInput.value.trim();

    if (!finalAnswer) {
        alert("請先完成本題再點擊「下一題」喔！");
        return;
    }

    // 禁用按鈕防止重複點擊
    const btn = document.getElementById('nextBtn');
    btn.disabled = true;
    btn.innerText = "儲存中...";

    if (respondentId) {
        [cite_start]// 寫入答案：對齊 Schema 欄位名稱 [cite: 1]
        const { error } = await supabase.from('response').insert([{
            respondent_id: respondentId,
            question_id: q.id,
            answer_value: String(finalAnswer),
            reaction_time_sec: Math.round(reactionTime) 
        }]);
        if (error) console.error("答案儲存失敗:", error.message);
    }

    currentIndex++;
    if (currentIndex < questions.length) {
        renderQuestion();
    } else {
        [cite_start]// 完成問卷：更新完測狀態並寫入 end_time [cite: 1]
        await supabase.from('respondent').update({ 
            abandoned: false,
            end_time: new Date().toISOString() 
        }).eq('id', respondentId);

        document.getElementById('app').innerHTML = `
            <div class="finish-card">
                <h2>感謝您的填答！</h2>
                <p>您的研究數據已成功送出。</p>
            </div>`;
    }
}

[cite_start]// 啟動流程 [cite: 1]
(async () => {
    await initRespondent();
    await fetchQuestions();
})();