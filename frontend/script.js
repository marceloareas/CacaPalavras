const API_URL = "http://localhost:8000/api";
let currentUser = null;
let editandoId = null; 
let gameData = { disciplina: "", assunto: "", dificuldade: "Fácil", perguntas_respostas: [] };
let disciplinasSalvas = [];
let assuntosSalvos = [];

// Limites do jogo. Devem ser iguais ao CONFIG do backend (backend/main.py).
const LIMITES = { "Fácil": 15, "Médio": 20, "Difícil": 25 };
const MAX_LETRAS = 15;
let parEmEdicao = null; // índice do par que está sendo editado (null = cadastrando um novo)

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
    // a tela de visualização precisa de mais largura (dicas + grade)
    document.querySelector(".container").classList.toggle("wide", id === "screen-preview");
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
    cancelarEdicao(); 
    
    const res = await fetch(`${API_URL}/disciplinas`);
    disciplinasSalvas = await res.json();
    
    renderizarListaExistentes('disciplina', disciplinasSalvas);
    goToStep(1);
}

// === LOGICA DO DROPDOWN ===
function filtrarDropdown(tipo) {
    const input = document.getElementById(`input-${tipo}`);
    const dropdown = document.getElementById(`dropdown-${tipo}`);
    const termo = input.value.toLowerCase().trim();
    
    const dados = tipo === 'disciplina' ? disciplinasSalvas : assuntosSalvos;
    
    // só exibe o balão de sugestão se houver texto digitado e encontrar semelhanças
    if (termo.length > 0) {
        const filtrados = dados.filter(d => d.toLowerCase().includes(termo));
        dropdown.innerHTML = "";
        
        if (filtrados.length > 0) {
            dropdown.style.display = "block";
            filtrados.forEach(item => {
                const li = document.createElement("li");
                li.className = "sugestao-item";
                li.innerText = item;
                li.onclick = () => {
                    input.value = item;
                    dropdown.style.display = "none";
                    if (tipo === 'disciplina') goToStep(2);
                    if (tipo === 'assunto') goToStep(3);
                };
                dropdown.appendChild(li);
            });
        } else {
            dropdown.style.display = "none";
        }
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
        mostrarPreview(data.matriz_letras, data.perguntas_respostas, data.dificuldade);
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
        cancelarEdicao(); 
        
        const resDisc = await fetch(`${API_URL}/disciplinas`);
        disciplinasSalvas = await resDisc.json();
        
        renderizarListaExistentes('disciplina', disciplinasSalvas);
        goToStep(1);
    }
}

function renderizarListaExistentes(tipo, dados) {
    const container = document.getElementById(`${tipo}s-existentes-container`);
    const lista = document.getElementById(`lista-${tipo}s-existentes`);
    lista.innerHTML = "";

    if (dados && dados.length > 0) {
        container.style.display = "block";
        dados.forEach(item => {
            const li = document.createElement("li");
            
            // USANDO A CLASSE SUGESTAO-ITEM PARA TER O MESMO VISUAL E HOVER DO DROPDOWN
            li.className = "sugestao-item"; 
            li.innerText = item;
            
            li.onclick = () => {
                document.getElementById(`input-${tipo}`).value = item;
                // avançar automaticamente após selecionar
                if (tipo === 'disciplina') goToStep(2);
                if (tipo === 'assunto') goToStep(3);
            };
            lista.appendChild(li);
        });
    } else {
        container.style.display = "none";
    }
}

async function goToStep(step) {
    if (step === 2) {
        const digitado = document.getElementById("input-disciplina").value.trim();
        if(!digitado) return alert("Por favor, preencha a disciplina.");
        
        const existente = disciplinasSalvas.find(d => d.toLowerCase() === digitado.toLowerCase());
        
        if (existente && digitado !== existente) {
            document.getElementById("input-disciplina").value = existente;
            gameData.disciplina = existente;
        } else {
            gameData.disciplina = existente || digitado;
        }
        
        const res = await fetch(`${API_URL}/assuntos/${encodeURIComponent(gameData.disciplina)}`);
        assuntosSalvos = await res.json();
        
        renderizarListaExistentes('assunto', assuntosSalvos);
    }
    
    if (step === 3) {
        const digitadoAssunto = document.getElementById("input-assunto").value.trim();
        if(!digitadoAssunto) return alert("Por favor, preencha o assunto.");

        const existenteAssunto = assuntosSalvos.find(a => a.toLowerCase() === digitadoAssunto.toLowerCase());
        
        if (existenteAssunto && digitadoAssunto !== existenteAssunto) {
            document.getElementById("input-assunto").value = existenteAssunto;
            gameData.assunto = existenteAssunto;
        } else {
            gameData.assunto = existenteAssunto || digitadoAssunto;
        }
    }
    
    if (step === 4) {
        gameData.dificuldade = document.getElementById("select-dificuldade").value;
        atualizarListaPalavrasUI(); // atualiza o limite mostrado na tela
        
        // aviso (para troca de dificuldade de uma dificuldade maior que permitia mais palavras)
        const max = LIMITES[gameData.dificuldade];
        const qtdAtual = gameData.perguntas_respostas.length;
        
        if (qtdAtual > max) {
            const excesso = qtdAtual - max;
            alert(`ATENÇÃO: A dificuldade ${gameData.dificuldade} permite no máximo ${max} palavras, mas seu jogo atual tem ${qtdAtual}.\n\nPara conseguir salvar, você deverá remover ${excesso} palavra(s) da lista ou voltar e aumentar a dificuldade.`);
        }
    }

    showScreen(`screen-step${step}`);
    updateProgressBar(step);

}

function atualizarListaPalavrasUI() {
    const qtdAtual = gameData.perguntas_respostas.length;
    const max = LIMITES[gameData.dificuldade];
    
    const countSpan = document.getElementById("word-count");
    countSpan.innerText = qtdAtual;
    
    // deixa o contador vermelho se estiver com excesso de palavras
    if (qtdAtual > max) {
        countSpan.style.color = "#e74c3c";
    } else {
        countSpan.style.color = "#202020";
    }
    
    document.querySelectorAll(".word-max").forEach(el => el.innerText = max);
    
    const ul = document.getElementById("lista-palavras");
    ul.innerHTML = "";
    gameData.perguntas_respostas.forEach((pr, index) => {
        const li = document.createElement("li");
        li.className = "list-item" + (index === parEmEdicao ? " em-edicao" : "");
        li.innerHTML = `
            <span class="texto-par"><b>Dica:</b> ${pr.pergunta} <br><b>Resp:</b> ${pr.resposta}</span> 
            <div class="list-acoes">
                <button onclick="editarPalavra(${index})" style="flex: none; padding: 8px 12px; background-color: #3498db; color: #f5f5ef; border-radius: 10px; box-shadow: none;">✎</button>
                <button onclick="removerPalavra(${index})" style="flex: none; padding: 8px 12px; background-color: #e74c3c; color: #f5f5ef; border-radius: 10px; box-shadow: none;">X</button>
            </div>
        `;
        ul.appendChild(li);
    });
}

function editarPalavra(index) {
    // O par continua na lista: só é substituído quando o professor confirmar
    const pr = gameData.perguntas_respostas[index];
    parEmEdicao = index;
    document.getElementById("input-pergunta").value = pr.pergunta;
    document.getElementById("input-resposta").value = pr.resposta;
    atualizarListaPalavrasUI(); // destaca o par em edição
    atualizarModoEdicaoUI();
    document.getElementById("input-pergunta").focus();
}

function cancelarEdicao() {
    parEmEdicao = null;
    document.getElementById("input-pergunta").value = "";
    document.getElementById("input-resposta").value = "";
    atualizarListaPalavrasUI();
    atualizarModoEdicaoUI();
}

function atualizarModoEdicaoUI() {
    const editando = parEmEdicao !== null;
    document.getElementById("btn-add-par").innerText = editando ? "Salvar Alteração ✔" : "Adicionar Par (OK) ✔";
    document.getElementById("btn-cancelar-edicao").style.display = editando ? "block" : "none";
}

function removerPalavra(index) {
    if (parEmEdicao !== null) {
        if (index === parEmEdicao) {
            parEmEdicao = null; // o par que estava em edição foi excluído
            document.getElementById("input-pergunta").value = "";
            document.getElementById("input-resposta").value = "";
        } else if (index < parEmEdicao) {
            parEmEdicao--; // a lista andou uma posição
        }
    }
    gameData.perguntas_respostas.splice(index, 1);
    atualizarListaPalavrasUI();
    atualizarModoEdicaoUI();
}

function removerAcentos(texto) {
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function addWord() {
    const max = LIMITES[gameData.dificuldade];
    if (parEmEdicao === null && gameData.perguntas_respostas.length >= max) {
        return alert(`Máximo de ${max} palavras atingido para o nível ${gameData.dificuldade}!`);
    }
    
    const pergunta = document.getElementById("input-pergunta").value;
    // Pega a palavra exatamente como o professor digitou (mantendo acentos)
    const resposta = document.getElementById("input-resposta").value.trim();
    
    if (!pergunta || !resposta || resposta.includes(" ")) {
        return alert("Preencha dica e resposta. A resposta deve ser uma palavra única sem espaços.");
    }
    const semAcento = removerAcentos(resposta);
    if (!/^[A-Za-z]+$/.test(semAcento)) {
        return alert("A resposta deve ter apenas letras (acentos são aceitos), sem números ou símbolos.");
    }
    if (semAcento.length > MAX_LETRAS) {
        return alert(`A resposta deve ter no máximo ${MAX_LETRAS} letras.`);
    }

    if (parEmEdicao !== null) {
        gameData.perguntas_respostas[parEmEdicao] = { pergunta, resposta }; // substitui o par editado
        parEmEdicao = null;
    } else {
        gameData.perguntas_respostas.push({ pergunta, resposta });
    }
    atualizarListaPalavrasUI();
    atualizarModoEdicaoUI();
    
    document.getElementById("input-pergunta").value = "";
    document.getElementById("input-resposta").value = "";
    document.getElementById("input-pergunta").focus();
}

async function salvarJogo() {
    if (gameData.perguntas_respostas.length < 10) {
        return alert("O sistema exige no mínimo 10 palavras cadastradas!");
    }
    const max = LIMITES[gameData.dificuldade];
    if (gameData.perguntas_respostas.length > max) {
        return alert(`O nível ${gameData.dificuldade} permite no máximo ${max} palavras. Remova algumas ou mude a dificuldade.`);
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
        mostrarPreview(data.matriz, gameData.perguntas_respostas, gameData.dificuldade);
        document.getElementById("btn-preview-voltar").onclick = voltarAoMenu; 
        showScreen('screen-preview');
    } else {
        const err = await res.json();
        alert("Erro ao salvar: " + err.detail);
    }
}

// ---------- Visualização do jogo: dicas à esquerda + grade à direita ----------
let previewAtual = null;       // { celulas, ocorrencias } do jogo exibido
let mostrarRespostas = false;  // por padrão, as respostas ficam desligadas

const TAMANHO_CELULA = 32; // px. Igual em todas as dificuldades (o CSS usa o mesmo valor)

// Desenha a grade e devolve as células (matriz de elementos) para podermos colori-las
function renderizarMatriz(matriz) {
    const grid = document.getElementById("matriz-preview");
    grid.innerHTML = "";
    grid.style.gridTemplateColumns = `repeat(${matriz[0].length}, ${TAMANHO_CELULA}px)`; // colunas = largura da matriz
    return matriz.map(linha => linha.map(letra => {
        const div = document.createElement("div");
        div.className = "matriz-cell";
        div.innerText = letra;
        grid.appendChild(div);
        return div;
    }));
}

// Procura a palavra na matriz (mesmas direções que o gerador usa em cada dificuldade).
// A grade só tem letras A-Z, então a resposta é comparada sem acento e em maiúsculas.
// Devolve uma lista de ocorrências; cada ocorrência é uma lista de [linha, coluna].
function localizarPalavra(matriz, palavra, dificuldade) {
    const alvo = removerAcentos(String(palavra)).toUpperCase();
    const linhas = matriz.length, colunas = matriz[0].length;
    const direcoes = [[0, 1], [1, 0]];
    if (dificuldade !== "Fácil") direcoes.push([1, 1], [-1, -1], [0, -1], [-1, 0], [1, -1], [-1, 1]);

    const achadas = [];
    const vistas = new Set(); // evita contar a mesma posição duas vezes (ex.: palíndromos)
    for (let r = 0; r < linhas; r++) {
        for (let c = 0; c < colunas; c++) {
            for (const [dl, dc] of direcoes) {
                const fimL = r + dl * (alvo.length - 1);
                const fimC = c + dc * (alvo.length - 1);
                if (fimL < 0 || fimL >= linhas || fimC < 0 || fimC >= colunas) continue;
                const cels = [];
                let confere = true;
                for (let k = 0; k < alvo.length; k++) {
                    const rr = r + dl * k, cc = c + dc * k;
                    if (matriz[rr][cc] !== alvo[k]) { confere = false; break; }
                    cels.push([rr, cc]);
                }
                if (!confere) continue;
                const chave = cels.map(([a, b]) => a * colunas + b).sort((x, y) => x - y).join(",");
                if (!vistas.has(chave)) { vistas.add(chave); achadas.push(cels); }
            }
        }
    }
    return achadas;
}

function corDoPar(i) {
    return `hsl(${Math.round((i * 137.508) % 360)}, 80%, 82%)`;
}

function mostrarPreview(matriz, perguntas, dificuldade) {
    const celulas = renderizarMatriz(matriz);
    const ocorrencias = perguntas.map(pr => localizarPalavra(matriz, pr.resposta, dificuldade));
    previewAtual = { celulas, ocorrencias };
    mostrarRespostas = false;

    const lista = document.getElementById("lista-perguntas-preview");
    lista.innerHTML = "";
    perguntas.forEach((pr, i) => {
        const li = document.createElement("li");
        const cor = document.createElement("span");
        cor.className = "cor";
        cor.style.backgroundColor = corDoPar(i);
        const corpo = document.createElement("div");
        const pergunta = document.createElement("div");
        pergunta.textContent = `${i + 1}. ${pr.pergunta}`;
        const resposta = document.createElement("div");
        resposta.className = "resposta-par";
        resposta.textContent = pr.resposta + (ocorrencias[i].length ? "" : " (não encontrada na grade)");
        corpo.appendChild(pergunta);
        corpo.appendChild(resposta);
        li.appendChild(cor);
        li.appendChild(corpo);
        lista.appendChild(li);
    });
    lista.parentElement.scrollTop = 0;
    document.getElementById("preview-layout").classList.remove("mostrando");
    atualizarBotaoRespostas();
    aplicarDestaques();
}

function alternarRespostas() {
    mostrarRespostas = !mostrarRespostas;
    document.getElementById("preview-layout").classList.toggle("mostrando", mostrarRespostas);
    atualizarBotaoRespostas();
    aplicarDestaques();
}

function atualizarBotaoRespostas() {
    document.getElementById("btn-toggle-respostas").innerText =
        mostrarRespostas ? "🙈 Ocultar respostas da grade" : "👁 Mostrar respostas na grade";
}

function aplicarDestaques() {
    if (!previewAtual) return;
    const { celulas, ocorrencias } = previewAtual;
    celulas.forEach(linha => linha.forEach(el => { el.style.backgroundColor = ""; }));
    if (!mostrarRespostas) return;
    ocorrencias.forEach((lista, i) => {
        const cor = corDoPar(i);
        lista.forEach(cels => cels.forEach(([r, c]) => { celulas[r][c].style.backgroundColor = cor; }));
    });
}