# WordHunt: Manual do Desenvolvedor e do Usuário

Projeto da disciplina **Projeto e Construção de Sistemas** (CEFET/RJ).
Equipe: Clara Ribeiro Barreto, Julia Iacovellis Pinho e Kaio da Silva dos Santos.

## Status do projeto

O WordHunt está **em desenvolvimento**. Hoje funciona de ponta a ponta o **lado do professor** (criar, editar, excluir e visualizar caça-palavras). O **lado do aluno** (escolher jogo, jogar, pontuar, histórico) e a **integração com a Lúdica** estão previstos nos documentos, mas ainda não existem no código. Os manuais separam o que já funciona do que é planejado.

---

# Manual do Desenvolvedor

## 1. Visão geral

Jogo educativo de caça-palavras. O professor cadastra pares de **dica + resposta (uma palavra)** e o sistema monta a grade de letras sozinho. Aplicação web cliente-servidor, rodando em Docker com três containers:

| Container | Tecnologia | Função |
|---|---|---|
| `wordhunt_frontend` | HTML, CSS e JavaScript puro, servidos pelo Nginx (`nginx:alpine`) | Interface (hoje só a do professor) |
| `wordhunt_backend` | Python 3.10 + FastAPI (Uvicorn) | API REST, regras de negócio e geração da grade |
| `wordhunt_db` | PostgreSQL 15 | Persistência |

Não há framework de frontend nem etapa de build: o Nginx só entrega a pasta `frontend/`.

## 2. Arquitetura (diagrama de implantação)

O navegador pega a página no Nginx (porta 80) e faz as chamadas da API **direto** no backend (porta 8000). O Nginx não faz proxy. O endereço da API está fixo no `script.js` (`http://localhost:8000/api`).

```mermaid
flowchart LR
    NAV["Navegador do usuário"]
    LUD["Plataforma Lúdica<br/>(externa, ainda NÃO integrada)"]

    subgraph HOST["Máquina do desenvolvedor (Docker Compose)"]
        subgraph NET["Rede Docker: wordhunt-net"]
            FE["wordhunt_frontend<br/>nginx:alpine<br/>porta 80"]
            BE["wordhunt_backend<br/>Python 3.10 + FastAPI<br/>porta 8000"]
            DB[("wordhunt_db<br/>PostgreSQL 15<br/>porta 5432")]
        end
        PASTA["pasta ./frontend"]
        INIT["arquivo ./init.sql"]
        VOL[("volume wordhunt_db_data")]
    end

    NAV -- "HTTP :80 (HTML, CSS, JS)" --> FE
    NAV -- "fetch JSON :8000/api" --> BE
    BE -- "psycopg2 :5432" --> DB
    PASTA -. "montada no Nginx" .-> FE
    INIT -. "roda só na 1ª criação do banco" .-> DB
    DB --- VOL
    BE -. "futuro" .- LUD
```

## 3. Estrutura de pastas

```
CacaPalavras-dev/
├── docker-compose.yml
├── init.sql
├── README.md
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   └── Dockerfile
└── frontend/
    ├── index.html
    ├── script.js
    └── style.css
```

O Dockerfile do backend parte de `python:3.10-slim`, instala o `requirements.txt`, copia o `main.py` e sobe o Uvicorn na porta 8000.

## 4. Instalação e execução

**Pré-requisitos:** Docker Desktop (Windows/Mac) ou Docker Engine com Compose (Linux), aberto e com "Engine running". E Git. Não precisa instalar Python nem Postgres.

```bash
git clone <https://github.com/marceloareas/CacaPalavras.git>
cd CacaPalavras-dev
docker compose up --build
```

Quando os logs mostrarem `database system is ready to accept connections` e `Uvicorn running on http://0.0.0.0:8000`:

| Endereço | O que é |
|---|---|
| http://localhost | O jogo |
| http://localhost:8000/docs | Documentação da API (Swagger) |

Para parar: `Ctrl+C` ou `docker compose down` (os jogos continuam salvos no volume). Para subir de novo: `docker compose up`.

| Situação | O que fazer |
|---|---|
| Mudou só `frontend/` | Recarregar a página (`Ctrl+F5`) |
| Mudou `main.py` ou `requirements.txt` | `docker compose up --build` |
| Mudou `init.sql` ou `docker-compose.yml`, ou quer o banco limpo | `docker compose down -v` e depois `docker compose up --build` |

> Obs: O `-v` apaga o volume: **todos os jogos salvos localmente somem**. Isso é necessário porque o `init.sql` só roda quando o banco é criado do zero. Depois de um `git pull`, o README recomenda sempre fazer `down -v` + `up --build`.

Para entrar no banco: `docker exec -it wordhunt_db psql -U admin -d wordhunt` (a porta 5432 também está aberta no host).

## 5. Configurações

Tudo no `docker-compose.yml`: banco `wordhunt`, usuário `admin`, senha `adminpassword`, `DATABASE_URL=postgresql://admin:adminpassword@db:5432/wordhunt`, rede `wordhunt-net`, volume `wordhunt_db_data`. Sem a variável, o `main.py` usa `localhost:5432` como padrão. São credenciais de **desenvolvimento**.

## 6. Banco de dados

```mermaid
erDiagram
    USUARIO |o--o{ CACA_PALAVRAS : "cria (id_professor)"
    USUARIO |o--o{ PARTIDA_HISTORICO : "joga (id_aluno)"
    CACA_PALAVRAS |o--o{ PARTIDA_HISTORICO : "id_jogo"

    USUARIO {
        int id_ludica PK "SERIAL"
        varchar100 nametag "NOT NULL"
        varchar255 email UK "NOT NULL"
        perfil_enum tipo_perfil "Professor ou Aluno"
    }

    CACA_PALAVRAS {
        int id_jogo PK "SERIAL"
        int id_professor FK
        varchar100 disciplina "NOT NULL"
        varchar150 assunto "NOT NULL"
        dificuldade_enum dificuldade "Fácil, Médio ou Difícil"
        jsonb perguntas_respostas "NOT NULL"
        jsonb matriz_letras "NOT NULL"
    }

    PARTIDA_HISTORICO {
        int id_partida PK "SERIAL"
        int id_aluno FK
        int id_jogo FK
        int pontuacao_obtida "NOT NULL"
        timestamp data_conclusao "default agora"
    }
```

- `Caca_Palavras` tem **UNIQUE em (disciplina, assunto, dificuldade)**.
- As FKs não têm `ON DELETE CASCADE`, por isso o endpoint de excluir jogo apaga o histórico antes.
- **Não existem tabelas de Disciplina nem de Assunto**: são colunas de texto, e as sugestões vêm de `SELECT DISTINCT`. Uma disciplina só "existe" depois que um jogo dela é salvo.
- `Partida_Historico` existe, mas nenhum endpoint usa ela ainda (só o de excluir jogo limpa os registros).
- `id_ludica` é um `SERIAL` (gerado pelo banco). O `init.sql` cadastra dois usuários de teste: *Prof. João* (Professor) e *Aluno Maria* (Aluno).

**Formato dos JSONB.** `perguntas_respostas` é uma lista como `[{"pergunta": "Onde tomamos café?", "resposta": "Xícara"}]` (guardada como o professor digitou, com acento). `matriz_letras` é uma lista de listas de letras maiúsculas sem acento (15 linhas por 17, 21 ou 25 colunas).

> Obs:  **O banco não guarda a posição das palavras**, só as letras. Para destacar as respostas, o frontend procura as palavras na matriz de novo (`localizarPalavra` no `script.js`). Se as letras aleatórias formarem a mesma palavra em outro lugar, as duas ocorrências ficam pintadas.

## 7. Backend (`backend/main.py`)

FastAPI com CORS liberado. Cada requisição abre e fecha uma conexão com o Postgres via `psycopg2`, sem ORM (o `sqlalchemy` está no `requirements.txt`, mas o `main.py` não usa).

| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/usuarios` | Lista usuários (login simulado) |
| GET | `/api/disciplinas` | Disciplinas distintas de todos os professores |
| GET | `/api/assuntos/{disciplina}` | Assuntos distintos daquela disciplina |
| GET | `/api/jogos/professor/{id_professor}` | Jogos de um professor |
| GET | `/api/jogos/{id_jogo}` | Jogo completo (404 se não existir) |
| POST | `/api/jogos` | Valida, gera a grade e salva. Devolve `{id_jogo, matriz}` |
| PUT | `/api/jogos/{id_jogo}` | Valida, **gera grade nova** e salva (não altera o `id_professor`) |
| DELETE | `/api/jogos/{id_jogo}` | Apaga o histórico e depois o jogo |

Configuração por dificuldade (`CONFIG` no `main.py`): mínimo de 10 palavras e resposta de até 15 letras em todos os níveis.

| Dificuldade | Grade (linhas x colunas) | Máx. palavras | Direções |
|---|---|---|---|
| Fácil | 15 x 17 | 15 | direita e baixo |
| Médio | 15 x 21 | 20 | 8 direções |
| Difícil | 15 x 25 | 25 | 8 direções |

**Validações (erro 400):** dificuldade inexistente; quantidade de pares fora de 10 até o máximo do nível; par sem pergunta ou com resposta que não seja só letras (acentos aceitos); resposta com mais de 15 letras; palavras que não couberam na grade; erro genérico do banco ao salvar. A resposta é guardada com acento, mas entra na grade sem acento e em maiúsculas.

**Geração da grade:** as palavras são ordenadas da maior para a menor e posicionadas por sorteio de direção/linha/coluna (até 500 tentativas por palavra, até 50 grades). Podem se cruzar se a letra do cruzamento for igual. O resto é preenchido com letras aleatórias. Como é tudo sorteado, salvar de novo o mesmo jogo gera uma grade diferente.

```mermaid
flowchart TD
    A["Recebe as respostas<br/>(sem acento, MAIÚSCULAS)"] --> B["Cria matriz vazia<br/>e ordena palavras da maior pra menor"]
    B --> C["Sorteia direção, linha e coluna"]
    C --> D{"Cabe na grade e as casas<br/>estão vazias ou com a mesma letra?"}
    D -- "sim" --> E["Escreve a palavra"]
    D -- "não" --> F{"Restam tentativas?<br/>(500 por palavra)"}
    F -- "sim" --> C
    F -- "não" --> G{"Restam grades?<br/>(50 no total)"}
    G -- "sim" --> B
    G -- "não" --> H["Erro 400: não coube na grade"]
    E --> I{"Faltam palavras?"}
    I -- "sim" --> C
    I -- "não" --> J["Preenche vazios com letras A-Z aleatórias"]
```

## 8. Frontend (`frontend/`)

- `index.html`: todas as telas num arquivo só; cada uma é uma `div.screen`, e só a que tem `active` aparece. Telas: login, menu do professor, meus jogos, passos 1 a 4 da criação e preview.
- `script.js`: toda a lógica (troca de telas, chamadas à API, validações, desenho da grade em CSS Grid).
- `style.css`: visual (tons de bege, bordas pretas, sombra "dura" nos botões).

O `login()` guarda o id do usuário escolhido; se a opção contém "Professor", abre o menu, senão mostra um alerta de "em desenvolvimento".

**Regras duplicadas** entre frontend e backend (se mexer em uma, mexa na outra):

| Regra | Backend (`main.py`) | Frontend (`script.js`) |
|---|---|---|
| Máx. de palavras por nível | `CONFIG[...]["max_palavras"]` | `LIMITES` |
| Máx. de letras por resposta | `MAX_LETRAS` | `MAX_LETRAS` |
| Mínimo de palavras (10) | `MIN_PALAVRAS` | número fixo em `salvarJogo()` e no `index.html` |
| Direções das palavras | `_tentar_gerar` | `localizarPalavra` |

## 9. Fluxo: professor cria um caça-palavras

```mermaid
sequenceDiagram
    actor P as Professor
    participant F as Frontend (script.js)
    participant B as Backend (FastAPI)
    participant D as PostgreSQL

    P->>F: "Criar Novo Caça-Palavras"
    F->>B: GET /api/disciplinas
    B->>D: SELECT DISTINCT disciplina
    D-->>B: lista
    B-->>F: disciplinas (autocomplete)

    P->>F: Preenche disciplina e avança
    F->>B: GET /api/assuntos/disciplina
    B->>D: SELECT DISTINCT assunto
    D-->>B: lista
    B-->>F: assuntos (autocomplete)

    P->>F: Escolhe assunto e dificuldade
    loop Para cada par dica/resposta
        P->>F: Adicionar Par
        F->>F: Valida (letras, sem espaço, até 15, limite do nível)
    end

    P->>F: "Salvar Jogo!"
    F->>B: POST /api/jogos
    B->>B: validar_jogo() e gerar_matriz()
    alt Validação ou geração falhou
        B-->>F: 400 com detail
        F-->>P: alert("Erro ao salvar: ...")
    else Deu certo
        B->>D: INSERT INTO Caca_Palavras
        D-->>B: id_jogo (ou erro, ex.: UNIQUE)
        B-->>F: id_jogo e matriz (ou 400)
        F-->>P: Tela de preview
    end
```

<img width="1241" height="1755" alt="Diagrama de Casos de Uso - WordHunt_page-0001" src="https://github.com/user-attachments/assets/ae4115d2-eea5-40d7-8f4d-15cb7e0c5c5c" />

Resumo: o **Aluno** seleciona jogo (extensões: modo aleatório, filtrar por dificuldade, filtrar por tema), visualiza perfil e histórico, joga e se autentica; o **Professor** mantém caça-palavras, se autentica e joga; a **Lúdica** (externa) se liga à autenticação.

## 10. Deploy

O único modo de execução presente nos arquivos é o **Docker Compose** da seção 4. Em outra máquina, basta clonar e rodar os mesmos comandos, com as portas **80**, **8000** e **5432** livres.

Se for subir em outro lugar: o `API_URL` está fixo em `localhost`, as credenciais do banco estão no `docker-compose.yml`, o CORS está liberado para qualquer origem e a porta do Postgres está aberta.

## 11. Limitações e o que falta

**Ainda não implementado:** área do aluno (o login mostra "Área do aluno ainda em desenvolvimento!"); jogar o caça-palavras (inclusive o professor testar); pontuação e gravação em `Partida_Historico`; perfil e histórico; filtros e modo aleatório; integração com a Lúdica (hoje o login é a lista de usuários do `init.sql`).

**Divergências nos documentos:**
> Obs: Algumas regras foram alteradas durante o desenvolvimento do trabalho
- **RN09** diz máximo de 25 palavras. Hoje o sistema limita por dificuldade (15, 20 ou 25).
- **RN05** fala em filtrar por professor, disciplina e assunto. O diagrama de casos de uso mostra filtrar por dificuldade e por tema.
- **UC-02** está na lista de casos de uso mas não no diagrama desenhado.
- A **pontuação** (valor de acerto e erro) não está definida. O protótipo mostramos "Score: 5" e "Score: -5" só como exemplo.

**A melhorar:** a API não tem autenticação (qualquer requisição altera ou exclui qualquer jogo); a **RN07** é checada só no frontend (ignorando maiúsculas/minúsculas), e o banco só impede repetir a trinca exata disciplina + assunto + dificuldade.

---
