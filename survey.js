import { createClient } from
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

/* ===============================
   Supabase init
================================ */
const supabase = createClient(
  "https://mbdatbwrralhlkhyhxlr.supabase.co",
  "❗請放你的 anon public JWT（不是 sb_publishable）"
);

const QUESTIONNAIRE_ID = "請貼上 questionnaire.id UUID";

const app = document.getElementById("app");

let respondentId = null;
let blocks = [];
let currentBlockIndex = 0;
let currentQuestionIndex = 0;
let questions = [];
let questionStartTime = null;

/* ===============================
   Step 1：建立 respondent
================================ */
async function createRespondent() {
  const { data, error } = await supabase
    .from("respondent")
    .insert({
      questionnaire_id: QUESTIONNAIRE_ID,
      start_time: new Date().toISOString(),
      device_type: "tablet"
    })
    .select()
    .single();

  if (error) {
    console.error(error);
    app.innerHTML = "❌ 無法建立填答者";
    return;
  }

  respondentId = data.id;
  console.log("✅ respondent 建立成功:", respondentId);
  loadBlocks();
}

/* ===============================
   Step 2：抓 blocks
================================ */
async function loadBlocks() {
  const { data, error } = await supabase
    .from("question_block")
    .select("*")
    .eq("questionnaire_id", QUESTIONNAIRE_ID)
    .order("order_index");

  if (error || data.length === 0) {
    console.error(error);
    app.innerHTML = "❌ 無法載入問卷區塊";
    return;
  }

  blocks = data;
  loadQuestions(blocks[0].id);
}

/* ===============================
   Step 3：抓 questions
================================ */
async function loadQuestions(blockId) {
  const { data, error } = await supabase
    .from("question")
    .select("*")
    .eq("block_id", blockId)
    .order("order_index");

  if (error || data.length === 0) {
    console.error(error);
    app.innerHTML = "❌ 此區塊沒有題目";
    return;
  }

  questions = data;
  currentQuestionIndex = 0;
  renderQuestion();
}

/* ===============================
   Step 4：顯示單題
================================ */
function renderQuestion() {
  const q = questions[currentQuestionIndex];
  questionStartTime = Date.now();

  app.innerHTML = `
    <h2>${q.question_text}</h2>
    <div id="options">
      ${q.options.map(opt => `
        <button class="optBtn">${opt}</button>
      `).join("")}
    </div>
  `;

  document.querySelectorAll(".optBtn").forEach(btn => {
    btn.onclick = () => submitAnswer(btn.innerText);
  });
}

/* ===============================
   Step 5：送出答案（含反應時間）
================================ */
async function submitAnswer(answer) {
  const reactionTimeSec =
    Math.round((Date.now() - questionStartTime) / 1000);

  const q = questions[currentQuestionIndex];

  await supabase.from("response").insert({
    respondent_id: respondentId,
    question_id: q.id,
    answer_value: q.value_map[answer],
    reaction_time_sec: reactionTimeSec
  });

  currentQuestionIndex++;

  if (currentQuestionIndex < questions.length) {
    renderQuestion();
  } else {
    currentBlockIndex++;
    if (currentBlockIndex < blocks.length) {
      alert(blocks[currentBlockIndex - 1].encouragement_text || "請繼續");
      loadQuestions(blocks[currentBlockIndex].id);
    } else {
      app.innerHTML = "✅ 問卷完成，感謝填寫";
    }
  }
}

/* ===============================
   啟動
================================ */
createRespondent();


