import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabase = createClient(
    "https://mbdatbwrralhlkhyhxlr.supabase.co", 
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iZGF0YndycmFsaGxraHloeGxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNjg2OTksImV4cCI6MjA4NTc0NDY5OX0.5kv8UvBRbYfcZGLXdKI_cWtplkN3YT05XC5AUhVtsok"
);

const QUESTIONNAIRE_ID = "db949a8e-95ad-454e-9fa4-050cf9ed238a"; 

let questions = [];
let currentIndex = 0;
let respondentId = null;
let currentAnswer = null;

// 字體調整函數
window.adjustFontSize = (delta) => {
    const body = document.body;
    const currentSize = parseFloat(window.getComputedStyle(body).fontSize);
    body.style.fontSize = (currentSize + delta) + "px";
};

// 選項選取邏輯 (針對 Radio 類型)
window.selectOption = (el, val) => {
    document.querySelectorAll('.opt-item').forEach(item => item.classList.remove('selected'));
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

// 2. 抓取題目
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
        console.error("讀取題目失敗:", error);
        document.getElementById('app').innerHTML = `<div style="padding:20px;">讀取失敗，請確認資料庫設定。</div>`;
        return;
    }

    questions = [];
    data.forEach(block => {
        if (block.question) {
            // 確保區塊內的題目也按順序排好
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
    currentAnswer = null; 
    
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

// 4. 關鍵：根據題型渲染選項
function renderOptions(q) {
    // 只有當題型是 radio 且 options 是陣列時，才渲染按鈕
    if (q.question_type === 'radio' && Array.isArray(q.options) && q.options.length > 0) {
        return q.options.map((opt, i) => `
            <div class="opt-item" onclick="window.selectOption(this, '${opt}')">
                <span class="opt-label">${String.fromCharCode(65 + i)}</span>
                <span class="opt-text">${opt}</span>
            </div>
        `).join('');
    } 
    
    // 其他情況（如 text, textarea 或 question_type 為空）一律顯示文字輸入框
    return `
        <div class="input-container">
            <input type="text" class="text-input" id="textAns" placeholder="請在此輸入答案..." autocomplete="off">
        </div>
    `;
}

// 5. 下一題邏輯
async function handleNext() {
    const q = questions[currentIndex];
    let finalAnswer = currentAnswer;

    // 判斷是否為輸入框題型
    const textInput = document.getElementById('textAns');
    if (textInput) {
        finalAnswer = textInput.value.trim();
        if (!finalAnswer) {
            alert("請輸入內容後再繼續");
            return;
        }
    } else {
        // 如果是選擇題但沒選答案
        if (finalAnswer === null) {
            alert("請選擇一個選項");
            return;
        }
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
        // 完成問卷
        await supabase.from('respondent').update({ abandoned: false }).eq('id', respondentId);
        document.getElementById('app').innerHTML = `
            <div class="finish-card">
                <h2>感謝您的填答！</h2>
                <p>您的資料已成功送出。</p>
            </div>`;
    }
}

// 啟動流程
(async () => {
    await initRespondent();
    await fetchQuestions();
})();