// --- CONFIGURAÇÃO ---
    let apiKey = "";
    const MODEL_NAME = "gemini-flash-latest"; 
    
    // --- ESTADO ---
    let currentCase = null; 
    let chatHistory = [];   
    let caseCount = 0;

    // --- ELEMENTOS ---
    const screens = {
        start: document.getElementById('start-screen'),
        loading: document.getElementById('loading-screen'),
        game: document.getElementById('game-screen'),
        report: document.getElementById('report-screen')
    };

    // --- 1. INICIALIZAÇÃO ---

    function switchScreen(name) {
        Object.values(screens).forEach(s => s.classList.remove('active'));
        screens[name].classList.add('active');
    }

    function startShift() {
        const inputKey = document.getElementById('api-key-input').value.trim();
        if(!inputKey) {
            alert("Insira a chave API.");
            return;
        }
        apiKey = inputKey;
        generateNewCase();
    }

    // --- 2. GERAÇÃO DE CASO (IA) ---

    async function generateNewCase() {
        switchScreen('loading');
        caseCount++;
        document.getElementById('case-id').innerText = `#${String(caseCount).padStart(3, '0')}`;
        document.getElementById('loading-text').innerText = "ADMITINDO PACIENTE...";
        
        chatHistory = [];
        document.getElementById('log-area').innerHTML = "";
        document.getElementById('patient-dialogue').innerText = "...";
        document.getElementById('input-action').value = "";
        document.getElementById('input-justification').value = "";
        
        document.getElementById('final-diag').value = "";
        document.getElementById('final-just').value = "";
        document.getElementById('final-conduta').value = "";
        
        closeDiagModal();

        // Prompt REFORMULADO para máxima criatividade e inclusão de casos variados
        const prompt = `
            Atue como um gerador de casos clínicos para simulação médica.
            
            BANCO DE IDEIAS (POOL) - Escolha UMA patologia aleatoriamente:
            - COTIDIANO (UBS): Hipertensão (Crise ou Descontrole), DM2 (Cetoacidose ou Pé diabético), Infecção Urinária (Cistite ou Pielonefrite), Gastroenterite Viral, Dengue (com ou sem sinais de alarme), Lombalgia Mecânica, Dermatite de Contato, Ansiedade Generalizada.
            - CARDIO/RESP: Insuficiência Cardíaca (ICFER), Fibrilação Atrial, Asma (Crise), DPOC Exacerbado, Pneumonia Comunitária, Pneumotórax Espontâneo, TEP (Tromboembolismo Pulmonar).
            - ABDOME/CIRURGIA: Apendicite Aguda, Colecistite, Pancreatite, Obstrução Intestinal, Diverticulite, Hérnia Inguinal Encarcerada.
            - NEURO: Cefaleia Tensional, Enxaqueca, AVC (Isquêmico ou Hemorrágico), VPPB (Labirintite), Meningite Viral/Bacteriana.
            - INFECTO/PARASITO: Tuberculose Pulmonar, Sífilis Secundária, Leptospirose, Malária (importada ou não), Hanseníase, Escabiose, COVID-19.
            - TRAUMA/EXTERNO: Entorse de Tornozelo, Fratura de Rádio Distal, Queimadura de 2º Grau, TCE Leve (Concussão).
            - RAROS/ZEBRAS: Síndrome de Guillain-Barré, Doença de Kawasaki, Púrpura de Henoch-Schönlein, Botulismo, Feocromocitoma, Lúpus (LES).

            ESTRUTURA JSON OBRIGATÓRIA:
            {
                "patient": {
                    "name": "Nome Completo", "age": "Idade", "gender": "Gênero", "job": "Profissão",
                    "visual_appearance": "Descrição visual (ex: dispneico, corado, emagrecido)",
                    "personality": "Personalidade (ex: teimoso, prolixo, assustado, hostil)"
                },
                "triage": {
                    "chief_complaint": "Queixa Principal (em linguagem leiga)",
                    "vitals": "PA, FC, FR, Temp, SatO2, Destro (se necessário)"
                },
                "hidden_truth": {
                    "history_hpi": "HDA detalhada (termos médicos)",
                    "history_social": "Histórico Social/Familiar/Hábitos",
                    "physical_exam": "Exame Físico completo (dados positivos e negativos pertinentes)",
                    "labs_and_imaging": "Resultados de exames esperados para este caso (se houver indicação)",
                    "diagnosis": "Diagnóstico Definitivo",
                    "pathophysiology": "Fisiopatologia resumida"
                }
            }
            Retorne APENAS o JSON, sem markdown.
        `;

        try {
            const result = await callGeminiAPI(prompt, true); 
            const cleanJson = result.replace(/```json/g, '').replace(/```/g, '').trim();
            currentCase = JSON.parse(cleanJson);
            
            setupGameUI();
            switchScreen('game');
            initializeChatContext();

        } catch (e) {
            console.error(e);
            alert("Erro crítico ao gerar caso: " + e.message + ". Tentando novamente...");
            setTimeout(() => { if(confirm("Tentar gerar novamente?")) generateNewCase(); }, 1000);
        }
    }

    function setupGameUI() {
        const p = currentCase.patient;
        const t = currentCase.triage;
        
        document.getElementById('doc-patient-info').innerHTML = `<strong>Nome:</strong> ${p.name}<br><strong>Idade:</strong> ${p.age} | <strong>Ocup:</strong> ${p.job}`;
        document.getElementById('doc-vitals').innerHTML = `<strong>QP:</strong> "${t.chief_complaint}"<br><strong>Sinais:</strong> ${t.vitals}`;
        document.getElementById('patient-dialogue').innerText = `"${t.chief_complaint}"`;
    }

    function initializeChatContext() {
        chatHistory = [
            {
                role: "user",
                parts: [{ text: `
                    SYSTEM INSTRUCTION:
                    Você é o motor de um simulador médico "Papers, Please". Duas personas:
                    
                    1. O PACIENTE (${currentCase.patient.name}): 
                       - Personalidade: '${currentCase.patient.personality}'.
                       - Linguagem leiga. Não usa termos médicos.
                       - Não revele o diagnóstico, apenas sintomas.

                    2. O SISTEMA DE EXAMES / NARRADOR TÉCNICO:
                       - ATIVADO QUANDO: O usuário pede exame, sinal vital, ou faz ação física (ex: "Palpar abdome").
                       - REGRA DE OURO: SEJA EXTREMAMENTE CONCISO E TELEGRÁFICO.
                       - MÁXIMO 1-2 LINHAS. Use abreviações médicas padrão.
                       - IMPORTANTE: Para EXAMES DE SANGUE/LABORATORIAIS, você DEVE fornecer valores de referência (VR) abreviados ao lado dos resultados alterados ou relevantes. 
                         Ex: "Hb 10.2 (VR 12-16), Leuc 18k (VR 4-10k), Plaq 150k (VR 150-450k)".
                       - Se o dado não existir no JSON oculto, invente um resultado compatível com o quadro.

                    DADOS OCULTOS (VERDADE): ${JSON.stringify(currentCase.hidden_truth)}
                `}]
            },
            {
                role: "model",
                parts: [{ text: "Entendido. Serei breve e sempre incluirei VR em exames laboratoriais." }]
            }
        ];
    }

    // --- 3. LOOP DO JOGO ---

    async function performAction() {
        const btn = document.getElementById('btn-exec');
        const action = document.getElementById('input-action').value;
        const just = document.getElementById('input-justification').value;

        if(!action || !just) {
            alert("Preencha a Ação e a Justificativa.");
            return;
        }

        btn.disabled = true;
        btn.innerText = "PROCESSANDO...";
        addLog(`AÇÃO: ${action}`, 'user');
        addLog(`JUSTIF: ${just}`, 'sys');
        
        document.getElementById('input-action').value = '';
        document.getElementById('input-justification').value = '';
        document.getElementById('patient-dialogue').innerHTML = '<span style="color:#ffff00">...</span>';

        const userMessage = `Ação do Médico: "${action}". Justificativa: "${just}".`;
        
        try {
            const response = await callGeminiChat(userMessage);
            addLog(response, 'sys');
            
            if (response.length < 200 && !response.match(/exame|resultado|hba1c|leuc|hemograma|tórax|abdome|vr|referência/i)) {
                 document.getElementById('patient-dialogue').innerText = `"${response}"`;
            } else {
                 document.getElementById('patient-dialogue').innerText = "(Analisando prontuário...)";
            }

        } catch (e) {
            addLog(`ERRO FINAL: ${e.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.innerText = "EXECUTAR";
        }
    }

    // --- 4. AVALIAÇÃO FINAL ---

    function openDiagModal() { document.getElementById('diag-modal').style.display = 'block'; }
    function closeDiagModal() { document.getElementById('diag-modal').style.display = 'none'; }

    async function submitCase() {
        const diag = document.getElementById('final-diag').value;
        const just = document.getElementById('final-just').value;
        const cond = document.getElementById('final-conduta').value;

        if(!diag || !just || !cond) { 
            alert("Por favor, preencha todos os campos do prontuário final."); 
            return; 
        }

        switchScreen('loading');
        document.getElementById('loading-text').innerText = "AUDITANDO PRONTUÁRIO...";

        const evaluationPrompt = `
            AVALIAÇÃO FINAL (AUDITORIA MÉDICA).
            
            GABARITO REAL (HIDDEN TRUTH): ${JSON.stringify(currentCase.hidden_truth)}
            
            RESPOSTA DO ALUNO: 
            - Hipótese Diagnóstica: "${diag}"
            - Justificativa do Raciocínio: "${just}"
            - Conduta Terapêutica: "${cond}"
            
            HISTÓRICO DE AÇÕES E PERGUNTAS: ${JSON.stringify(chatHistory.slice(2))}
            
            TAREFA:
            Atue como um Professor de Medicina rigoroso. Gere um relatório HTML estruturado (dentro de uma <div>).
            
            SEÇÕES OBRIGATÓRIAS:
            1. 🏥 VEREDITO: O diagnóstico está correto? (Sim/Não/Parcialmente). A conduta salva ou mata?
            2. 🧠 ANÁLISE DO RACIOCÍNIO: A justificativa do aluno faz sentido com os sintomas? Ele correlacionou anatomia/fisiologia corretamente?
            3. 💰 CUSTO-EFETIVIDADE: O aluno pediu exames desnecessários no chat? (Critique gastos excessivos, alinhado com a eficiência do SUS).
            4. 🔬 CORRELAÇÃO ACADÊMICA (Obrigatório): Explique o caso usando:
               - Anatomia (Onde?)
               - Fisiopatologia (O que ocorreu?)
               - Semiologia (Sinais chaves perdidos ou achados)
            
            NOTA FINAL (0 a 10).
            
            Estilo: Use emojis, <b>negrito</b> para destaques, e <ul> para listas. Texto direto e educativo.
        `;

        try {
            const report = await callGeminiAPI(evaluationPrompt, false);
            const cleanReport = report.replace(/```html/g, '').replace(/```/g, '');
            document.getElementById('report-content').innerHTML = cleanReport;
            switchScreen('report');
        } catch (e) {
            alert("Erro na auditoria. Tente novamente.");
            switchScreen('game');
        }
    }

    function nextCase() { generateNewCase(); }

    // --- HELPERS (LOG & API) ---

    function addLog(text, type) {
        const div = document.createElement('div');
        div.className = type === 'user' ? 'log-user' : (type === 'error' ? 'log-error' : 'log-sys');
        div.innerText = text;
        const area = document.getElementById('log-area');
        area.appendChild(div);
        area.scrollTop = area.scrollHeight;
    }

    function addRetryLog(attempt) {
        const div = document.createElement('div');
        div.className = 'log-retry';
        div.innerText = `... Falha na conexão. Retentativa ${attempt}/3 ...`;
        const area = document.getElementById('log-area');
        area.appendChild(div);
        area.scrollTop = area.scrollHeight;
    }

    async function fetchWithRetry(url, options, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url, options);
                
                if (response.status === 400) {
                    const errText = await response.text();
                    console.error("API 400 Error:", errText);
                    throw new Error("HTTP 400: Bad Request (Possible JSON Mode mismatch)");
                }

                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return await response.json();
            } catch (err) {
                if (err.message.includes("400")) throw err;

                console.warn(`Tentativa ${i+1} falhou: ${err.message}`);
                if (i < retries - 1) {
                    addRetryLog(i + 1);
                    await new Promise(res => setTimeout(res, 1000 * Math.pow(2, i)));
                } else {
                    throw err; 
                }
            }
        }
    }

    async function callGeminiAPI(prompt, isJsonMode) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
        
        let body = { contents: [{ parts: [{ text: prompt }] }] };
        
        if(isJsonMode) {
            body.generationConfig = { responseMimeType: "application/json" };
        }

        try {
            const data = await fetchWithRetry(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            return data.candidates[0].content.parts[0].text;
        } catch (error) {
            if (isJsonMode && error.message.includes("400")) {
                console.warn("JSON Mode falhou com alias 'latest'. Tentando modo texto simples...");
                
                delete body.generationConfig;
                
                const fallbackResponse = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });

                if(!fallbackResponse.ok) throw new Error("Falha no Fallback: " + fallbackResponse.status);
                const fallbackData = await fallbackResponse.json();
                return fallbackData.candidates[0].content.parts[0].text;
            }
            throw error;
        }
    }

    async function callGeminiChat(newMessage) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
        
        chatHistory.push({ role: "user", parts: [{ text: newMessage }] });
        const body = { contents: chatHistory };

        const data = await fetchWithRetry(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const text = data.candidates[0].content.parts[0].text;
        chatHistory.push({ role: "model", parts: [{ text: text }] });
        return text;
    }
