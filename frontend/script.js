const API_URL = "http://localhost:8000/api";
let currentUser = null;
let perfilAluno = false; // true quando quem entrou é aluno
let editandoId = null; 
let gameData = { disciplina: "", assunto: "", dificuldade: "Fácil", perguntas_respostas: [] };
let disciplinasSalvas = [];
let assuntosSalvos = [];
let dicaSelecionada = null; // guarda o índice da dica que o aluno clicou
const somCorreto = new Audio("sons/correto.wav");
const somIncorreto = new Audio("sons/incorreto.wav");

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
    perfilAluno = !select.options[select.selectedIndex].text.includes("Professor");
    showScreen(perfilAluno ? 'screen-menu-aluno' : 'screen-menu-prof');
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
            <div>
                <b>Disciplina:</b> ${j.disciplina} <br><b>Assunto:</b> ${j.assunto} (${j.dificuldade})
                ${j.codigo ? `<div class="card-codigo"><b>Código:</b> <span class="codigo-jogo">${j.codigo}</span>
                    <button type="button" class="btn-pequeno btn-copiar" onclick="copiarCodigo('${j.codigo}', this)">Copiar</button></div>` : ""}
            </div>
            <div style="display: flex; gap: 10px; width: 100%;">
                <button onclick="visualizarJogo(${j.id_jogo})" style="padding: 8px; font-size: 14px;">Visualizar</button>
                <button onclick="jogarJogo(${j.id_jogo})" style="padding: 8px; font-size: 14px;">Jogar</button>
                <button onclick="editarJogo(${j.id_jogo})" style="padding: 8px; font-size: 14px;">Editar</button>
                <button class="btn-voltar" onclick="deletarJogo(${j.id_jogo})" style="padding: 8px; font-size: 14px;">Excluir</button>
            </div>
        </li>
    `).join("");
    showScreen('screen-meus-jogos');
}

async function deletarJogo(id_jogo) {
    if (await confirmarAcao("Tem certeza que deseja excluir este caça-palavras? Essa ação não pode ser desfeita.", { titulo: "Excluir caça-palavras", textoOk: "Excluir", perigo: true })) {
        await fetch(`${API_URL}/jogos/${id_jogo}`, { method: 'DELETE' });
        carregarMeusJogos();
    }
}

async function visualizarJogo(id_jogo, jogar = false) {
    const res = await fetch(`${API_URL}/jogos/${id_jogo}`);
    if(res.ok) {
        const data = await res.json();
        document.getElementById("preview-title").innerText = `Visualizando: ${data.assunto}`;
        mostrarPreview(data.matriz_letras, data.perguntas_respostas, data.dificuldade, data.assunto);
        mostrarCodigoNoPreview(data.codigo);
        document.getElementById("btn-preview-voltar").onclick = perfilAluno ? () => showScreen('screen-filtros-aluno') : carregarMeusJogos; 
        showScreen('screen-preview');
        if (jogar) iniciarJogo();
    }
}

// Abre o jogo já no modo "jogar" (professor testando; não há pontuação)
function jogarJogo(id_jogo) {
    return visualizarJogo(id_jogo, true);
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
        if(!digitado) return mostrarAviso("Por favor, preencha a disciplina.", { titulo: "Campo obrigatório" });
        
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
        if(!digitadoAssunto) return mostrarAviso("Por favor, preencha o assunto.", { titulo: "Campo obrigatório" });

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
            mostrarAviso(`A dificuldade ${gameData.dificuldade} permite no máximo ${max} palavras, mas seu jogo atual tem ${qtdAtual}.\n\nPara conseguir salvar, você deverá remover ${excesso} palavra(s) da lista ou voltar e aumentar a dificuldade.`, { titulo: "Palavras demais para este nível" });
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
        return mostrarAviso(`Máximo de ${max} palavras atingido para o nível ${gameData.dificuldade}!`, { titulo: "Limite de palavras" });
    }
    
    const pergunta = document.getElementById("input-pergunta").value;
    // Pega a palavra exatamente como o professor digitou (mantendo acentos)
    const resposta = document.getElementById("input-resposta").value.trim();
    
    if (!pergunta || !resposta || resposta.includes(" ")) {
        return mostrarAviso("Preencha dica e resposta. A resposta deve ser uma palavra única sem espaços.", { titulo: "Verifique os dados" });
    }
    const semAcento = removerAcentos(resposta);
    if (!/^[A-Za-z]+$/.test(semAcento)) {
        return mostrarAviso("A resposta deve ter apenas letras (acentos são aceitos), sem números ou símbolos.", { titulo: "Resposta inválida" });
    }
    if (semAcento.length > MAX_LETRAS) {
        return mostrarAviso(`A resposta deve ter no máximo ${MAX_LETRAS} letras.`, { titulo: "Resposta inválida" });
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

function importarArquivoTXT(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const conteudo = e.target.result;
        // divide o texto linha por linha
        const linhas = conteudo.split(/\r?\n/);
        const max = LIMITES[gameData.dificuldade];
        
        let importados = 0;
        let ignorados = 0;

        linhas.forEach(linha => {
            // ignora linhas vazias
            if (!linha.trim()) return;

            const partes = linha.split(';');
            if (partes.length >= 2) {
                // junta caso o professor tenha colocado ';' no meio da pergunta sem querer
                const resposta = partes.pop().trim(); 
                const pergunta = partes.join(';').trim();

                // validação básica
                if (!pergunta || !resposta || resposta.includes(" ")) {
                    ignorados++;
                    return;
                }
                
                // validação de caracteres e tamanho
                const semAcento = removerAcentos(resposta);
                if (!/^[A-Za-z]+$/.test(semAcento) || semAcento.length > MAX_LETRAS) {
                    ignorados++;
                    return;
                }

                // validação do limite da dificuldade
                if (gameData.perguntas_respostas.length < max) {
                    gameData.perguntas_respostas.push({ pergunta, resposta });
                    importados++;
                } else {
                    ignorados++; // limite da dificuldade foi atingido
                }
            } else {
                ignorados++; // linha fora do formato Dica;Resposta
            }
        });

        atualizarListaPalavrasUI();
        
        // limpa o input file para permitir importar o mesmo arquivo novamente se o professor quiser
        document.getElementById('input-arquivo-txt').value = '';

        if (importados > 0 && ignorados === 0) {
            mostrarAviso(`${importados} palavras importadas do arquivo.`, { titulo: "Importação concluída", tipo: "sucesso" });
        } else {
            mostrarAviso(`✅ ${importados} inseridos com sucesso.\n⚠️ ${ignorados} ignorados (formato errado, resposta inválida ou limite atingido).`, { titulo: "Importação concluída", tipo: importados > 0 ? "aviso" : "erro" });
        }
    };
    
    reader.readAsText(file);
}

async function salvarJogo() {
    if (gameData.perguntas_respostas.length < 10) {
        return mostrarAviso("O sistema exige no mínimo 10 palavras cadastradas!", { titulo: "Ainda faltam palavras" });
    }
    const max = LIMITES[gameData.dificuldade];
    if (gameData.perguntas_respostas.length > max) {
        return mostrarAviso(`O nível ${gameData.dificuldade} permite no máximo ${max} palavras. Remova algumas ou mude a dificuldade.`, { titulo: "Palavras demais para este nível" });
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
        // o backend devolve os pares já com a posição de cada resposta na grade
        mostrarPreview(data.matriz, data.perguntas_respostas || gameData.perguntas_respostas, gameData.dificuldade, gameData.assunto);
        mostrarCodigoNoPreview(data.codigo); // é o código para o professor divulgar aos alunos
        document.getElementById("btn-preview-voltar").onclick = voltarAoMenu; 
        showScreen('screen-preview');
    } else {
        const err = await res.json();
        mostrarAviso(typeof err.detail === "string" ? err.detail : "Confira os dados e tente de novo.", { titulo: "Erro ao salvar", tipo: "erro" });
    }
}

// ---------- Visualização e modo jogo: dicas à esquerda + grade à direita ----------
let previewAtual = null;       // { celulas, ocorrencias } do jogo exibido
let jogoAtual = null;          // { matriz, perguntas, dificuldade, assunto }
let mostrarRespostas = false;  // por padrão, as respostas ficam desligadas
let modoJogo = false;          // false = só visualizar; true = professor jogando (sem pontuação)
let achadas = new Map();       // índice do par -> lista de [linha, coluna] que o jogador marcou
let selecao = null;            // { cels: [[l, c], ...], confirmando: bool } (seleção em andamento)
let arrasto = null;            // { inicio: [l, c] } enquanto o botão do mouse está pressionado

const TAMANHO_CELULA = 32; // px. Igual em todas as dificuldades (o CSS usa o mesmo valor)

// Desenha a grade e devolve as células (matriz de elementos) para podermos colori-las
function renderizarMatriz(matriz) {
    const grid = document.getElementById("matriz-preview");
    grid.innerHTML = "";
    grid.style.gridTemplateColumns = `repeat(${matriz[0].length}, ${TAMANHO_CELULA}px)`; // colunas = largura da matriz
    return matriz.map((linha, r) => linha.map((letra, c) => {
        const div = document.createElement("div");
        div.className = "matriz-cell";
        div.innerText = letra;
        div.dataset.r = r;
        div.dataset.c = c;
        grid.appendChild(div);
        return div;
    }));
}

// Procura a palavra na matriz (mesmas direções que o gerador usa em cada dificuldade).
// Só é usada em jogos ANTIGOS, salvos antes de o backend guardar a posição das palavras.
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

// Células ocupadas por uma resposta. Jogos novos trazem a posição salva pelo backend
// ({ linha, coluna, dl, dc, tamanho }); jogos antigos caem na busca pela matriz.
function celulasDoPar(matriz, pr, dificuldade) {
    const p = pr.posicao;
    if (p) {
        const cels = [];
        for (let k = 0; k < p.tamanho; k++) cels.push([p.linha + p.dl * k, p.coluna + p.dc * k]);
        return [cels];
    }
    return localizarPalavra(matriz, pr.resposta, dificuldade);
}

// Cor clarinha e diferente para cada par (ângulo áureo espalha bem os tons)
function corDoPar(i) {
    return `hsl(${Math.round((i * 137.508) % 360)}, 80%, 82%)`;
}

function mostrarPreview(matriz, perguntas, dificuldade, assunto = "") {
    const celulas = renderizarMatriz(matriz);
    const ocorrencias = perguntas.map(pr => celulasDoPar(matriz, pr, dificuldade));
    previewAtual = { celulas, ocorrencias };
    jogoAtual = { matriz, perguntas, dificuldade, assunto };
    mostrarRespostas = false;
    modoJogo = false;
    achadas = new Map();
    dicaSelecionada = null;
    selecao = null;
    arrasto = null;

    const lista = document.getElementById("lista-perguntas-preview");
    lista.innerHTML = "";
    perguntas.forEach((pr, i) => {
        const li = document.createElement("li");
        
        // evento de clique para selecionar a dica no modo jogo
        li.onclick = () => selecionarDica(i);
        
        const cor = document.createElement("span");
        cor.className = "cor";
        cor.style.backgroundColor = corDoPar(i);
        const corpo = document.createElement("div");
        const pergunta = document.createElement("div");
        pergunta.className = "texto-dica";
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
    const layout = document.getElementById("preview-layout");
    layout.classList.remove("mostrando", "jogando");
    document.getElementById("barra-jogo").style.display = "none";
    document.getElementById("btn-jogar").innerText = "🎮 Jogar este caça-palavras";
    document.getElementById("btn-toggle-respostas").style.display = perfilAluno ? "none" : "";
    document.querySelector(".selo-teste").textContent = perfilAluno ? "Por enquanto, sem pontuação" : "MODO TESTE";
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
    if (mostrarRespostas) {
        ocorrencias.forEach((lista, i) => {
            const cor = corDoPar(i);
            lista.forEach(cels => cels.forEach(([r, c]) => { celulas[r][c].style.backgroundColor = cor; }));
        });
    }
    // palavras que o jogador já acertou continuam coloridas
    achadas.forEach((cels, i) => {
        cels.forEach(([r, c]) => { celulas[r][c].style.backgroundColor = corDoPar(i); });
    });
}

// ---------- Modo jogo ----------
function iniciarJogo() {
    if (!jogoAtual) return;
    modoJogo = true;
    achadas = new Map();
    dicaSelecionada = null;
    mostrarRespostas = false;
    limparSelecao();
    document.getElementById("preview-title").innerText = `Jogando: ${jogoAtual.assunto}`;
    const layout = document.getElementById("preview-layout");
    layout.classList.remove("mostrando");
    layout.classList.add("jogando");
    document.getElementById("barra-jogo").style.display = "flex";
    document.getElementById("btn-jogar").innerText = "↺ Reiniciar jogo";
    atualizarBotaoRespostas();
    atualizarPainelJogo();
    aplicarDestaques();
    
    mostrarMensagemJogo("Primeiro, clique em uma dica na lista. Depois, encontre a palavra na grade!", "");
}

function mostrarMensagemJogo(texto = "Arraste da primeira à última letra e confirme com ✔", tipo = "") {
    const msg = document.getElementById("jogo-msg");
    msg.textContent = texto;
    msg.className = tipo;
    document.getElementById("jogo-contador").textContent = `${achadas.size}/${jogoAtual.perguntas.length}`;
}

function selecionarDica(index) {
    if (!modoJogo || achadas.has(index)) return; // não faz nada se não estiver jogando ou se já achou
    dicaSelecionada = index;
    atualizarPainelJogo();
}

function atualizarPainelJogo() {
    document.querySelectorAll("#lista-perguntas-preview li").forEach((li, i) => {
        li.classList.toggle("achada", achadas.has(i));
        li.classList.toggle("selecionada", i === dicaSelecionada);
    });
}

// Dado o início e a posição do mouse, calcula as células da seleção.
// A seleção "encaixa" na direção mais próxima (8 direções) e para na borda da grade.
function selecaoAte(inicio, x, y) {
    const cel = previewAtual.celulas;
    const base = cel[0][0].getBoundingClientRect();
    const passo = cel[0].length > 1 ? cel[0][1].getBoundingClientRect().left - base.left : base.width;
    const cx = base.left + inicio[1] * passo + base.width / 2;
    const cy = base.top + inicio[0] * passo + base.height / 2;
    const dx = (x - cx) / passo, dy = (y - cy) / passo;
    if (Math.hypot(dx, dy) < 0.6) return [inicio];

    const k = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
    const dc = Math.round(Math.cos(k * Math.PI / 4));
    const dl = Math.round(Math.sin(k * Math.PI / 4));
    let n = Math.round((dx * dc + dy * dl) / (dc * dc + dl * dl)); // passos ao longo da direção
    const linhas = cel.length, colunas = cel[0].length;
    const limL = dl > 0 ? linhas - 1 - inicio[0] : dl < 0 ? inicio[0] : Infinity;
    const limC = dc > 0 ? colunas - 1 - inicio[1] : dc < 0 ? inicio[1] : Infinity;
    n = Math.max(0, Math.min(n, limL, limC));

    const cels = [];
    for (let i = 0; i <= n; i++) cels.push([inicio[0] + dl * i, inicio[1] + dc * i]);
    return cels;
}

function pintarSelecao(erro = false) {
    if (!previewAtual) return;
    previewAtual.celulas.forEach(l => l.forEach(el => el.classList.remove("sel", "erro")));
    if (!selecao) return;
    selecao.cels.forEach(([r, c]) => previewAtual.celulas[r][c].classList.add(erro ? "erro" : "sel"));
}

function removerBalao() {
    const b = document.getElementById("balao-confirmar");
    if (b) b.remove();
}

function limparSelecao() {
    selecao = null;
    arrasto = null;
    removerBalao();
    pintarSelecao();
}

// Balão com ✔ e ✖ ao lado da última letra selecionada
function mostrarBalao() {
    removerBalao();
    const [r, c] = selecao.cels[selecao.cels.length - 1];
    const fim = previewAtual.celulas[r][c];
    const grid = document.getElementById("matriz-preview");
    const balao = document.createElement("div");
    balao.id = "balao-confirmar";
    balao.className = "confirmar-selecao";
    balao.innerHTML = '<button class="btn-ok" title="Confirmar (Enter)">✔</button><button class="btn-nao" title="Cancelar (Esc)">✖</button>';
    balao.querySelector(".btn-ok").onclick = confirmarSelecao;
    balao.querySelector(".btn-nao").onclick = limparSelecao;
    grid.appendChild(balao);
    const metade = balao.offsetWidth / 2;
    const esq = Math.max(metade, Math.min(fim.offsetLeft + TAMANHO_CELULA / 2, grid.clientWidth - metade));
    // abre do lado para onde o arrasto está indo (assim não cobre as letras selecionadas);
    // se não houver espaço nesse lado, abre no outro
    const subindo = selecao.cels.length > 1 && r < selecao.cels[0][0];
    let emCima = subindo;
    if (emCima && r < 1) emCima = false;
    if (!emCima && r >= previewAtual.celulas.length - 1) emCima = true;
    balao.style.left = `${esq}px`;
    balao.style.top = `${emCima ? fim.offsetTop - balao.offsetHeight - 4 : fim.offsetTop + TAMANHO_CELULA + 4}px`;
}

// Confere a seleção: vale se as letras (ou elas ao contrário) formam uma resposta ainda não encontrada.
function confirmarSelecao() {
    if (!modoJogo || !selecao || !selecao.confirmando) return;

    // verifica se o aluno selecionou uma dica antes de confirmar a palavra
    if (dicaSelecionada === null) {
        tocarSom(somIncorreto);
        removerBalao();
        limparSelecao();
        mostrarMensagemJogo("⚠️ Selecione uma dica na lista à esquerda antes de confirmar!", "erro");
        return;
    }

    const { matriz, perguntas } = jogoAtual;
    const letras = selecao.cels.map(([r, c]) => matriz[r][c]).join("");
    const invertida = [...letras].reverse().join("");
    const respostaCerta = removerAcentos(perguntas[dicaSelecionada].resposta).toUpperCase();

    removerBalao();

    if (letras === respostaCerta || invertida === respostaCerta) {
        tocarSom(somCorreto);
        achadas.set(dicaSelecionada, selecao.cels);
        const indexAcerto = dicaSelecionada;
        dicaSelecionada = null; // reseta a seleção para obrigar a clicar na próxima dica
        
        limparSelecao();
        atualizarPainelJogo();
        aplicarDestaques();
        
        if (achadas.size === perguntas.length) {
            mostrarMensagemJogo("🎉 Parabéns! Você encontrou e associou todas as palavras.", "sucesso");
        } else {
            mostrarMensagemJogo(`Boa! Achou "${perguntas[indexAcerto].resposta}". Escolha a próxima dica.`, "sucesso");
        }
    } else {
        tocarSom(somIncorreto);
        pintarSelecao(true);
        const errada = selecao;
        setTimeout(() => { if (selecao === errada) limparSelecao(); }, 450);
        mostrarMensagemJogo("Palavra incorreta ou associada à dica errada. Tente de novo.", "erro");
    }
}

function iniciarArrasto(e) {
    if (!modoJogo || !previewAtual) return;
    if (e.button !== undefined && e.button !== 0) return;       // só botão esquerdo
    if (e.target.closest("#balao-confirmar")) return;           // clique no ✔/✖ não inicia seleção
    const alvo = e.target.closest(".matriz-cell");
    if (!alvo) return;
    e.preventDefault();
    removerBalao();
    arrasto = { inicio: [Number(alvo.dataset.r), Number(alvo.dataset.c)] };
    selecao = { cels: [arrasto.inicio], confirmando: false };
    pintarSelecao();
    try { document.getElementById("matriz-preview").setPointerCapture(e.pointerId); } catch (_) {}
}

function moverArrasto(e) {
    if (!arrasto || !selecao) return;
    selecao.cels = selecaoAte(arrasto.inicio, e.clientX, e.clientY);
    pintarSelecao();
}

function soltarArrasto(e) {
    if (!arrasto || !selecao) return;
    moverArrasto(e);
    arrasto = null;
    selecao.confirmando = true;
    mostrarBalao();
}

function cancelarArrasto() {
    if (arrasto) limparSelecao();
}

function inicializarJogoUI() {
    const grid = document.getElementById("matriz-preview");
    grid.addEventListener("pointerdown", iniciarArrasto);
    grid.addEventListener("pointermove", moverArrasto);
    grid.addEventListener("pointerup", soltarArrasto);
    grid.addEventListener("pointercancel", cancelarArrasto);
    document.addEventListener("keydown", (e) => {
        if (!modoJogo || !selecao || !selecao.confirmando) return;
        if (!document.getElementById("screen-preview").classList.contains("active")) return;
        if (e.key === "Enter") { e.preventDefault(); confirmarSelecao(); }
        if (e.key === "Escape") limparSelecao();
    });
}
inicializarJogoUI();

// ---------- Código do jogo (professor) ----------
function mostrarCodigoNoPreview(codigo) {
    const caixa = document.getElementById("preview-codigo");
    caixa.style.display = (codigo && !perfilAluno) ? "block" : "none"; // o aluno não precisa ver
    if (!codigo) return;
    document.getElementById("preview-codigo-valor").textContent = codigo;
    document.getElementById("btn-copiar-codigo").onclick = (e) => copiarCodigo(codigo, e.currentTarget);
}

function copiarCodigo(codigo, botao) {
    const feito = () => {
        const original = botao.textContent;
        botao.textContent = "Copiado ✔";
        setTimeout(() => { botao.textContent = original; }, 1500);
    };
    const alternativa = () => {  // navegadores sem a API de área de transferência (ex.: página em http fora do localhost)
        const t = document.createElement("textarea");
        t.value = codigo;
        t.style.position = "fixed";
        t.style.opacity = "0";
        document.body.appendChild(t);
        t.select();
        let ok = false;
        try { ok = document.execCommand("copy"); } catch (_) {}
        t.remove();
        if (ok) feito(); else mostrarAviso(`Copie o código manualmente: ${codigo}`, { titulo: "Copiar código", tipo: "info" });
    };
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(codigo).then(feito, alternativa);
    } else {
        alternativa();
    }
}

// ---------- Área do aluno: filtros por professor, disciplina, assunto e dificuldade (RN05) + busca por código ----------
const ordenarPt = (a, b) => String(a).localeCompare(String(b), "pt-BR");
const FILTROS = ["professor", "disciplina", "assunto", "dificuldade"]; // ids: filtro-<nome>
const ORDEM_DIFICULDADE = ["Fácil", "Médio", "Difícil"];
let buscaFiltros = 0; // descarta respostas antigas se o aluno mudar os filtros rápido

function valoresFiltros() {
    return Object.fromEntries(FILTROS.map(k => [k, document.getElementById(`filtro-${k}`).value]));
}

// Preenche um <select> e devolve o valor que ficou selecionado (volta para "Todos" se o antigo sumiu)
function preencherFiltro(id, opcoes, selecionado, textoTodos) {
    const sel = document.getElementById(id);
    sel.innerHTML = "";
    const todos = document.createElement("option");
    todos.value = "";
    todos.textContent = textoTodos;
    sel.appendChild(todos);
    opcoes.forEach(({ valor, texto }) => {
        const o = document.createElement("option");
        o.value = valor;
        o.textContent = texto;
        sel.appendChild(o);
    });
    sel.value = opcoes.some(o => String(o.valor) === selecionado) ? selecionado : "";
    return sel.value;
}

// Preenche os quatro selects com as opções que o backend devolveu e devolve os valores que ficaram escolhidos
function preencherFiltros(filtros, v) {
    return {
        professor: preencherFiltro("filtro-professor",
            filtros.professores.slice().sort((a, b) => ordenarPt(a.nome, b.nome)).map(p => ({ valor: p.id, texto: p.nome })),
            v.professor, "Todos os professores"),
        disciplina: preencherFiltro("filtro-disciplina",
            filtros.disciplinas.slice().sort(ordenarPt).map(d => ({ valor: d, texto: d })),
            v.disciplina, "Todas as disciplinas"),
        assunto: preencherFiltro("filtro-assunto",
            filtros.assuntos.slice().sort(ordenarPt).map(a => ({ valor: a, texto: a })),
            v.assunto, "Todos os assuntos"),
        dificuldade: preencherFiltro("filtro-dificuldade",
            filtros.dificuldades.slice().sort((a, b) => ORDEM_DIFICULDADE.indexOf(a) - ORDEM_DIFICULDADE.indexOf(b)).map(d => ({ valor: d, texto: d })),
            v.dificuldade, "Todas as dificuldades"),
    };
}

function limparCampoCodigo() {
    document.getElementById("filtro-codigo").value = "";
    document.getElementById("codigo-msg").textContent = "";
}

function abrirFiltrosAluno() {
    FILTROS.forEach(k => { document.getElementById(`filtro-${k}`).innerHTML = ""; });
    limparCampoCodigo();
    showScreen('screen-filtros-aluno');
    atualizarFiltrosAluno();
}

function limparFiltrosAluno() {
    FILTROS.forEach(k => { document.getElementById(`filtro-${k}`).value = ""; });
    limparCampoCodigo();
    atualizarFiltrosAluno();
}

// O campo de código só aceita letras e números, sempre em maiúsculas (aceita colar "k7m-4qx")
function formatarCampoCodigo(campo) {
    const limpo = campo.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (limpo !== campo.value) campo.value = limpo;
}

// As opções de cada filtro dependem dos outros três (o backend devolve só combinações que têm jogo).
async function atualizarFiltrosAluno() {
    limparCampoCodigo(); // mexeu nos filtros: a busca por código deixa de valer
    const minha = ++buscaFiltros;
    let v = valoresFiltros();
    for (let tentativa = 0; tentativa < 3; tentativa++) {
        const qs = new URLSearchParams();
        Object.entries(v).forEach(([k, x]) => { if (x) qs.set(k, x); });
        const [filtros, jogos] = await Promise.all([
            fetch(`${API_URL}/filtros?${qs}`).then(r => r.json()),
            fetch(`${API_URL}/jogos?${qs}`).then(r => r.json()),
        ]);
        if (minha !== buscaFiltros) return; // chegou uma busca mais nova

        const novo = preencherFiltros(filtros, v);
        if (FILTROS.every(k => novo[k] === v[k])) {
            renderizarJogosAluno(jogos);
            return;
        }
        v = novo; // algum filtro escolhido deixou de existir: busca de novo já sem ele
    }
}

// Busca direta pelo código (Enter ou clique na lupa). Ignora os filtros: eles voltam para "Todos".
async function buscarPorCodigo() {
    const campo = document.getElementById("filtro-codigo");
    const msg = document.getElementById("codigo-msg");
    const codigo = campo.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    msg.textContent = "";
    if (!codigo) {
        msg.textContent = "Digite o código do jogo.";
        campo.focus();
        return;
    }
    const minha = ++buscaFiltros;
    try {
        const [filtros, jogos] = await Promise.all([
            fetch(`${API_URL}/filtros`).then(r => r.json()),
            fetch(`${API_URL}/jogos?codigo=${encodeURIComponent(codigo)}`).then(r => r.json()),
        ]);
        if (minha !== buscaFiltros) return;
        preencherFiltros(filtros, {});
        renderizarJogosAluno(jogos, codigo);
    } catch (_) {
        if (minha === buscaFiltros) msg.textContent = "Não foi possível buscar agora. Tente de novo.";
    }
}

function renderizarJogosAluno(jogos, codigo = null) {
    document.getElementById("filtros-total").textContent = codigo
        ? (jogos.length ? `Jogo encontrado pelo código ${codigo}` : "")
        : (jogos.length === 1 ? "1 caça-palavras encontrado" : `${jogos.length} caça-palavras encontrados`);
    const ul = document.getElementById("lista-jogos-aluno");
    ul.innerHTML = "";
    if (jogos.length === 0) {
        const vazio = document.createElement("li");
        vazio.className = "list-item";
        vazio.textContent = codigo
            ? `Nenhum caça-palavras com o código ${codigo}. Confira se digitou certo.`
            : "Nenhum caça-palavras com esses filtros.";
        ul.appendChild(vazio);
        return;
    }
    jogos.forEach(jg => {
        // textContent: o texto cadastrado pelo professor nunca é interpretado como HTML
        const li = document.createElement("li");
        li.className = "list-item card-jogo";
        const info = document.createElement("div");
        info.className = "texto-par";
        const titulo = document.createElement("b");
        titulo.textContent = `${jg.disciplina} · ${jg.assunto}`;
        const detalhe = document.createElement("div");
        detalhe.className = "card-detalhe";
        detalhe.textContent = `${jg.professor} · ${jg.dificuldade} · ${jg.qtd_palavras} palavras`;
        info.append(titulo, detalhe);
        const botao = document.createElement("button");
        botao.textContent = "Jogar";
        botao.onclick = () => jogarJogo(jg.id_jogo);
        li.append(info, botao);
        ul.appendChild(li);
    });
}

// ---------- Janelas de aviso e confirmação (no lugar de alert / confirm do navegador) ----------
// mostrarAviso(mensagem, { titulo, tipo })  -> Promise que resolve quando o usuário fecha
// confirmarAcao(mensagem, { titulo, textoOk, textoCancelar, perigo })  -> Promise<boolean>
// tipo: "sucesso" | "erro" | "aviso" | "info"
const ICONES_MODAL = { sucesso: "✔", erro: "✖", aviso: "!", info: "i" };
const TITULOS_MODAL = { sucesso: "Tudo certo!", erro: "Ops!", aviso: "Atenção", info: "Aviso" };
let filaModal = Promise.resolve(); // se vierem vários avisos seguidos, aparecem um de cada vez

function exibirModal({ mensagem, titulo, tipo, confirmar, textoOk, textoCancelar, perigo }) {
    return new Promise(resolve => {
        const overlay = document.getElementById("modal-overlay");
        const caixa = overlay.querySelector(".modal");
        const acoes = document.getElementById("modal-acoes");
        const focoAnterior = document.activeElement;

        caixa.dataset.tipo = tipo;
        document.getElementById("modal-icone").textContent = ICONES_MODAL[tipo] || "i";
        // textContent: o texto (que pode vir do professor ou do servidor) nunca é interpretado como HTML
        document.getElementById("modal-titulo").textContent = titulo || TITULOS_MODAL[tipo];
        document.getElementById("modal-corpo").textContent = mensagem;
        acoes.innerHTML = "";

        const aoTeclar = (e) => {
            if (e.key === "Escape") {
                e.preventDefault(); e.stopPropagation();
                fechar(false);
            } else if (e.key === "Tab") { // o foco fica preso dentro da janela
                e.preventDefault(); e.stopPropagation();
                const botoes = [...acoes.querySelectorAll("button")];
                const i = botoes.indexOf(document.activeElement);
                botoes[e.shiftKey ? (i <= 0 ? botoes.length - 1 : i - 1) : (i + 1) % botoes.length].focus();
            } else if (e.key === "Enter") {
                e.stopPropagation(); // o Enter só aciona o botão da janela (e não o atalho do jogo por baixo)
            }
        };
        const aoClicarFora = (e) => { if (e.target === overlay) fechar(false); };
        function fechar(valor) {
            document.removeEventListener("keydown", aoTeclar, true);
            overlay.removeEventListener("mousedown", aoClicarFora);
            overlay.hidden = true;
            document.body.style.overflow = "";
            if (focoAnterior && focoAnterior.focus) focoAnterior.focus();
            resolve(valor);
        }

        let botaoOk, botaoCancelar;
        if (confirmar) {
            botaoCancelar = document.createElement("button");
            botaoCancelar.type = "button";
            botaoCancelar.className = "btn-voltar";
            botaoCancelar.textContent = textoCancelar;
            botaoCancelar.onclick = () => fechar(false);
            acoes.appendChild(botaoCancelar);
        }
        botaoOk = document.createElement("button");
        botaoOk.type = "button";
        botaoOk.textContent = textoOk;
        if (perigo) botaoOk.classList.add("modal-perigo");
        botaoOk.onclick = () => fechar(true);
        acoes.appendChild(botaoOk);

        document.addEventListener("keydown", aoTeclar, true);
        overlay.addEventListener("mousedown", aoClicarFora);
        document.body.style.overflow = "hidden";
        overlay.hidden = false;
        (perigo && botaoCancelar ? botaoCancelar : botaoOk).focus(); // numa ação perigosa o foco começa em "Cancelar"
    });
}

function enfileirarModal(opcoes) {
    const p = filaModal.then(() => exibirModal(opcoes));
    filaModal = p;
    return p;
}

function mostrarAviso(mensagem, { titulo = "", tipo = "aviso", textoOk = "OK" } = {}) {
    return enfileirarModal({ mensagem, titulo, tipo, confirmar: false, textoOk });
}

function confirmarAcao(mensagem, { titulo = "Confirmar", textoOk = "Confirmar", textoCancelar = "Cancelar", perigo = false } = {}) {
    return enfileirarModal({ mensagem, titulo, tipo: "aviso", confirmar: true, textoOk, textoCancelar, perigo });
}

// ---------- Configurações (sons) ----------
const CONFIG_PADRAO = { sons: true, volume: 0.8 };
let configuracoes = { ...CONFIG_PADRAO };

function carregarConfiguracoes() {
    try {
        const salvo = JSON.parse(localStorage.getItem("wordhunt_config") || "null");
        if (salvo) {
            const v = Number(salvo.volume);
            configuracoes = {
                sons: salvo.sons !== false,
                volume: Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : CONFIG_PADRAO.volume,
            };
        }
    } catch (_) { /* sem localStorage (janela anônima, etc.): vale o padrão nesta visita */ }
}

function salvarConfiguracoes() {
    try { localStorage.setItem("wordhunt_config", JSON.stringify(configuracoes)); } catch (_) {}
}

// Toca um efeito respeitando as configurações. Se o navegador bloquear o áudio, o jogo segue normalmente.
function tocarSom(som) {
    if (!configuracoes.sons) return;
    som.volume = configuracoes.volume;
    som.currentTime = 0;
    const p = som.play();
    if (p && p.catch) p.catch(() => {});
}

function atualizarTelaConfig() {
    const pct = Math.round(configuracoes.volume * 100);
    document.getElementById("cfg-sons").checked = configuracoes.sons;
    document.getElementById("cfg-volume").value = pct;
    document.getElementById("cfg-volume-valor").textContent = `${pct}%`;
    // com o som desligado, volume e testes ficam desativados
    document.getElementById("cfg-volume").disabled = !configuracoes.sons;
    document.getElementById("cfg-teste-correto").disabled = !configuracoes.sons;
    document.getElementById("cfg-teste-incorreto").disabled = !configuracoes.sons;
    document.getElementById("cfg-linha-volume").classList.toggle("desativada", !configuracoes.sons);
    document.getElementById("cfg-linha-teste").classList.toggle("desativada", !configuracoes.sons);
}

function alterarSons(ligado) {
    configuracoes.sons = ligado;
    salvarConfiguracoes();
    atualizarTelaConfig();
}

function alterarVolume(valor) {
    configuracoes.volume = Math.min(1, Math.max(0, Number(valor) / 100));
    document.getElementById("cfg-volume-valor").textContent = `${Math.round(configuracoes.volume * 100)}%`;
    salvarConfiguracoes();
}

function testarSom(tipo) {
    tocarSom(tipo === "correto" ? somCorreto : somIncorreto);
}

function abrirConfiguracoes() {
    atualizarTelaConfig();
    showScreen("screen-config");
}

// ---------- Créditos ----------
const CREDITOS = {
    descricao: "O WordHunt foi um jogo desenvolvido para a disciplina Projeto e Construção de Sistemas, com o objetivo de ser um jogo educativo interdisciplinar, onde o jogador pode testar seus conhecimentos.",
    equipe: ["Clara Ribeiro Barreto", "Julia Iacovellis Pinho", "Kaio da Silva dos Santos"],
    professor: "Marcelo Areas Rodrigues da Silva",
    disciplina: "Projeto e Construção de Sistemas · CEFET/RJ",
};

function abrirCreditos() {
    document.getElementById("creditos-descricao").textContent = CREDITOS.descricao;
    const lista = document.getElementById("creditos-equipe");
    lista.innerHTML = "";
    CREDITOS.equipe.forEach(nome => {
        const li = document.createElement("li");
        li.textContent = nome;
        lista.appendChild(li);
    });
    document.getElementById("creditos-professor").textContent = CREDITOS.professor;
    document.getElementById("creditos-disciplina").textContent = CREDITOS.disciplina;
    showScreen("screen-creditos");
}

// Configurações e Créditos voltam para o painel de quem está logado
function voltarDoMenuSecundario() {
    showScreen(perfilAluno ? "screen-menu-aluno" : "screen-menu-prof");
}

carregarConfiguracoes();
