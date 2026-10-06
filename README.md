# WordHunt

## Sobre o projeto

O WordHunt é um jogo educativo de caça-palavras desenvolvido na Disciplina "Projeto e construção de sistemas". O sistema tem como objetivo proporcionar uma forma interativa e digital de aprendizagem, permitindo que os alunos encontrem palavras relacionadas a determinado assunto de uma disciplina e associem cada palavra à sua respectiva pergunta.

O sistema possui dois tipos de usuários:

- **Aluno:** pode filtrar caça-palavras, selecionar e jogar o caça-palavras, associar a pergunta à respectiva palavra encontrada e consultar seu histórico de partidas.
- **Professor:** pode criar e gerenciar caça-palavras, cadastrar perguntas e palavras correspondentes, definir novas disciplinas e assuntos, configurar dificuldade e também poderá jogar para testar e visualizar o funcionamento dos jogos criados.

---

## Funcionalidades

### Aluno

- Selecionar um caça-palavras
- Filtrar jogos por professor, disciplina e assunto
- Utilizar o modo aleatório
- Encontrar palavras na matriz
- Associar palavras às respectivas perguntas
- Obter pontuação durante as partidas
- Consultar perfil e histórico de resultados

### Professor

- Criar, editar e excluir caça-palavras
- Cadastrar palavras e suas respectivas perguntas
- Definir disciplina, assunto e dificuldade do caça-palavras
- Visualizar seus caça-palavras
- Jogar os caça-palavras criados para testar e avaliar seu funcionamento

Obs: As partidas realizadas pelo professor têm finalidade de teste e visualização e não são consideradas para a pontuação do aluno nem enviadas à plataforma Lúdica.

---

## Tecnologias

Aplicação web em arquitetura cliente-servidor, executada com Docker (três containers na rede `wordhunt-net`):

| Container | Tecnologia | Função |
|---|---|---|
| `wordhunt_frontend` | HTML, CSS e JavaScript servidos pelo Nginx | Interface do professor (e, futuramente, do aluno) |
| `wordhunt_backend` | Python + FastAPI | API REST, regras de negócio e geração da grade |
| `wordhunt_db` | PostgreSQL 15 | Persistência (volume `wordhunt_db_data`) |

---

## Como executar

### Pré-requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop) (Windows/Mac) ou Docker Engine com Compose (Linux). Ele precisa estar aberto e iniciado ("Engine running").
- Git.

### Passo a passo

```bash
git clone <url-do-repositorio>
cd CacaPalavras-dev
docker compose up --build
```

Quando os logs mostrarem `database system is ready to accept connections` e `Uvicorn running on http://0.0.0.0:8000`, o sistema está pronto:

| Endereço | O que é |
|---|---|
| http://localhost | O jogo (interface) |
| http://localhost:8000/docs | Documentação interativa da API (Swagger) |

Para parar: `Ctrl+C` no terminal (ou `docker compose down`). Os jogos criados continuam salvos no volume do banco. Para subir novamente: `docker compose up`.

### Usuários de teste

O login ainda é simulado (a integração com a plataforma Lúdica virá em uma próxima etapa). A tela inicial lista os usuários cadastrados em `init.sql`: Prof. João (professor) e Aluno Maria (aluno). Por enquanto, apenas o fluxo do professor está disponível.

### Atualizar uma versão anterior / recriar o banco do zero

Depois de um `git pull`, use:

```bash
docker compose down -v
docker compose up --build
```

- `--build` reconstrói o backend (necessário quando o `main.py` muda).
- `-v` apaga o volume do banco e recria as tabelas a partir do `init.sql`. Use quando o `init.sql` ou o `docker-compose.yml` mudarem, ou para voltar ao banco limpo. **Todos os jogos salvos localmente serão perdidos**.
- Mudanças só em `frontend/` não exigem rebuild: basta recarregar a página (`Ctrl+F5`).

## Regras do jogo (visão do professor)

- Cada caça-palavras tem disciplina, assunto e dificuldade, e entre 10 e 25 pares pergunta-resposta (o máximo depende da dificuldade).
- Cada resposta é uma única palavra, com até 15 letras, sem espaços ou números. Acentos são aceitos (a grade os exibe sem acento).
- A grade é gerada automaticamente pelo sistema, o professor não escolhe as posições.

| Dificuldade | Grade (linhas x colunas) | Máximo de palavras | Direções das palavras |
|---|---|---|---|
| Fácil | 15 x 17 | 15 | direita e baixo |
| Médio | 15 x 21 | 20 | 8 direções |
| Difícil | 15 x 25 | 25 | 8 direções |

Se as palavras não couberem na grade (por exemplo, muitas palavras longas no nível Difícil), o sistema avisa e o professor pode remover ou encurtar alguma palavra.

Ao visualizar um jogo, o professor vê a lista de perguntas ao lado da grade e pode mostrar ou ocultar a posição das respostas (cada palavra em uma cor).

---

## Equipe
Projeto acadêmico desenvolvido por alunos do CEFET/RJ.

### Integrantes
- Clara Ribeiro Barreto
- Julia Iacovellis Pinho
- Kaio da Silva dos Santos
