(() => {
  const $ = id => document.getElementById(id);
  let db = null, campaigns = [], selectedCampaignId = null;
  const statusText = {draft:"Rascunho", published:"Publicado", closed:"Encerrado", archived:"Arquivado"};
  const say = (id, msg, kind="") => { const el=$(id); el.textContent=msg; el.className="message "+kind; };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const slug = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,65);
  function client() {
    const c=window.GAMES_MNE_CONFIG||{};
    if(!window.supabase||!c.SUPABASE_URL||!c.SUPABASE_ANON_KEY) throw new Error("Configuração do Supabase não encontrada em quiz/config.js.");
    db=window.supabase.createClient(c.SUPABASE_URL,c.SUPABASE_ANON_KEY);
  }
  async function requireAdmin(user) {
    const {data,error}=await db.from("mne_quiz_admins").select("user_id").eq("user_id",user.id).maybeSingle();
    if(error) throw error;
    if(!data) { await db.auth.signOut(); throw new Error("Este usuário não está autorizado como administrador."); }
  }
  async function showSession(session) {
    if(!session){$("login-panel").classList.remove("hidden");$("admin-panel").classList.add("hidden");return;}
    try {
      await requireAdmin(session.user);
      $("login-panel").classList.add("hidden");$("admin-panel").classList.remove("hidden");
      await loadCampaigns();
    } catch(e) { $("login-panel").classList.remove("hidden"); $("admin-panel").classList.add("hidden"); say("login-message",e.message||"Falha ao validar administrador.","error"); }
  }
  async function loadCampaigns() {
    say("admin-message","Carregando campanhas…");
    const {data,error}=await db.from("mne_quiz_campaigns").select("*").order("created_at",{ascending:false});
    if(error) throw error;
    campaigns=data||[];
    $("campaign-list").innerHTML="";
    if(!campaigns.length) $("campaign-list").innerHTML='<p class="muted">Nenhuma campanha criada. Use o formulário acima.</p>';
    campaigns.forEach(c=>{
      const el=document.createElement("article");el.className="campaign";
      el.innerHTML=`<div><h3>${esc(c.title)}</h3><p><b>Código:</b> ${esc(c.code)}</p><p>${esc(c.description||"Sem descrição")}</p><p><span class="pill ${esc(c.status)}">${esc(statusText[c.status]||c.status)}</span> · ${Number(c.seconds_per_question)||20}s por pergunta</p></div>
      <div class="campaign-actions">
      <button data-action="select" data-id="${c.id}">Perguntas</button>
      <button class="secondary" data-action="edit" data-id="${c.id}">Editar</button>
      <button class="secondary" data-action="duplicate" data-id="${c.id}">Duplicar</button>
      ${c.status==="published"?`<button class="secondary" data-action="close" data-id="${c.id}">Encerrar</button>`:`<button data-action="publish" data-id="${c.id}">Publicar</button>`}
      ${c.status!=="archived"?`<button class="secondary" data-action="archive" data-id="${c.id}">Arquivar</button>`:""}
      <button class="danger" data-action="delete" data-id="${c.id}">Excluir</button>
      </div>`;
      $("campaign-list").appendChild(el);
    });
    const select=$("question-campaign");select.innerHTML='<option value="">Selecione uma campanha</option>';
    campaigns.filter(c=>c.status!=="archived").forEach(c=>{const o=document.createElement("option");o.value=c.id;o.textContent=`${c.title} (${statusText[c.status]||c.status})`;select.appendChild(o);});
    if(selectedCampaignId && campaigns.some(c=>c.id===selectedCampaignId)) select.value=selectedCampaignId;
    await loadQuestions();
    say("admin-message","Campanhas carregadas.","success");
  }
  function clearCampaign(){$("campaign-form").reset();$("campaign-id").value="";$("seconds").value=20;$("campaign-form-title").textContent="Nova campanha";}
  async function saveCampaign(e){
    e.preventDefault();
    try {
      const id=$("campaign-id").value;
      const row={title:$("campaign-title").value.trim(),code:$("campaign-code").value.trim(),description:$("campaign-description").value.trim(),seconds_per_question:Number($("seconds").value)||20,updated_at:new Date().toISOString()};
      if(!row.title||!row.code) throw new Error("Informe título e código.");
      const result=id?await db.from("mne_quiz_campaigns").update(row).eq("id",id):await db.from("mne_quiz_campaigns").insert({...row,status:"draft"});
      if(result.error) throw result.error;
      clearCampaign(); await loadCampaigns(); say("admin-message","Campanha salva.","success");
    }catch(e){say("admin-message",e.message||"Não foi possível salvar a campanha.","error");}
  }
  function updateAnswerOptions(){
    const truth=$("question-type").value==="true_false";
    $("mc-options").classList.toggle("hidden",truth);
    const sel=$("correct-answer"), previous=sel.value;
    sel.innerHTML="";
    const vals=truth?[["true","Verdadeiro"],["false","Falso"]]:[["A","Alternativa A"],["B","Alternativa B"],["C","Alternativa C"],["D","Alternativa D"]];
    vals.forEach(([v,label])=>{const o=document.createElement("option");o.value=v;o.textContent=label;sel.appendChild(o);});
    if(vals.some(v=>v[0]===previous))sel.value=previous;
  }
  function clearQuestion(){$("question-form").reset();$("question-id").value="";$("points").value=10;$("position").value=1;$("question-published").checked=false;updateAnswerOptions();}
  async function saveQuestion(e){
    e.preventDefault();
    try {
      const id=$("question-id").value, campaign_id=$("question-campaign").value, question_type=$("question-type").value;
      if(!campaign_id) throw new Error("Selecione a campanha da pergunta.");
      const prompt=$("question-prompt").value.trim(); if(!prompt) throw new Error("Digite o enunciado.");
      let options, correct_answer=$("correct-answer").value;
      if(question_type==="true_false") options=[{key:"true",label:"Verdadeiro"},{key:"false",label:"Falso"}];
      else {
        const inputs=[["A","option-a"],["B","option-b"],["C","option-c"],["D","option-d"]];
        options=inputs.map(([key,id])=>({key,label:$(id).value.trim()})).filter(o=>o.label);
        if(options.length<2) throw new Error("Informe pelo menos duas alternativas.");
        if(!options.some(o=>o.key===correct_answer)) throw new Error("A resposta correta precisa corresponder a uma alternativa preenchida.");
      }
      const row={campaign_id,prompt,question_type,options,correct_answer,points:Number($("points").value)||0,position:Math.max(1,Number($("position").value)||1),is_published:$("question-published").checked,updated_at:new Date().toISOString()};
      const result=id?await db.from("mne_quiz_questions").update(row).eq("id",id):await db.from("mne_quiz_questions").insert(row);
      if(result.error) throw result.error;
      selectedCampaignId=campaign_id; clearQuestion(); await loadQuestions(); say("admin-message","Pergunta salva.","success");
    }catch(e){say("admin-message",e.message||"Não foi possível salvar a pergunta.","error");}
  }
  async function loadQuestions(){
    const cid=$("question-campaign").value||selectedCampaignId;
    if(!cid){$("question-list").innerHTML='<p class="muted">Selecione uma campanha.</p>';return;}
    selectedCampaignId=cid;
    const {data,error}=await db.from("mne_quiz_questions").select("*").eq("campaign_id",cid).order("position");
    if(error){$("question-list").innerHTML=`<p class="message error">${esc(error.message)}</p>`;return;}
    $("question-list").innerHTML="";
    if(!data?.length){$("question-list").innerHTML='<p class="muted">Ainda não há perguntas nesta campanha.</p>';return;}
    data.forEach(q=>{
      const el=document.createElement("div");el.className="question-row";
      el.innerHTML=`<div><p><b>${q.position}. ${esc(q.prompt)}</b></p><small>${q.question_type==="true_false"?"Verdadeiro ou falso":"Múltipla escolha"} · ${q.points} pontos · ${q.is_published?"Publicada":"Rascunho"}</small></div><div class="actions"><button class="secondary" data-qaction="edit" data-id="${q.id}">Editar</button><button class="danger" data-qaction="delete" data-id="${q.id}">Excluir</button></div>`;
      $("question-list").appendChild(el);
    });
  }
  async function campaignAction(action,id){
    const c=campaigns.find(x=>x.id===id);if(!c)return;
    try{
      if(action==="select"){$("question-campaign").value=id;selectedCampaignId=id;await loadQuestions();return;}
      if(action==="edit"){$("campaign-id").value=c.id;$("campaign-title").value=c.title;$("campaign-code").value=c.code;$("campaign-description").value=c.description||"";$("seconds").value=c.seconds_per_question||20;$("campaign-form-title").textContent="Editar campanha";window.scrollTo({top:0,behavior:"smooth"});return;}
      if(action==="publish"){
        const {count,error}=await db.from("mne_quiz_questions").select("id",{count:"exact",head:true}).eq("campaign_id",id).eq("is_published",true);
        if(error)throw error;if(!count)throw new Error("Publique pelo menos uma pergunta antes de publicar a campanha.");
        if(!confirm("Publicar esta campanha e disponibilizá-la aos participantes?"))return;
        const r=await db.from("mne_quiz_campaigns").update({status:"published"}).eq("id",id);if(r.error)throw r.error;
      } else if(action==="close"||action==="archive"){
        const status=action==="close"?"closed":"archived";
        if(!confirm(`${action==="close"?"Encerrar":"Arquivar"} a campanha "${c.title}"?`))return;
        const r=await db.from("mne_quiz_campaigns").update({status}).eq("id",id);if(r.error)throw r.error;
      } else if(action==="duplicate"){
        const codeBase=slug(c.code||c.title).slice(0,55)+"-COPIA";
        const code=codeBase+"-"+Math.random().toString(36).slice(2,6).toUpperCase();
        const r=await db.from("mne_quiz_campaigns").insert({title:c.title+" (cópia)",code,description:c.description||"",status:"draft",seconds_per_question:c.seconds_per_question||20}).select().single();
        if(r.error)throw r.error;
        const {data:qs,error:qe}=await db.from("mne_quiz_questions").select("*").eq("campaign_id",id);
        if(qe)throw qe;
        if(qs?.length){
          const copied=qs.map(q=>({campaign_id:r.data.id,prompt:q.prompt,question_type:q.question_type,options:q.options,correct_answer:q.correct_answer,points:q.points,position:q.position,is_published:false}));
          const ins=await db.from("mne_quiz_questions").insert(copied);if(ins.error)throw ins.error;
        }
      } else if(action==="delete"){
        if(!confirm(`Excluir permanentemente "${c.title}" e os dados de participantes/respostas vinculados? Esta ação não pode ser desfeita.`))return;
        const r=await db.from("mne_quiz_campaigns").delete().eq("id",id);if(r.error)throw r.error;
        if(selectedCampaignId===id)selectedCampaignId=null;
      }
      await loadCampaigns();say("admin-message","Ação concluída.","success");
    }catch(e){say("admin-message",e.message||"Não foi possível executar a ação.","error");}
  }
  async function questionAction(action,id){
    try{
      const {data:q,error}=await db.from("mne_quiz_questions").select("*").eq("id",id).single();if(error)throw error;
      if(action==="delete"){
        if(!confirm("Excluir esta pergunta e as respostas registradas para ela?"))return;
        const r=await db.from("mne_quiz_questions").delete().eq("id",id);if(r.error)throw r.error;await loadQuestions();return;
      }
      $("question-id").value=q.id;$("question-campaign").value=q.campaign_id;$("question-prompt").value=q.prompt;$("question-type").value=q.question_type;updateAnswerOptions();
      $("option-a").value="";$("option-b").value="";$("option-c").value="";$("option-d").value="";
      if(q.question_type==="true_false") $("correct-answer").value=q.correct_answer;
      else {const opts=Array.isArray(q.options)?q.options:[];opts.forEach(o=>{const key=String(o.key||"").toLowerCase();if(["a","b","c","d"].includes(key))$("option-"+key).value=o.label||o.text||"";});$("correct-answer").value=q.correct_answer;}
      $("points").value=q.points;$("position").value=q.position;$("question-published").checked=!!q.is_published;
      window.scrollTo({top:document.querySelector("#question-form").getBoundingClientRect().top+window.scrollY-20,behavior:"smooth"});
    }catch(e){say("admin-message",e.message||"Não foi possível abrir a pergunta.","error");}
  }
  document.addEventListener("DOMContentLoaded",()=>{
    try{client();}catch(e){say("login-message",e.message,"error");return;}
    $("login-form").addEventListener("submit",async e=>{
      e.preventDefault();say("login-message","Validando acesso…");
      const {data,error}=await db.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});
      if(error){say("login-message",error.message,"error");return;}
      await showSession(data.session);
    });
    $("logout").addEventListener("click",async()=>{await db.auth.signOut();await showSession(null);});
    $("campaign-form").addEventListener("submit",saveCampaign);
    $("question-form").addEventListener("submit",saveQuestion);
    $("question-type").addEventListener("change",updateAnswerOptions);
    $("correct-answer").addEventListener("focus",updateAnswerOptions);
    $("question-campaign").addEventListener("change",loadQuestions);
    $("cancel-campaign").addEventListener("click",clearCampaign);
    $("cancel-question").addEventListener("click",clearQuestion);
    $("reload").addEventListener("click",()=>loadCampaigns().catch(e=>say("admin-message",e.message,"error")));
    $("campaign-list").addEventListener("click",e=>{const b=e.target.closest("button[data-action]");if(b)campaignAction(b.dataset.action,b.dataset.id);});
    $("question-list").addEventListener("click",e=>{const b=e.target.closest("button[data-qaction]");if(b)questionAction(b.dataset.qaction,b.dataset.id);});
    updateAnswerOptions();
    db.auth.getSession().then(({data})=>showSession(data.session));
    db.auth.onAuthStateChange((_event,session)=>{if(session)showSession(session);});
  });
})();
