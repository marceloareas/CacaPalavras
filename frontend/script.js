const API_URL = "http://localhost:8000/api";
let currentUser = null;
let editandoId = null; 
let gameData = { disciplina: "", assunto: "", dificuldade: "Fácil", perguntas_respostas: [] };
let disciplinasSalvas = [];
let assuntosSalvos = [];

window.onload = async () => {
    const res = await fetch(`${API_URL}/usuarios`);
    const usuarios = await res.json();
    const select = document.getElementById("user-select");
    select.innerHTML = usuarios.map(u => `<option value="${u.id_ludica}">${u.nametag} (${u.tipo_perfil})</option>`).join("");
    
    // Fecha o dropdown se clicar fora
    document.addEventListener("click", (e) => {
        if (!e.target.closest('.input-container')) {
            document.getElementById("dropdown-disciplina").style.display = "none";
            document.getElementById("dropdown-assunto").style.display = "none";
        }
    });
};

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    
    if(id.startsWith('screen-step')) {
        document.getElementById("progress-bar").style.display = "flex";
    } else {
        document.getElementById("progress-bar").style.display = "none";
    }
}

function updateProgressBar(step) {
    document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
    if(step >= 1 && step <= 4) document.getElementById(`step-ind-${step}`).classList.add('active');
}

function login() {
    const select = document.getElementById("user-select");
    currentUser = select.value;
    if (select.options[select.selectedIndex].text.includes("Professor")) {
        showScreen('screen-menu-prof');
    } else {
        alert("Área do aluno ainda em desenvolvimento!");
    }
}

function voltarAoMenu() {
    showScreen('screen-menu-prof');
}

async function iniciarCriacao() {
    editandoId = null;
    gameData = { disciplina: "", assunto: "", dificuldade: "Fácil", perguntas_respostas: [] };
    document.getElementById("input-disciplina").value = "";
    document.getElementById("input-assunto").value = "";
    document.getElementById("select-dificuldade").value = "Fácil";
    atualizarListaPalavrasUI();
    
    const res = await fetch(`${API_URL}/disciplinas`);
    disciplinasSalvas = await res.json();
    
    goToStep(1);
}

// === LOGICA DO DROPDOWN ===
function filtrarDropdown(tipo) {
    const input = document.getElementById(`input-${tipo}`);
    const dropdown = document.getElementById(`dropdown-${tipo}`);
    const termo = input.value.toLowerCase();
    
    const dados = tipo === 'disciplina' ? disciplinasSalvas : assuntosSalvos;
    const filtrados = dados.filter(d => d.toLowerCase().includes(termo));
    
    dropdown.innerHTML = "";
    if (filtrados.length > 0) {
        dropdown.style.display = "block";
        filtrados.forEach(item => {
            const li = document.createElement("li");
            li.className = "list-item autocomplete-item";
            li.innerText = item;
            li.onclick = () => {
                input.value = item;
                dropdown.style.display = "none";
            };
            dropdown.appendChild(li);
        });
    } else {
        dropdown.style.display = "none";
    }
}

async function carregarMeusJogos() {
    const res = await fetch(`${API_URL}/jogos/professor/${currentUser}`);
    const jogos = await res.json();
    const ul = document.getElementById("lista-meus-jogos");
    ul.innerHTML = jogos.map(j => `
        <li class="list-item" style="flex-direction: column; align-items: flex-start; gap: 10px;">
            <div><b>Disciplina:</b> ${j.disciplina} <br><b>Assunto:</b> ${j.assunto} (${j.dificuldade})</div>
            <div style="display: flex; gap: 10px; width: 100%;">
                <button onclick="visualizarJogo(${j.id_jogo})" style="padding: 8px; font-size: 14px;">Visualizar</button>
                <button onclick="editarJogo(${j.id_jogo})" style="padding: 8px; font-size: 14px;">Editar</button>
                <button class="btn-voltar" onclick="deletarJogo(${j.id_jogo})" style="padding: 8px; font-size: 14px;">Excluir</button>
            </div>
        </li>
    `).join("");
    showScreen('screen-meus-jogos');
}

async function deletarJogo(id_jogo) {
    if(confirm("Tem certeza que deseja excluir este caça-palavras?")) {
        await fetch(`${API_URL}/jogos/${id_jogo}`, { method: 'DELETE' });
        carregarMeusJogos();
    }
}

async function visualizarJogo(id_jogo) {
    const res = await fetch(`${API_URL}/jogos/${id_jogo}`);
    if(res.ok) {
        const data = await res.json();
        document.getElementById("preview-title").innerText = `Visualizando: ${data.assunto}`;
        renderizarPreview(data.matriz_letras, data.perguntas_respostas);
        document.getElementById("btn-preview-voltar").onclick = carregarMeusJogos; 
        showScreen('screen-preview');
    }
}

async function editarJogo(id_jogo) {
    const res = await fetch(`${API_URL}/jogos/${id_jogo}`);
    if(res.ok) {
        const data = await res.json();
        editandoId = id_jogo;
        gameData = { 
            disciplina: data.disciplina, 
            assunto: data.assunto, 
            dificuldade: data.dificuldade, 
            perguntas_respostas: data.perguntas_respostas 
        };
        
        document.getElementById("input-disciplina").value = gameData.disciplina;
        document.getElementById("input-assunto").value = gameData.assunto;
        document.getElementById("select-dificuldade").value = gameData.dificuldade;
        atualizarListaPalavrasUI();
        
        const resDisc = await fetch(`${API_URL}/disciplinas`);
        disciplinasSalvas = await resDisc.json();
        
        goToStep(1);
    }
}

async function goToStep(step) {
    if (step === 2) {
        const digitado = document.getElementById("input-disciplina").value.trim();
        if(!digitado) return alert("Por favor, preencha a disciplina.");
        
        // Verifica duplicidade ignorando maiúsculas/minúsculas
        const existente = disciplinasSalvas.find(d => d.toLowerCase() === digitado.toLowerCase());
        
        if (existente && digitado !== existente) {
            alert(`A disciplina "${existente}" já existe no sistema. Ela foi selecionada automaticamente para evitar duplicações.`);
            document.getElementById("input-disciplina").value = existente;
            gameData.disciplina = existente;
        } else {
            gameData.disciplina = existente || digitado;
        }
        
        // Busca assuntos globais da disciplina selecionada
        const res = await fetch(`${API_URL}/assuntos/${encodeURIComponent(gameData.disciplina)}`);
        assuntosSalvos = await res.json();
    }
    
    if (step === 3) {
        const digitadoAssunto = document.getElementById("input-assunto").value.trim();
        if(!digitadoAssunto) return alert("Por favor, preencha o assunto.");

        // Verifica duplicidade de assunto ignorando maiúsculas/minúsculas
        const existenteAssunto = assuntosSalvos.find(a => a.toLowerCase() === digitadoAssunto.toLowerCase());
        
        if (existenteAssunto && digitadoAssunto !== existenteAssunto) {
            alert(`O assunto "${existenteAssunto}" já existe nesta disciplina. Ele foi selecionado automaticamente para evitar duplicações.`);
            document.getElementById("input-assunto").value = existenteAssunto;
            gameData.assunto = existenteAssunto;
        } else {
            gameData.assunto = existenteAssunto || digitadoAssunto;
        }
    }
    
    if (step === 4) {
        gameData.dificuldade = document.getElementById("select-dificuldade").value;
    }

    showScreen(`screen-step${step}`);
    updateProgressBar(step);
}

function atualizarListaPalavrasUI() {
    document.getElementById("word-count").innerText = gameData.perguntas_respostas.length;
    const ul = document.getElementById("lista-palavras");
    ul.innerHTML = "";
    gameData.perguntas_respostas.forEach((pr, index) => {
        const li = document.createElement("li");
        li.className = "list-item";
        li.innerHTML = `
            <span><b>Dica:</b> ${pr.pergunta} <br><b>Resp:</b> ${pr.resposta}</span> 
            <div style="display: flex; gap: 5px;">
                <button onclick="editarPalavra(${index})" style="flex: none; padding: 8px 12px; background-color: #3498db; color: white; border-radius: 10px; box-shadow: none;">✎</button>
                <button onclick="removerPalavra(${index})" style="flex: none; padding: 8px 12px; background-color: #e74c3c; color: white; border-radius: 10px; box-shadow: none;">X</button>
            </div>
        `;
        ul.appendChild(li);
    });
}

function editarPalavra(index) {
    // Joga os dados pro input e remove da lista para re-inserção
    const pr = gameData.perguntas_respostas[index];
    document.getElementById("input-pergunta").value = pr.pergunta;
    document.getElementById("input-resposta").value = pr.resposta;
    removerPalavra(index);
    document.getElementById("input-pergunta").focus();
}

function removerPalavra(index) {
    gameData.perguntas_respostas.splice(index, 1);
    atualizarListaPalavrasUI();
}

function addWord() {
    if (gameData.perguntas_respostas.length >= 25) return alert("Máximo de 25 palavras atingido!");
    
    const pergunta = document.getElementById("input-pergunta").value;
    // Pega a palavra exatamente como o professor digitou (mantendo acentos)
    const resposta = document.getElementById("input-resposta").value.trim();
    
    if (!pergunta || !resposta || resposta.includes(" ")) {
        return alert("Preencha dica e resposta. A resposta deve ser uma palavra única sem espaços.");
    }

    gameData.perguntas_respostas.push({ pergunta, resposta });
    atualizarListaPalavrasUI();
    
    document.getElementById("input-pergunta").value = "";
    document.getElementById("input-resposta").value = "";
    document.getElementById("input-pergunta").focus();
}

async function salvarJogo() {
    if (gameData.perguntas_respostas.length < 10) {
        return alert("O sistema exige no mínimo 10 palavras cadastradas!");
    }
    
    const payload = { id_professor: parseInt(currentUser), ...gameData };
    
    const method = editandoId ? "PUT" : "POST";
    const url = editandoId ? `${API_URL}/jogos/${editandoId}` : `${API_URL}/jogos`;

    const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    if (res.ok) {
        const data = await res.json();
        document.getElementById("preview-title").innerText = "Jogo Salvo com Sucesso!";
        // Chama o renderizador passando a matriz gerada e as dicas originais
        renderizarPreview(data.matriz, gameData.perguntas_respostas);
        document.getElementById("btn-preview-voltar").onclick = voltarAoMenu; 
        showScreen('screen-preview');
    } else {
        const err = await res.json();
        alert("Erro ao salvar: " + err.detail);
    }
}

function renderizarMatriz(matriz) {
    const grid = document.getElementById("matriz-preview");
    grid.innerHTML = "";
    matriz.forEach(linha => {
        linha.forEach(letra => {
            const div = document.createElement("div");
            div.className = "matriz-cell";
            div.innerText = letra;
            grid.appendChild(div);
        });
    });
}

function renderizarPreview(matriz, perguntas_respostas) {
    // Renderiza a grade
    const grid = document.getElementById("matriz-preview");
    grid.innerHTML = "";
    matriz.forEach(linha => {
        linha.forEach(letra => {
            const div = document.createElement("div");
            div.className = "matriz-cell";
            div.innerText = letra;
            grid.appendChild(div);
        });
    }); 

    // Renderiza a lista enumerada de dicas
    const dicasList = document.getElementById("preview-dicas");
    dicasList.innerHTML = perguntas_respostas.map(pr => `<li style="margin-bottom: 10px;">${pr.pergunta}</li>`).join("");
}
    