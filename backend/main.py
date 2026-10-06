import os
import random
import string
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2
from psycopg2.extras import RealDictCursor
import json
import unicodedata

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_URL = os.getenv("DATABASE_URL", "postgresql://admin:adminpassword@localhost:5432/wordhunt")

def get_db_connection():
    return psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)

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
    matriz = [['' for _ in range(colunas)] for _ in range(linhas)]
    direcoes = [(0, 1), (1, 0)]  # Regra: Fácil só direita e baixo
    if dificuldade != "Fácil":
        direcoes += [(1, 1), (-1, -1), (0, -1), (-1, 0), (1, -1), (-1, 1)]

    # palavras maiores primeiro: são as mais difíceis de encaixar
    for palavra in sorted(palavras, key=len, reverse=True):
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
                colocada = True
                break
        if not colocada:
            return None
    return matriz

def gerar_matriz(palavras_lista, dificuldade):
    cfg = CONFIG[dificuldade]
    linhas, colunas = cfg["linhas"], cfg["colunas"]
    # O backend tira acentos e espaços para a grade, deixando a lista original intacta
    palavras = [remover_acentos(p).upper().replace(" ", "") for p in palavras_lista]

    for _ in range(50):  # recomeça a grade se alguma palavra não coube
        matriz = _tentar_gerar(palavras, linhas, colunas, dificuldade)
        if matriz:
            # Preencher espaços vazios
            for r in range(linhas):
                for c in range(colunas):
                    if matriz[r][c] == '':
                        matriz[r][c] = random.choice(string.ascii_uppercase)
            return matriz
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
    validar_jogo(jogo)
    palavras = [pr["resposta"] for pr in jogo.perguntas_respostas]
    try:
        return gerar_matriz(palavras, jogo.dificuldade)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

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
    matriz = preparar_matriz(jogo)  # valida e gera a grade antes de abrir o banco
    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        cur.execute("""
            INSERT INTO Caca_Palavras (id_professor, disciplina, assunto, dificuldade, perguntas_respostas, matriz_letras)
            VALUES (%s, %s, %s, %s, %s, %s) RETURNING id_jogo;
        """, (jogo.id_professor, jogo.disciplina, jogo.assunto, jogo.dificuldade, json.dumps(jogo.perguntas_respostas), json.dumps(matriz)))
        
        id_jogo = cur.fetchone()['id_jogo']
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail="Erro ao salvar jogo. Verifique se o assunto já existe para esta disciplina.")
    finally:
        conn.close()
        
    return {"id_jogo": id_jogo, "matriz": matriz}

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
    cur.execute("SELECT id_jogo, disciplina, assunto, dificuldade FROM Caca_Palavras WHERE id_professor = %s ORDER BY id_jogo DESC;", (id_professor,))
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
    matriz = preparar_matriz(jogo)  # valida e gera a grade antes de abrir o banco
    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        cur.execute("""
            UPDATE Caca_Palavras 
            SET disciplina = %s, assunto = %s, dificuldade = %s, perguntas_respostas = %s, matriz_letras = %s
            WHERE id_jogo = %s;
        """, (jogo.disciplina, jogo.assunto, jogo.dificuldade, json.dumps(jogo.perguntas_respostas), json.dumps(matriz), id_jogo))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail="Erro ao atualizar jogo. Verifique os dados.")
    finally:
        conn.close()
        
    return {"id_jogo": id_jogo, "matriz": matriz}