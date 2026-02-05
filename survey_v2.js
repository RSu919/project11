import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// --- 初始化 Supabase ---
const supabase = createClient("https://mbdatbwrralhlkhyhxlr.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iZGF0YndycmFsaGxraHloeGxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNjg2OTksImV4cCI6MjA4NTc0NDY5OX0.5kv8UvBRbYfcZGLXdKI_cWtplkN3YT05XC5AUhVtsok");
const QUESTIONNAIRE_ID = "db949a8e-95ad-454e-9fa4-050cf9ed238a";

// --- 全域狀態 ---
let respondentId = null;
let blocks = [];
let allQuestions = [];
let currentBlockIndex = 0;
let currentQuestionIndexInBlock = 0; // 一頁一題的關鍵索引
let answersCache = {}; 
let pageStartTime = null;

const app = document.getElementById("app");

// --- 初始化填答者 (UI 研究紀錄) ---
async function initRespondent() {
    const isTablet = window.innerWidth >= 768 && window.innerWidth <= 1024;
    const { data, error } = await supabase
        .from("respondent")
        .insert({
            questionnaire_id: QUESTIONNAIRE_ID,
            start_time: new Date().toISOString(),
            device_type: isTablet ? "tablet" : "mobile",
            abandoned: true 
        })
        .select().single();

    if (error) return null;
    return data.id;
}

// --- 行為紀錄函式 (UI/UX 分析核心) ---
async function logAction(type, targetId = null, metadata = {}) {
    if (!respondentId) return;
    await supabase.from("action_log").insert({
        respondent_id: respondentId,
        action_type: type,
        target_id: targetId,
        metadata: metadata,
        created_at: new Date().toISOString()
    });
}

// --- 載入資料 ---
async function loadSurveyData() {
    const { data: bData } = await supabase.from("question_block").select("*").eq("questionnaire_id", QUESTIONNAIRE_ID).order("order_index");
    const { data: qData } = await supabase.from("question").select("*").order("order_index");
    
    blocks = bData;
    allQuestions = qData;
    renderPage();
}

// --- 渲染現代化一頁一題介面 ---
function renderPage() {
    const block = blocks[currentBlockIndex];
    const blockQuestions = allQuestions.filter(q => q.block_id === block.id);
    const q = blockQuestions[currentQuestionIndexInBlock];

    if (!q) return;

    // 計算總進度
    const totalQ = allQuestions.length;
    const currentQCount = allQuestions.indexOf(q) + 1;
    const progressPercent = (currentQCount / totalQ) * 100;

    pageStartTime = Date.now();

    app.innerHTML = `
        <div class="survey-container">
            <div class="progress-container">
                <div class="progress-bar" style="width: ${progressPercent}%"></div>
            </div>
            <div class="progress-text">題目 ${currentQCount} / ${totalQ}</div>

            <div class="question-box">
                <div class="block-tag">${block.block_name}</div>
                <h2 class="question-text">${q.question_text}</h2>
                
                <div class="audio-section">
                    <button class="audio-btn" onclick="window.playAudio('${q.question_text.replace(/'/g, "\\'")}', 1.0, '${q.id}')">🔊 正常語速</button>
                    <button class="audio-btn slow" onclick="window.playAudio('${q.question_text.replace(/'/g, "\\'")}', 0.5, '${q.id}')">🐢 龜速朗讀</button>
                </div>

                <div class="options-list">
                    ${q.options.map((opt, idx) => `
                        <div class="opt-item ${answersCache[q.id] === opt ? 'selected' : ''}" 
                             onclick="window.selectOption('${q.id}', '${opt}')">
                            <span class="opt-label">${String.fromCharCode(65 + idx)}</span>
                            <span class="opt-text">${opt}</span>
                        </div>
                    `).join("")}
                </div>
            </div>

            <div class="nav-section">
                <button class="next-btn" onclick="window.nextPage()">
                    ${(currentBlockIndex === blocks.length - 1 && currentQuestionIndexInBlock === blockQuestions.length - 1) ? '提交問卷' : '下一題'}
                </button>
            </div>
        </div>
    `;
}

// --- 視窗全域函數 ---
window.selectOption = (qId, opt) => {
    answersCache[qId] = opt;
    renderPage(); // 立即更新選中狀態
};

window.playAudio = (text, rate = 1.0, qId) => {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-TW';
    utter.rate = rate;
    window.speechSynthesis.speak(utter);
    logAction(rate < 1.0 ? 'speech_slow' : 'speech_normal', qId);
};

window.adjustFontSize = (delta) => {
    const root = document.documentElement;
    const currentSize = parseInt(getComputedStyle(root).getPropertyValue('--base-size') || 18);
    root.style.setProperty('--base-size', (currentSize + delta) + 'px');
    logAction('font_scale', null, { size: currentSize + delta });
};

window.nextPage = async () => {
    const block = blocks[currentBlockIndex];
    const blockQuestions = allQuestions.filter(q => q.block_id === block.id);
    const q = blockQuestions[currentQuestionIndexInBlock];

    if (!answersCache[q.id]) {
        alert("請選擇一個選項再繼續");
        return;
    }

    // 紀錄答案與反應時間
    const reactionTime = Math.round((Date.now() - pageStartTime) / 1000);
    await supabase.from("response").insert({
        respondent_id: respondentId,
        question_id: q.id,
        answer_value: answersCache[q.id],
        reaction_time_sec: reactionTime
    });

    // 翻頁邏輯
    if (currentQuestionIndexInBlock < blockQuestions.length - 1) {
        currentQuestionIndexInBlock++;
        renderPage();
    } else {
        // 區塊結束獎勵
        if (block.encouragement_text) alert(block.encouragement_text);
        
        if (currentBlockIndex < blocks.length - 1) {
            currentBlockIndex++;
            currentQuestionIndexInBlock = 0;
            renderPage();
        } else {
            completeSurvey();
        }
    }
};

async function completeSurvey() {
    await supabase.from("respondent").update({ abandoned: false, end_time: new Date().toISOString() }).eq("id", respondentId);
    app.innerHTML = `
        <div class="finish-card">
            <h2>🎉 問卷已完成</h2>
            <p>感謝您的參與，您的回饋對研究非常有幫助。</p>
        </div>
    `;
}

// --- 啟動 ---
(async () => {
    respondentId = await initRespondent();
    if (respondentId) loadSurveyData();
})();