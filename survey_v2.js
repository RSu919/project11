import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabase = createClient("https://mbdatbwrralhlkhyhxlr.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iZGF0YndycmFsaGxraHloeGxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNjg2OTksImV4cCI6MjA4NTc0NDY5OX0.5kv8UvBRbYfcZGLXdKI_cWtplkN3YT05XC5AUhVtsok");
const QUESTIONNAIRE_ID = "db949a8e-95ad-454e-9fa4-050cf9ed238a";

// --- 研究行為紀錄狀態 ---
let respondentId = null;
let behaviorData = {
  font_scale_count: 0,
  back_button_count: 0,
  speech_log: [] // 紀錄朗讀行為
};

// --- 初始化填答者 (加入裝置與行為追蹤) ---
async function initRespondent() {
  const isTablet = window.innerWidth >= 768 && window.innerWidth <= 1024;
  const { data, error } = await supabase
    .from("respondent")
    .insert({
      questionnaire_id: QUESTIONNAIRE_ID,
      start_time: new Date().toISOString(),
      device_type: isTablet ? "tablet" : "mobile", // 紀錄裝置類型 
      abandoned: true // 預設為 true，完成後才改 false 
    })
    .select().single();

  if (!error) respondentId = data.id;
}

// --- 行為紀錄函式 (研究 UI/UX 用) ---
async function logAction(type, targetId = null, metadata = {}) {
  // 同步到行為紀錄表，供後續分析 
  await supabase.from("action_log").insert({
    respondent_id: respondentId,
    action_type: type, // 如 'speech_normal', 'speech_slow', 'font_enlarge'
    target_id: targetId,
    metadata: metadata,
    created_at: new Date().toISOString()
  });
}

// --- 語音功能 (支援正常與龜速) ---
window.playAudio = (text, rate = 1.0, qId) => {
  window.speechSynthesis.cancel(); // 停止目前的播放
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'zh-TW';
  utter.rate = rate; // 1.0 正常, 0.5 龜速 
  window.speechSynthesis.speak(utter);

  // 紀錄朗讀行為 
  logAction(rate < 1.0 ? 'speech_slow' : 'speech_normal', qId);
};

// --- 字體縮放控制 ---
window.adjustFontSize = (delta) => {
  behaviorData.font_scale_count++;
  const root = document.documentElement;
  const currentSize = parseInt(getComputedStyle(root).getPropertyValue('--base-size') || 18);
  root.style.setProperty('--base-size', (currentSize + delta) + 'px');
  
  logAction('font_scale', null, { newSize: currentSize + delta }); // 紀錄字體調整行為 
};

// --- 區塊切換與獎勵邏輯 ---
function checkBlockEnd(block) {
  if (isLastPageOfBlock) {
    alert(block.encouragement_text || "您做得很好，請繼續下一階段！"); // 顯示獎勵詞 [cite: 2]
    // 進入下一區塊...
  }
}
