// --- CONFIGURAÇÃO ---
let apiKey = "";
const MODEL_NAME = "gemini-flash-latest";

// --- AUDIO ---
const themeMusic = new Audio('effects/theme.mp3');
themeMusic.loop = true;
const concluirSound = new Audio('effects/concluir.mp3');
const executarSound = new Audio('effects/executar.mp3');
const proximoSound = new Audio('effects/proximo.mp3');
const printerSound = new Audio('effects/printer.mp3');
const answerSound = new Audio('effects/answer.mp3');

// --- ESTADO ---
let currentCase = null;
let chatHistory = [];
let caseCount = 0;
let allDiseases = [];
let usedDiseases = [];
let databaseName = "PADRÃO (REPOSITÓRIO)";
let testMode = false;

// --- ELEMENTOS ---
const screens = {
    start: document.getElementById('start-screen'),
    loading: document.getElementById('loading-screen'),
    game: document.getElementById('game-screen'),
    report: document.getElementById('report-screen')
};

// --- 0. INICIALIZAÇÃO E ESTADO ---
window.addEventListener('DOMContentLoaded', loadState);

function saveState() {
    if (!apiKey) return;
    const gameState = {
        apiKey,
        currentCase,
        chatHistory,
        caseCount,
        usedDiseases,
        allDiseases,
        databaseName,
    };
    localStorage.setItem('examsPleaseGameState', JSON.stringify(gameState));
}

function loadState() {
    const savedState = localStorage.getItem('examsPleaseGameState');
    if (savedState) {
        const gameState = JSON.parse(savedState);
        apiKey = gameState.apiKey || "";
        currentCase = gameState.currentCase || null;
        chatHistory = gameState.chatHistory || [];
        caseCount = gameState.caseCount || 0;
        usedDiseases = gameState.usedDiseases || [];
        allDiseases = gameState.allDiseases || [];
        databaseName = gameState.databaseName || "PADRÃO (REPOSITÓRIO)";

        if (databaseName !== "PADRÃO (REPOSITÓRIO)") {
            updateDBUI(databaseName);
        }

        if (apiKey && currentCase) {
            document.getElementById('api-key-input').value = apiKey;
            document.getElementById('case-id').innerText = `#${String(caseCount).padStart(3, '0')}`;

            setupGameUI();

            document.getElementById('log-area').innerHTML = "";
            chatHistory.slice(2).forEach(entry => {
                if (entry.role === 'user') {
                    const text = entry.parts[0].text;
                    const actionMatch = text.match(/Ação do Médico: "([^"]*)"/);
                    const justMatch = text.match(/Justificativa: "([^"]*)"/);
                    if (actionMatch && justMatch) {
                        addLog(`AÇÃO: ${actionMatch[1]}`, 'user');
                        addLog(`JUSTIF: ${justMatch[1]}`, 'sys');
                    } else {
                        addLog(text, 'user');
                    }
                } else {
                    addLog(entry.parts[0].text, 'sys');
                }
            });

            switchScreen('game');
            themeMusic.play();
        } else if (apiKey) {
            document.getElementById('api-key-input').value = apiKey;
            switchScreen('start');
        }
    }
}

function clearState() {
    localStorage.removeItem('examsPleaseGameState');
}

// --- BANCO DE DADOS CUSTOMIZADO ---

document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('db-file-input');
    if (fileInput) {
        fileInput.addEventListener('change', handleFileUpload);
    }
});

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const content = e.target.result;
        try {
            let diseases = [];
            if (file.name.endsWith('.json')) {
                const json = JSON.parse(content);
                if (Array.isArray(json)) {
                    diseases = json;
                } else {
                    throw new Error("Formato JSON inválido. Deve ser um array de strings.");
                }
            } else {
                // Assume formato ponto-e-vírgula
                diseases = content.split(';').map(d => d.trim()).filter(d => d);
            }

            if (diseases.length === 0) {
                throw new Error("O arquivo está vazio ou não contém doenças válidas.");
            }

            allDiseases = diseases;
            usedDiseases = [];
            databaseName = file.name;
            updateDBUI(databaseName);
            saveState();
            alert(`Banco de dados carregado: ${file.name} (${diseases.length} doenças)`);
        } catch (error) {
            console.error("Erro ao carregar banco:", error);
            alert("Erro ao processar arquivo: " + error.message);
        }
    };
    reader.readAsText(file);
}

function updateDBUI(name) {
    const btnText = document.getElementById('file-btn-text');
    const statusText = document.getElementById('db-filename');
    const resetLink = document.getElementById('reset-db');

    if (name === "PADRÃO (REPOSITÓRIO)") {
        btnText.innerText = "USAR BANCO PADRÃO (REPOSITÓRIO)";
        statusText.innerText = "Nenhum arquivo customizado selecionado.";
        resetLink.style.display = "none";
    } else {
        btnText.innerText = `BANCO: ${name}`;
        statusText.innerText = `Arquivo carregado: ${name}`;
        resetLink.style.display = "block";
    }
}

function resetDefaultDB() {
    allDiseases = [];
    usedDiseases = [];
    databaseName = "PADRÃO (REPOSITÓRIO)";
    document.getElementById('db-file-input').value = "";
    updateDBUI(databaseName);
    saveState();
    alert("Voltando para o banco de dados padrão.");
}

// --- 1. FLUXO PRINCIPAL ---

function switchScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
}

function startShift() {
    const inputKey = document.getElementById('api-key-input').value.trim();
    if (!inputKey) {
        alert("Insira a chave API.");
        return;
    }
    apiKey = inputKey;
    saveState();
    themeMusic.play();
    generateNewCase();
}

function startTestShift() {
    testMode = true;
    apiKey = "MOCK_KEY";
    saveState();
    themeMusic.play();
    generateNewCase();
}

function backToLogin() {
    if (confirm("Deseja realmente sair do plantão? O progresso do caso atual será perdido.")) {
        clearState();
        themeMusic.pause();
        themeMusic.currentTime = 0;
        switchScreen('start');
    }
}

// --- 2. GERAÇÃO DE CASO (IA) ---

async function getDisease() {
    if (allDiseases.length === 0) {
        try {
            const response = await fetch('doencas.json');
            const text = await response.text();
            allDiseases = text.split(';').map(d => d.trim()).filter(d => d);
            databaseName = "PADRÃO (REPOSITÓRIO)";
        } catch (error) {
            console.error("Failed to load diseases:", error);
            allDiseases = ["Hipertensão Arterial Sistêmica (HAS) Primária", "Doença Arterial Coronariana (DAC) Crônica", "Insuficiência Cardíaca (IC) com Fração de Ejeção Reduzida"];
            databaseName = "LISTA DE EMERGÊNCIA (ERRO DE CARGA)";
        }
    }

    if (usedDiseases.length === allDiseases.length) {
        usedDiseases = [];
    }

    let availableDiseases = allDiseases.filter(d => !usedDiseases.includes(d));
    if (availableDiseases.length === 0) {
        usedDiseases = [];
        availableDiseases = allDiseases;
    }
    const randomIndex = Math.floor(Math.random() * availableDiseases.length);
    const disease = availableDiseases[randomIndex];
    usedDiseases.push(disease);
    return disease;
}

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

    const disease = await getDisease();

    const prompt = `
            Atue como um gerador de casos clínicos para simulação médica.
            
            PATOLOGIA DESIGNADA PARA ESTE CASO:
            ${disease}

            Crie um caso clínico baseado nesta patologia.

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

        initializeChatContext();
        setupGameUI();
        switchScreen('game');
        saveState();

    } catch (e) {
        console.error(e);
        alert("Erro crítico ao gerar caso: " + e.message + ". Tentando novamente...");
        setTimeout(() => { if (confirm("Tentar gerar novamente?")) generateNewCase(); }, 1000);
    }
}

function setupGameUI() {
    if (!currentCase) return;
    const p = currentCase.patient;
    const t = currentCase.triage;
    document.getElementById('doc-patient-info').innerHTML = `<strong>Nome:</strong> ${p.name}<br><strong>Idade:</strong> ${p.age} | <strong>Ocup:</strong> ${p.job}`;
    document.getElementById('doc-vitals').innerHTML = `<strong>QP:</strong> "${t.chief_complaint}"<br><strong>Sinais:</strong> ${t.vitals}`;
    document.getElementById('patient-dialogue').innerText = `"${t.chief_complaint}"`;
    document.getElementById('db-info').innerText = `BANCO: ${databaseName}`;
}

function initializeChatContext() {
    chatHistory = [
        {
            role: "user",
            parts: [{
                text: `
                SYSTEM INSTRUCTION:
                Você é o motor de um simulador médico "Exams, Please". Duas personas:
                
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
    executarSound.play();
    const btn = document.getElementById('btn-exec');
    const action = document.getElementById('input-action').value;
    const just = document.getElementById('input-justification').value;

    if (!action || !just) {
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

        if (response.length < 200 && !response.match(/exame|resultado|vr|referência/i)) {
            document.getElementById('patient-dialogue').innerText = `"${response}"`;
        } else {
            document.getElementById('patient-dialogue').innerText = "(Analisando prontuário...)";
        }
        answerSound.play();

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
    concluirSound.play();
    const diag = document.getElementById('final-diag').value;
    const just = document.getElementById('final-just').value;
    const cond = document.getElementById('final-conduta').value;

    if (!diag || !just || !cond) {
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
        printerSound.play();
        switchScreen('report');
        themeMusic.pause();
        themeMusic.currentTime = 0;
        clearState();
    } catch (e) {
        alert("Erro na auditoria. Tente novamente.");
        switchScreen('game');
    }
}


function nextCase() {
    proximoSound.play();
    clearState();
    themeMusic.play();
    generateNewCase();
}

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

            console.warn(`Tentativa ${i + 1} falhou: ${err.message}`);
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

    if (isJsonMode) {
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
        if (testMode) {
            console.log("Mocking JSON Mode Response");
            return JSON.stringify({
                "patient": {
                    "name": "João Teste", "age": "45", "gender": "Masculino", "job": "Desenvolvedor",
                    "visual_appearance": "Calmo, olhando para o teto.",
                    "personality": "Colaborativo mas objetivo."
                },
                "triage": {
                    "chief_complaint": "Dor no peito ao codar",
                    "vitals": "PA 120/80, FC 70, FR 16, Temp 36.5, SatO2 98%"
                },
                "hidden_truth": {
                    "history_hpi": "Paciente refere dor torácica tipo pontada.",
                    "history_social": "Sedentário, toma muito café.",
                    "physical_exam": "Ausculta normal, sem sinais de instabilidade.",
                    "labs_and_imaging": "ECG normal, Troponina negativa.",
                    "diagnosis": "Dermatite de Contato (Mock)",
                    "pathophysiology": "Irritação local por contato com teclado antigo."
                }
            });
        }
        if (isJsonMode && error.message.includes("400")) {
            console.warn("JSON Mode falhou com alias 'latest'. Tentando modo texto simples...");

            delete body.generationConfig;

            const fallbackResponse = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!fallbackResponse.ok) throw new Error("Falha no Fallback: " + fallbackResponse.status);
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

    if (testMode) {
        return "Este é um resultado de exame simulado (MODO TESTE). Tudo parece normal no momento.";
    }

    const text = data.candidates[0].content.parts[0].text;
    chatHistory.push({ role: "model", parts: [{ text: text }] });
    saveState(); // Salva o estado após cada interação
    return text;
}

// --- DRAGGABLE MODAL ---
function dragElement(elmnt) {
  var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  const header = document.getElementById(elmnt.id + "-header");
  if (header) {
    // if present, the header is where you move the DIV from:
    header.onmousedown = dragMouseDown;
  } else {
    // otherwise, move the DIV from anywhere inside the DIV:
    elmnt.onmousedown = dragMouseDown;
  }

  function dragMouseDown(e) {
    e = e || window.event;
    e.preventDefault();
    
    // Fix: Convert initial CSS centering (top:50%, left:50%, transform:translate) 
    // to actual pixel values before the first drag begins.
    const style = window.getComputedStyle(elmnt);
    if (style.transform !== "none") {
        const rect = elmnt.getBoundingClientRect();
        // Use offsetParent because top/left are relative to it
        const parentRect = elmnt.offsetParent ? elmnt.offsetParent.getBoundingClientRect() : {top:0, left:0};
        elmnt.style.top = (rect.top - parentRect.top) + "px";
        elmnt.style.left = (rect.left - parentRect.left) + "px";
        elmnt.style.transform = "none";
        elmnt.style.position = "absolute"; // Ensure it's absolute for movement
    }

    // get the mouse cursor position at startup:
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    // call a function whenever the cursor moves:
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();
    // calculate the new cursor position:
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    // set the element's new position:
    elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
    elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
    elmnt.style.transform = "none";
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

// --- PROFESSOR CHAT ---
async function askProfessor() {
    const input = document.getElementById('input-prof');
    const text = input.value.trim();
    if (!text) return;

    addProfChatMessage(text, 'user');
    input.value = '';

    const profPrompt = `
        Aja como um Professor de Medicina experiente, rigoroso mas didático. 
        O aluno recebeu uma auditoria e quer tirar dúvidas.
        DADOS DO CASO:
        - Diagnóstico: ${currentCase.hidden_truth.diagnostico}
        - Fisiopatologia: ${currentCase.hidden_truth.fisiopatologia}
        - Conduta: ${currentCase.hidden_truth.conduta}
        DÚVIDA DO ALUNO: "${text}"
        Responda como o Professor em no máximo 2 parágrafos.
    `;

    try {
        const typingDiv = addProfChatMessage("O professor está escrevendo...", 'prof');
        const response = await callGeminiAPI(profPrompt, false);
        typingDiv.remove();
        addProfChatMessage(response, 'prof');
    } catch (e) {
        addProfChatMessage("Erro ao contatar o professor. Tente novamente.", 'prof');
    }
}

function addProfChatMessage(text, role) {
    const log = document.getElementById('chat-prof-log');
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    div.innerText = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
}

// Initializing
function initExamsDraggables() {
    const diagModal = document.getElementById("diag-modal");
    if (diagModal) dragElement(diagModal);

    const profInput = document.getElementById('input-prof');
    if (profInput) {
        profInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') askProfessor();
        });
    }
}

if (document.readyState === 'loading') {
    window.addEventListener('load', initExamsDraggables);
} else {
    initExamsDraggables();
}