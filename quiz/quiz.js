(() => {
  const $ = (id) => document.getElementById(id);
  let client, participantId = null, campaignId = null, questions = [], index = 0, score = 0, answered = false;
  const say = (message) => { $("status").textContent = message; };
  const show = (id) => $(id).classList.remove("hidden");
  const hide = (id) => $(id).classList.add("hidden");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function initClient() {
    const c = window.GAMES_MNE_CONFIG || {};
    if (!window.supabase || !c.SUPABASE_URL || c.SUPABASE_URL.includes("COLE_AQUI") ||
        !c.SUPABASE_ANON_KEY || c.SUPABASE_ANON_KEY.includes("COLE_AQUI")) {
      throw new Error("Preencha SUPABASE_URL e SUPABASE_ANON_KEY em config.js antes de usar o quiz.");
    }
    client = window.supabase.createClient(c.SUPABASE_URL, c.SUPABASE_ANON_KEY);
  }
  async function start() {
    try {
      if (!client) initClient();
      const name = $("name").value.trim();
      const campaignCode = $("campaign").value.trim();
      if (!name || !campaignCode) throw new Error("Informe seu nome e o código da campanha.");
      say("Localizando campanha…");
      const {data: campaign, error: ce} = await client.from("mne_quiz_campaigns")
        .select("id,title,is_open").eq("code", campaignCode).eq("is_open", true).maybeSingle();
      if (ce) throw ce;
      if (!campaign) throw new Error("Campanha não encontrada ou ainda não está aberta.");
      campaignId = campaign.id;
      const {data: participant, error: pe} = await client.rpc("mne_quiz_register", {
        p_campaign_id: campaignId, p_display_name: name
      });
      if (pe) throw pe;
      participantId = participant;
      const {data: qs, error: qe} = await client.from("mne_quiz_public_questions")
        .select("id,prompt,question_type,options,position")
        .eq("campaign_id", campaignId).eq("is_published", true).order("position");
      if (qe) throw qe;
      questions = qs || [];
      if (!questions.length) throw new Error("Ainda não há perguntas publicadas para esta campanha.");
      index = 0; score = 0;
      hide("setup-panel"); hide("result-panel"); show("quiz-panel");
      renderQuestion(); await refreshRanking(); say("Você está participando do quiz.");
    } catch (e) { say(e.message || "Não foi possível iniciar. Confira a configuração e tente novamente."); }
  }
  function renderQuestion() {
    answered = false;
    const q = questions[index];
    $("progress").textContent = `Pergunta ${index + 1} de ${questions.length}`;
    $("score").textContent = `Pontos: ${score}`;
    $("question").textContent = q.prompt;
    $("feedback").textContent = "";
    $("options").innerHTML = "";
    hide("next");
    let options = q.options;
    if (!Array.isArray(options)) options = Object.entries(options || {}).map(([key,value]) => ({key,label:value}));
    options.forEach((opt) => {
      const key = typeof opt === "string" ? opt : (opt.key ?? opt.value ?? opt.label);
      const label = typeof opt === "string" ? opt : (opt.label ?? opt.text ?? opt.value ?? opt.key);
      const b = document.createElement("button");
      b.className = "option"; b.textContent = label; b.addEventListener("click", () => submitAnswer(key,b));
      $("options").appendChild(b);
    });
  }
  async function submitAnswer(key, button) {
    if (answered) return;
    answered = true;
    [...$("options").querySelectorAll("button")].forEach(b => b.disabled = true);
    try {
      const {data, error} = await client.rpc("mne_quiz_submit_answer", {
        p_campaign_id: campaignId, p_participant_id: participantId,
        p_question_id: questions[index].id, p_answer: String(key)
      });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      if (result && result.is_correct) { score += Number(result.points_awarded || 0); $("feedback").textContent = "Resposta registrada. Você acertou!"; }
      else $("feedback").textContent = "Resposta registrada.";
      $("score").textContent = `Pontos: ${score}`;
      show("next"); await refreshRanking();
    } catch (e) {
      answered = false;
      [...$("options").querySelectorAll("button")].forEach(b => b.disabled = false);
      $("feedback").textContent = "Não foi possível registrar a resposta. Tente novamente.";
      say(e.message || "Erro ao enviar resposta.");
    }
  }
  async function next() {
    if (index + 1 < questions.length) { index++; renderQuestion(); }
    else {
      hide("quiz-panel"); show("result-panel");
      $("final-message").textContent = `Obrigado por participar. Pontuação nesta sessão: ${score}.`;
      await refreshRanking(); say("Quiz concluído.");
    }
  }
  async function refreshRanking() {
    try {
      if (!client) initClient();
      const {data, error} = await client.from("mne_quiz_leaderboard")
        .select("display_name,total_points,updated_at").order("total_points",{ascending:false}).order("updated_at",{ascending:true}).limit(20);
      if (error) throw error;
      $("ranking").innerHTML = "";
      (data || []).forEach((row) => {
        const li = document.createElement("li");
        li.textContent = `${row.display_name} — ${row.total_points} pontos`;
        $("ranking").appendChild(li);
      });
      if (!data || !data.length) $("ranking").innerHTML = "<li>O ranking aparecerá após a primeira participação.</li>";
    } catch (e) { /* ranking indisponível até configurar URL/chave e executar a migration */ }
  }
  document.addEventListener("DOMContentLoaded", () => {
    $("start").addEventListener("click", start);
    $("next").addEventListener("click", next);
    $("restart").addEventListener("click", () => { hide("result-panel"); show("setup-panel"); });
    $("refresh-ranking").addEventListener("click", refreshRanking);
    try { initClient(); refreshRanking(); } catch(e) { say(e.message); }
  });
})();
