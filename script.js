// --- CONFIGURAÇÃO ---
let apiKey = "";
const MODEL_NAME = "gemini-flash-latest";

// --- ESTADO ---
let currentCase = null;
let chatHistory = [];
let caseCount = 0;
let allDiseases = [];
let usedDiseases = [];

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
        } else if (apiKey) {
            document.getElementById('api-key-input').value = apiKey;
            switchScreen('start');
        }
    }
}

function clearState() {
    localStorage.removeItem('examsPleaseGameState');
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
    generateNewCase();
}

// --- 2. GERAÇÃO DE CASO (IA) ---

async function getDisease() {
    if (allDiseases.length === 0) {
        try {
            const response = await fetch('doencas.json');
            const text = await response.text();
            allDiseases = text.split(';').map(d => d.trim()).filter(d => d);
        } catch (error) {
            console.error("Failed to load diseases:", error);
            allDiseases = ["Hipertensão Arterial Sistêmica (HAS) Primária", "Doença Arterial Coronariana (DAC) Crônica", "Insuficiência Cardíaca (IC) com Fração de Ejeção Reduzida"];
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
            "patient": { "name": "...", "age": "...", ... },
            "triage": { "chief_complaint": "...", "vitals": "..." },
            "hidden_truth": { ... }
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
}

function initializeChatContext() {
    chatHistory = [
        {
            role: "user",
            parts: [{ text: `SYSTEM INSTRUCTION: ... DADOS OCULTOS (VERDADE): ${JSON.stringify(currentCase.hidden_truth)}` }]
        },
        {
            role: "model",
            parts: [{ text: "Entendido." }]
        }
    ];
}

// --- 3. LOOP DO JOGO ---

async function performAction() {
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

        if (response.length < 200 && !response.match(/exame|resultado|vr/i)) {
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
    // ... (código existente)
    
    // Simulação da submissão
    switchScreen('loading');
    document.getElementById('loading-text').innerText = "AUDITANDO PRONTUÁRIO...";
    // ... (código para chamar a API de avaliação)
    
    // Após a avaliação...
    // const report = await callGeminiAPI(...);
    // document.getElementById('report-content').innerHTML = report;
    switchScreen('report'); // Temporário
    clearState(); // Limpa o estado para o próximo caso
}

function nextCase() {
    clearState();
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

// ... (Restante do código para addRetryLog, fetchWithRetry, callGeminiAPI)

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
    saveState(); // Salva o estado após cada interação
    return text;
}

// ... (O resto do seu código, como fetchWithRetry, callGeminiAPI, etc.)
// Tenha certeza que todas as funções referenciadas (como fetchWithRetry) estão no lugar.
// O código abaixo é um placeholder para as funções que não foram totalmente mostradas no prompt.

async function fetchWithRetry(url, options, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (err) {
            console.warn(`Tentativa ${i+1} falhou: ${err.message}`);
            if (i < retries - 1) {
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
    const data = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return data.candidates[0].content.parts[0].text;
}