import os
import re
import random
import secrets
import string
import time
from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2
from psycopg2 import errors as pg_errors
from psycopg2.extras import RealDictCursor
import json
import unicodedata

@asynccontextmanager
async def lifespan(app):
    preparar_banco()  # garante a coluna "codigo" (ver abaixo) antes de atender qualquer requisição
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_URL = os.getenv("DATABASE_URL", "postgresql://admin:adminpassword@localhost:5432/wordhunt")

def get_db_connection():
    return psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)

# ---------- Código do jogo ----------
# Cada caça-palavras tem um código curto e único, para o professor divulgar e o aluno digitar.
# O alfabeto não tem I, L, O, 0 e 1 (confundem na hora de digitar): 31 símbolos ^ 6 posições ≈ 887 milhões.
ALFABETO_CODIGO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
TAMANHO_CODIGO = 6
CONSTRAINT_CODIGO = "caca_palavras_codigo_key"  # nome que o Postgres dá ao UNIQUE da coluna "codigo"

def gerar_codigo():
    return "".join(secrets.choice(ALFABETO_CODIGO) for _ in range(TAMANHO_CODIGO))

def normalizar_codigo(texto):
    """O aluno pode digitar em minúsculas, com espaço ou com hífen (k7m-4qx): tudo vira K7M4QX."""
    return re.sub(r"[^A-Za-z0-9]", "", texto or "").upper()

def preparar_banco():
    """Cria a coluna "codigo" se ela ainda não existir e dá um código aos jogos que não têm.
    Roda sempre que o backend sobe e é segura para repetir. Por isso um banco já existente continua
    funcionando sem precisar de 'docker compose down -v'. (Num banco novo a coluna já vem do init.sql.)"""
    ultimo_erro = None
    for _ in range(40):  # o Postgres pode demorar alguns segundos para aceitar conexões
        try:
            conn = get_db_connection()
            break
        except psycopg2.OperationalError as e:
            ultimo_erro = e
            time.sleep(1.5)
    else:
        raise RuntimeError(f"Banco indisponível: {ultimo_erro}")
    try:
        cur = conn.cursor()
        cur.execute("ALTER TABLE Caca_Palavras ADD COLUMN IF NOT EXISTS codigo VARCHAR(8) UNIQUE;")
        cur.execute("SELECT id_jogo FROM Caca_Palavras WHERE codigo IS NULL;")
        sem_codigo = [r["id_jogo"] for r in cur.fetchall()]
        for id_jogo in sem_codigo:
            while True:  # tenta de novo no caso (raríssimo) de sortear um código que já existe
                codigo = gerar_codigo()
                cur.execute("SELECT 1 FROM Caca_Palavras WHERE codigo = %s;", (codigo,))
                if not cur.fetchone():
                    break
            cur.execute("UPDATE Caca_Palavras SET codigo = %s WHERE id_jogo = %s;", (codigo, id_jogo))
        cur.execute("ALTER TABLE Caca_Palavras ALTER COLUMN codigo SET NOT NULL;")
        conn.commit()
    finally:
        conn.close()

class JogoCreate(BaseModel):
    id_professor: int
    disciplina: str
    assunto: str
    dificuldade: str
    perguntas_respostas: list

# Configuração por dificuldade (tamanho da grade e máximo de palavras).
# Os máximos de palavras devem ser iguais a LIMITES em frontend/script.js.
CONFIG = {
    "Fácil":   {"linhas": 15, "colunas": 17, "max_palavras": 15},
    "Médio":   {"linhas": 15, "colunas": 21, "max_palavras": 20},
    "Difícil": {"linhas": 15, "colunas": 25, "max_palavras": 25},
}
MIN_PALAVRAS = 10
MAX_LETRAS = 15

def remover_acentos(texto):
    return ''.join(c for c in unicodedata.normalize('NFD', texto) if unicodedata.category(c) != 'Mn')

def _tentar_gerar(palavras, linhas, colunas, dificuldade):
    """Tenta encaixar todas as palavras. Devolve (matriz, posicoes) ou None se alguma não coube.
    posicoes[i] descreve onde a palavra i (na ordem original) foi colocada."""
    matriz = [['' for _ in range(colunas)] for _ in range(linhas)]
    posicoes = [None] * len(palavras)
    direcoes = [(0, 1), (1, 0)]  # Regra: Fácil só direita e baixo
    if dificuldade != "Fácil":
        direcoes += [(1, 1), (-1, -1), (0, -1), (-1, 0), (1, -1), (-1, 1)]

    # palavras maiores primeiro: são as mais difíceis de encaixar
    for idx in sorted(range(len(palavras)), key=lambda i: len(palavras[i]), reverse=True):
        palavra = palavras[idx]
        colocada = False
        for _ in range(500):
            dl, dc = random.choice(direcoes)
            linha = random.randint(0, linhas - 1)
            coluna = random.randint(0, colunas - 1)
            fim_l = linha + dl * (len(palavra) - 1)
            fim_c = coluna + dc * (len(palavra) - 1)
            if not (0 <= fim_l < linhas and 0 <= fim_c < colunas):
                continue
            if all(matriz[linha + dl * i][coluna + dc * i] in ('', ch)
                   for i, ch in enumerate(palavra)):
                for i, ch in enumerate(palavra):
                    matriz[linha + dl * i][coluna + dc * i] = ch
                # posição inicial (linha, coluna), passo por letra (dl, dc) e tamanho da palavra
                posicoes[idx] = {"linha": linha, "coluna": coluna, "dl": dl, "dc": dc, "tamanho": len(palavra)}
                colocada = True
                break
        if not colocada:
            return None
    return matriz, posicoes

def gerar_matriz(palavras_lista, dificuldade):
    """Devolve (matriz, posicoes). posicoes[i] é a posição da i-ésima palavra da lista recebida."""
    cfg = CONFIG[dificuldade]
    linhas, colunas = cfg["linhas"], cfg["colunas"]
    # O backend tira acentos e espaços para a grade, deixando a lista original intacta
    palavras = [remover_acentos(p).upper().replace(" ", "") for p in palavras_lista]

    for _ in range(50):  # recomeça a grade se alguma palavra não coube
        resultado = _tentar_gerar(palavras, linhas, colunas, dificuldade)
        if resultado:
            matriz, posicoes = resultado
            # Preencher espaços vazios
            for r in range(linhas):
                for c in range(colunas):
                    if matriz[r][c] == '':
                        matriz[r][c] = random.choice(string.ascii_uppercase)
            return matriz, posicoes
    raise ValueError("Não coube na grade. Reduza o número de palavras ou use palavras menores.")

def validar_jogo(jogo):
    cfg = CONFIG.get(jogo.dificuldade)
    if not cfg:
        raise HTTPException(status_code=400, detail="Dificuldade inválida.")
    pares = jogo.perguntas_respostas
    if not MIN_PALAVRAS <= len(pares) <= cfg["max_palavras"]:
        raise HTTPException(status_code=400,
            detail=f"No nível {jogo.dificuldade}, o jogo deve ter de {MIN_PALAVRAS} a {cfg['max_palavras']} palavras.")
    for p in pares:
        original = str(p.get("resposta", ""))
        resp = remover_acentos(original)  # acentos são aceitos; a grade usa a versão sem acento
        if not p.get("pergunta") or not (resp.isalpha() and resp.isascii()):
            raise HTTPException(status_code=400,
                detail="Cada par precisa de dica e de uma resposta só com letras (acentos são aceitos), sem espaços ou números.")
        if len(resp) > MAX_LETRAS:
            raise HTTPException(status_code=400,
                detail=f"A resposta '{original}' tem mais de {MAX_LETRAS} letras.")

def preparar_matriz(jogo):
    """Valida, gera a grade e devolve (matriz, pares). Cada par sai com a 'posicao' da resposta na grade
    (qualquer 'posicao' enviada pelo cliente é descartada: ela é sempre recalculada aqui)."""
    validar_jogo(jogo)
    palavras = [pr["resposta"] for pr in jogo.perguntas_respostas]
    try:
        matriz, posicoes = gerar_matriz(palavras, jogo.dificuldade)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    pares = [{"pergunta": pr["pergunta"], "resposta": pr["resposta"], "posicao": pos}
             for pr, pos in zip(jogo.perguntas_respostas, posicoes)]
    return matriz, pares

@app.get("/api/usuarios")
def get_usuarios():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM Usuario;")
    usuarios = cur.fetchall()
    conn.close()
    return usuarios

@app.post("/api/jogos")
def criar_jogo(jogo: JogoCreate):
    matriz, pares = preparar_matriz(jogo)  # valida e gera a grade antes de abrir o banco
    conn = get_db_connection()
    cur = conn.cursor()

    try:
        for _ in range(5):  # a cada tentativa um código novo; só repete se o código sorteado já existir
            codigo = gerar_codigo()
            try:
                cur.execute("""
                    INSERT INTO Caca_Palavras (id_professor, disciplina, assunto, dificuldade, perguntas_respostas, matriz_letras, codigo)
                    VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id_jogo;
                """, (jogo.id_professor, jogo.disciplina, jogo.assunto, jogo.dificuldade, json.dumps(pares), json.dumps(matriz), codigo))
                id_jogo = cur.fetchone()['id_jogo']
                conn.commit()
                break
            except pg_errors.UniqueViolation as e:
                conn.rollback()
                if e.diag.constraint_name != CONSTRAINT_CODIGO:
                    raise  # é a regra disciplina + assunto + dificuldade: cai no erro abaixo
        else:
            raise RuntimeError("Não foi possível gerar um código único.")
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail="Erro ao salvar jogo. Verifique se o assunto já existe para esta disciplina.")
    finally:
        conn.close()

    return {"id_jogo": id_jogo, "codigo": codigo, "matriz": matriz, "perguntas_respostas": pares}

# ---------- Filtros da área do aluno (RN05): professor, disciplina, assunto e dificuldade ----------
def _where_filtros(professor, disciplina, assunto, dificuldade, ignorar=None):
    """Monta o WHERE com os filtros informados. 'ignorar' tira um dos filtros (usado nas listas de opções)."""
    cond, params = [], []
    if professor is not None and ignorar != "professor":
        cond.append("c.id_professor = %s")
        params.append(professor)
    if disciplina and ignorar != "disciplina":
        cond.append("c.disciplina = %s")
        params.append(disciplina)
    if assunto and ignorar != "assunto":
        cond.append("c.assunto = %s")
        params.append(assunto)
    if dificuldade and ignorar != "dificuldade":
        cond.append("c.dificuldade = %s")
        params.append(dificuldade)
    return (" WHERE " + " AND ".join(cond)) if cond else "", params

def _validar_dificuldade(dificuldade):
    if dificuldade and dificuldade not in CONFIG:
        raise HTTPException(status_code=400, detail="Dificuldade inválida.")

@app.get("/api/filtros")
def get_filtros(professor: Optional[int] = None, disciplina: Optional[str] = None,
                assunto: Optional[str] = None, dificuldade: Optional[str] = None):
    """Opções dos quatro filtros, em cascata: cada lista respeita os OUTROS três filtros já escolhidos.
    Assim o aluno nunca monta uma combinação que não tem jogo."""
    _validar_dificuldade(dificuldade)
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        w, p = _where_filtros(professor, disciplina, assunto, dificuldade, ignorar="professor")
        cur.execute("SELECT DISTINCT u.id_ludica AS id, u.nametag AS nome FROM Caca_Palavras c "
                    "JOIN Usuario u ON u.id_ludica = c.id_professor" + w + " ORDER BY nome;", p)
        professores = cur.fetchall()

        w, p = _where_filtros(professor, disciplina, assunto, dificuldade, ignorar="disciplina")
        cur.execute("SELECT DISTINCT c.disciplina FROM Caca_Palavras c" + w + " ORDER BY c.disciplina;", p)
        disciplinas = [r["disciplina"] for r in cur.fetchall()]

        w, p = _where_filtros(professor, disciplina, assunto, dificuldade, ignorar="assunto")
        cur.execute("SELECT DISTINCT c.assunto FROM Caca_Palavras c" + w + " ORDER BY c.assunto;", p)
        assuntos = [r["assunto"] for r in cur.fetchall()]

        w, p = _where_filtros(professor, disciplina, assunto, dificuldade, ignorar="dificuldade")
        cur.execute("SELECT DISTINCT c.dificuldade FROM Caca_Palavras c" + w + ";", p)
        existentes = {r["dificuldade"] for r in cur.fetchall()}
        dificuldades = [d for d in CONFIG if d in existentes]  # sempre na ordem Fácil, Médio, Difícil
    finally:
        conn.close()
    return {"professores": professores, "disciplinas": disciplinas, "assuntos": assuntos, "dificuldades": dificuldades}

@app.get("/api/jogos")
def listar_jogos(professor: Optional[int] = None, disciplina: Optional[str] = None,
                 assunto: Optional[str] = None, dificuldade: Optional[str] = None, codigo: Optional[str] = None):
    """Lista os jogos que combinam com os filtros (todos opcionais). Só devolve dados de apresentação:
    as respostas e a grade só vêm em GET /api/jogos/{id}.
    Se vier 'codigo', a busca é só por ele (os outros filtros são ignorados): devolve 0 ou 1 jogo."""
    _validar_dificuldade(dificuldade)
    if codigo:
        w, p = " WHERE c.codigo = %s", [normalizar_codigo(codigo)]
    else:
        w, p = _where_filtros(professor, disciplina, assunto, dificuldade)
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT c.id_jogo, c.disciplina, c.assunto, c.dificuldade,
                   u.id_ludica AS id_professor, u.nametag AS professor,
                   jsonb_array_length(c.perguntas_respostas) AS qtd_palavras
            FROM Caca_Palavras c JOIN Usuario u ON u.id_ludica = c.id_professor
        """ + w + " ORDER BY c.disciplina, c.assunto, c.dificuldade;", p)
        jogos = cur.fetchall()
    finally:
        conn.close()
    return jogos

@app.get("/api/disciplinas")
def get_disciplinas_globais():
    conn = get_db_connection()
    cur = conn.cursor()
    # Busca todas as disciplinas criadas por qualquer professor
    cur.execute("SELECT DISTINCT disciplina FROM Caca_Palavras ORDER BY disciplina ASC;")
    disciplinas = [row['disciplina'] for row in cur.fetchall()]
    conn.close()
    return disciplinas

@app.get("/api/assuntos/{disciplina}")
def get_assuntos_globais(disciplina: str):
    conn = get_db_connection()
    cur = conn.cursor()
    # Busca todos os assuntos daquela disciplina criados por qualquer professor
    cur.execute("SELECT DISTINCT assunto FROM Caca_Palavras WHERE disciplina = %s ORDER BY assunto ASC;", (disciplina,))
    assuntos = [row['assunto'] for row in cur.fetchall()]
    conn.close()
    return assuntos

@app.get("/api/jogos/professor/{id_professor}")
def get_jogos_professor(id_professor: int):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT id_jogo, codigo, disciplina, assunto, dificuldade FROM Caca_Palavras WHERE id_professor = %s ORDER BY id_jogo DESC;", (id_professor,))
    jogos = cur.fetchall()
    conn.close()
    return jogos

@app.delete("/api/jogos/{id_jogo}")
def deletar_jogo(id_jogo: int):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM Partida_Historico WHERE id_jogo = %s;", (id_jogo,)) # Limpa histórico antes
    cur.execute("DELETE FROM Caca_Palavras WHERE id_jogo = %s;", (id_jogo,))
    conn.commit()
    conn.close()
    return {"status": "sucesso"}

@app.get("/api/jogos/{id_jogo}")
def get_jogo_detalhe(id_jogo: int):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM Caca_Palavras WHERE id_jogo = %s;", (id_jogo,))
    jogo = cur.fetchone()
    conn.close()
    if jogo:
        return jogo
    raise HTTPException(status_code=404, detail="Jogo não encontrado")

@app.put("/api/jogos/{id_jogo}")
def atualizar_jogo(id_jogo: int, jogo: JogoCreate):
    matriz, pares = preparar_matriz(jogo)  # valida e gera a grade antes de abrir o banco
    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        cur.execute("""
            UPDATE Caca_Palavras 
            SET disciplina = %s, assunto = %s, dificuldade = %s, perguntas_respostas = %s, matriz_letras = %s
            WHERE id_jogo = %s RETURNING codigo;
        """, (jogo.disciplina, jogo.assunto, jogo.dificuldade, json.dumps(pares), json.dumps(matriz), id_jogo))
        atualizado = cur.fetchone()  # o código NÃO muda ao editar: quem já recebeu o código continua achando o jogo
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail="Erro ao atualizar jogo. Verifique os dados.")
    finally:
        conn.close()
        
    if not atualizado:
        raise HTTPException(status_code=404, detail="Jogo não encontrado")
    return {"id_jogo": id_jogo, "codigo": atualizado["codigo"], "matriz": matriz, "perguntas_respostas": pares}
