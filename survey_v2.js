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
let questionStartTime = null;

// --- 全域工具函數 (供 HTML 標籤直接調用) ---

window.adjustFontSize = (delta) => {
    const currentSize = parseFloat(window.getComputedStyle(document.body).fontSize);
    document.body.style.fontSize = (currentSize + delta) + "px";
};

window.selectOption = (el, val) => {
    document.querySelectorAll('.opt-item').forEach(item => item.classList.remove('selected'));
    el.classList.add('selected');
    currentAnswer = val; 
};

// 語音朗讀邏輯
window.speak = (rate) => {
    const text = questions[currentIndex].question_text;
    const msg = new SpeechSynthesisUtterance(text);
    msg.lang = 'zh-TW';
    msg.rate = rate; // 1.0 為正常, 0.7 為慢速
    window.speechSynthesis.cancel(); // 停止目前的朗讀
    window.speechSynthesis.speak(msg);
    
    // 更新點讀次數
    if (respondentId) {
        supabase.rpc('increment_tts', { rid: respondentId }).then(({error}) => {
            if (error) console.error("TTS 紀錄失敗", error);
        });
    }
};

window.goBack = () => {
    if (currentIndex > 0) {
        currentIndex--;
        renderQuestion();
    }
};

// --- 核心邏輯 ---

async function initRespondent() {
    const { data } = await supabase.from('respondent').insert([{ 
        questionnaire_id: QUESTIONNAIRE_ID,
        device_type: window.innerWidth < 768 ? 'mobile' : 'desktop',
        start_time: new Date().toISOString(),
        abandoned: true,
        tts_count: 0 
    }]).select();
    if (data) respondentId = data[0].id;
}

async function fetchQuestions() {
    const { data } = await supabase.from('question_block').select(`
        title, question ( id, question_text, question_type, options, order_index )
    `).eq('questionnaire_id', QUESTIONNAIRE_ID).order('order_index', { ascending: true });

    if (!data) return;
    questions = [];
    data.forEach(block => {
        block.question.sort((a,b) => a.order_index - b.order_index).forEach(q => {
            questions.push({ ...q, blockTitle: block.title });
        });
    });
    if (questions.length > 0) renderQuestion();
}

function renderQuestion() {
    const q = questions[currentIndex];
    const app = document.getElementById('app');
    currentAnswer = null;
    questionStartTime = Date.now();
    
    app.innerHTML = `
        <div class="survey-container">
            <div class="progress-container">
                <div class="progress-bar" style="width: ${(currentIndex / questions.length * 100)}%"></div>
            </div>
            <div class="progress-text">進度：${currentIndex + 1} / ${questions.length}</div>
            
            <div class="question-box">
                <div class="block-tag">${q.blockTitle || ''}</div>
                
                <div class="audio-section">
                    <button class="audio-btn" onclick="window.speak(1.0)">🔊 正常語音</button>
                    <button class="audio-btn" onclick="window.speak(0.7)">🐌 慢速語音</button>
                </div>

                <div class="question-text">${q.question_text}</div>
                <div id="options-container">${renderOptions(q)}</div>
                
                <div class="nav-section">
                    ${currentIndex > 0 ? `<button class="control-btn" onclick="window.goBack()">返回</button>` : ''}
                    <button class="next-btn" id="nextBtn">${currentIndex === questions.length - 1 ? '送出問卷' : '下一題'}</button>
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
    return `<div class="input-container"><input type="text" class="text-input" id="textAns" placeholder="請填寫..." autocomplete="off"></div>`;
}

async function handleNext() {
    let finalAnswer = currentAnswer;
    const textInput = document.getElementById('textAns');
    if (textInput) finalAnswer = textInput.value.trim();

    if (!finalAnswer) { alert("請填寫答案後再繼續"); return; }

    if (respondentId) {
        await supabase.from('response').insert([{
            respondent_id: respondentId,
            question_id: questions[currentIndex].id,
            answer_value: String(finalAnswer),
            reaction_time_sec: Math.round((Date.now() - questionStartTime) / 1000) 
        }]);
    }

    currentIndex++;
    if (currentIndex < questions.length) {
        renderQuestion();
    } else {
        await supabase.from('respondent').update({ abandoned: false, end_time: new Date().toISOString() }).eq('id', respondentId);
        document.getElementById('app').innerHTML = `<div class="finish-card"><h2>感謝您的填答！</h2><p>數據已成功送出。</p></div>`;
    }
}

(async () => {
    await initRespondent();
    await fetchQuestions();
})();