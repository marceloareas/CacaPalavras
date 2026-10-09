# WordHunt: Manual do Usuário
Projeto da disciplina **Projeto e Construção de Sistemas** (CEFET/RJ).
Equipe: Clara Ribeiro Barreto, Julia Iacovellis Pinho e Kaio da Silva dos Santos.

## Status do projeto

O WordHunt está **em desenvolvimento**. Hoje funciona de ponta a ponta o **lado do professor** (criar, editar, excluir e visualizar caça-palavras). O **lado do aluno** (escolher jogo, jogar, pontuar, histórico) e a **integração com a Lúdica** estão previstos nos documentos, mas ainda não existem no código. Os manuais separam o que já funciona do que é planejado.

# Manual do Usuário

## 1. O que é

O WordHunt é um caça-palavras educativo. O professor monta o jogo com **dicas** e **respostas** (uma palavra cada) e o sistema espalha as respostas numa grade. A proposta é o aluno achar as palavras e ligar cada uma à pergunta certa.

| Perfil | O que pode fazer |
|---|---|
| **Professor** | Criar, editar, excluir e visualizar caça-palavras; definir disciplina, assunto e dificuldade; (previsto) jogar pra testar |
| **Aluno** | (previsto) Filtrar e selecionar jogos, usar o modo aleatório, jogar, pontuar e consultar perfil e histórico |

> Obs: **Hoje só o fluxo do professor está disponível.** Se entrar como aluno, o sistema avisa que a área está em desenvolvimento. As partidas do professor serão só de teste: não contam pontos de aluno nem vão para a Lúdica.

## 2. Como acessar

Abra **http://localhost** (com o sistema rodando), escolha um usuário na lista e clique em **Entrar no Sistema**. O login é **simulado**: aparecem usuários de teste ("Prof. Clara" e "Aluno Kaio"). A integração com a Lúdica virá depois.

## 3. Guia do Professor

O **Painel do Professor** tem: **Visualizar Meus Caça-Palavras**, **Criar Novo Caça-Palavras** e **Sair da Conta**.

### Criar um caça-palavras (4 passos, com barra de progresso)

1. **Disciplina:** digite ou escolha uma sugestão. Se digitar uma que já existe mudando só maiúsculas/minúsculas, o sistema usa a já cadastrada, pra não duplicar.
2. **Assunto:** mesma ideia, com sugestões dos assuntos daquela disciplina.
3. **Dificuldade:** Fácil, Médio ou Difícil (tabela abaixo).
4. **Palavras e dicas:** escreva a dica, escreva a resposta e clique em **Adicionar Par (OK)**. O contador mostra quantos pares você já tem. Use o símbolo de caneta para editar um par (depois **Salvar Alteração** ou **Cancelar edição**) e **X** para remover. Com pelo menos 10 pares, clique em **Salvar Jogo!**.

**Regras da resposta:** uma palavra só, sem espaços; só letras (sem números ou símbolos); acentos aceitos (na grade aparecem sem acento, ex.: "Xícara" vira XICARA). No máximo 15 letras.

| Dificuldade | Grade (linhas x colunas) | Máx. palavras | Direções |
|---|---|---|---|
| Fácil | 15 x 17 | 15 | Direita e para baixo |
| Médio | 15 x 21 | 20 | 8 direções (diagonais e de trás pra frente) |
| Difícil | 15 x 25 | 25 | 8 direções |

O mínimo é **10 palavras** em todos os níveis. Você não escolhe onde cada palavra fica, a grade é automática.

### Visualizar

Depois de salvar (ou ao clicar em **Visualizar** num jogo da lista) aparecem as **dicas numeradas** à esquerda e a **grade** à direita. O botão **Mostrar respostas na grade** pinta cada resposta de uma cor (a mesma cor aparece ao lado da dica). Só clicar de novo para ocultar.

### Meus caça-palavras

Lista os jogos que você criou (mais novos primeiro). Em cada um:
- **Visualizar:** abre o preview.
- **Editar:** abre os passos já preenchidos. Ao salvar, a grade é gerada de novo (as palavras mudam de lugar).
- **Excluir:** pede confirmação e apaga o jogo e o histórico dele. Não dá pra desfazer.

### Mensagens de erro

| Mensagem | O que fazer |
|---|---|
| "Por favor, preencha a disciplina/o assunto." | Preencher o campo |
| "Preencha dica e resposta. A resposta deve ser uma palavra única sem espaços." | Faltou dica/resposta, ou a resposta tem espaço |
| "A resposta deve ter apenas letras…" / "…no máximo 15 letras." | Tirar números e símbolos / usar palavra menor |
| "Máximo de X palavras atingido…" / "O nível Y permite no máximo X palavras…" | Remover pares ou mudar a dificuldade |
| "O sistema exige no mínimo 10 palavras cadastradas!" | Cadastrar mais pares |
| "Erro ao salvar: Não coube na grade…" | Remover ou encurtar alguma palavra |
| "Erro ao salvar: …Verifique se o assunto já existe para esta disciplina." | Provavelmente já existe um jogo com a mesma disciplina, assunto e dificuldade. Tem que mudar um dos três |
